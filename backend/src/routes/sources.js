// ---------------------------------------------------------------------
// GET   /api/sources              — kaynaklar + haber sayilari + is_watched
// POST  /api/sources              — yeni kaynak ekle
// PATCH /api/sources/:id          — yonetici alanlari (name, authority_weight)
// PUT   /api/sources/:id/watch    — KIRACI izleme tercihi (tek kaynak)
// PUT   /api/sources/watch/bulk   — KIRACI izleme tercihi (toplu)
//
// ------------------------- IZLEME MODELI -----------------------------
// Sistem COK KIRACILI dusunulmustur ve iki katman vardir:
//
//   GLOBAL KATMAN (paylasilan, kalici): `sources` tablosu ve toplama.
//   Toplama HICBIR ZAMAN durmaz ve haber verisi HICBIR KOSULDA silinmez —
//   bir kiracinin izlemek istemedigi kaynagi baska bir kiraci izliyor
//   olabilir. `sources.is_active` yalnizca YONETICI duzeyinde "bu kaynak
//   artik hic taranmiyor" (or. site kapandi) anlamina gelir; panel
//   arayuzunden DEGISTIRILMEZ, bu yuzden PATCH govdesinden kabul edilmez.
//
//   KIRACI KATMANI (panelde izleme): `tenant_source_prefs`. Yalnizca
//   SAPMALAR yazilir — kayit yoksa varsayilan "izleniyor". Haber listesi
//   `?watched_only=1&tenant_key=...` ile suzulur; kapatilan kaynagin
//   haberleri SILINMEZ, yalnizca o kiracinin gorunumunde gizlenir.
//
// Kimlik dogrulama henuz yok; `tenant_key` istekten gelir, yoksa 'isov'.
// ---------------------------------------------------------------------
import { Router } from 'express';
import { query, queryOne, withTransaction } from '../lib/db.js';
import {
  ApiError, asyncHandler, normalizeHttpUrl, parseIdParam,
  pickFromAllowList, qs, toBool,
} from '../lib/http.js';
import { toIso } from '../lib/serialize.js';
import { slugifyTag } from '../services/llm.js';
// Ayni site kontrolu icin tekillestirmenin URL normalizasyonu yeniden kullanilir.
import { normalizeUrl } from '../lib/dedup.js';

const router = Router();

/** sources.source_type ENUM'u ile birebir — allow-list olarak kullaniliyor. */
export const SOURCE_TYPES = ['mevzuat', 'kurum', 'acik_veri', 'basin', 'uluslararasi', 'diger'];

/** Kimlik dogrulama eklenene kadar tek kiraci. */
export const DEFAULT_TENANT = 'isov';

/** Istekten kiraci anahtari: query, govde veya baslik; yoksa 'isov'. */
export function tenantKeyOf(req) {
  const raw = qs(req.query?.tenant_key)
    || (req.body && typeof req.body === 'object' ? req.body.tenant_key : undefined)
    || req.get?.('x-tenant-key');
  const s = String(raw ?? '').trim();
  if (!s) return DEFAULT_TENANT;
  if (s.length > 64) throw ApiError.badRequest('Kiracı anahtarı en fazla 64 karakter olabilir');
  return s;
}

/** Kaynak satirinin API sekli. */
function serializeSourceRow(r) {
  return {
    id: Number(r.id),
    slug: r.slug,
    name: r.name,
    homepage_url: r.homepage_url,
    feed_url: r.feed_url,
    source_type: r.source_type,
    authority_weight: Number(r.authority_weight),
    country_code: r.country_code,
    language: r.language,
    // Yonetici duzeyi: "bu kaynak hic taraniyor mu". Panel bunu degistirmez.
    is_active: Boolean(r.is_active),
    // Kiraci duzeyi: "bu kiracinin panelinde gosteriliyor mu".
    // Tercih kaydi yoksa varsayilan TRUE (hicbir sey secmemis kiraci hepsini gorur).
    is_watched: r.is_watched === null || r.is_watched === undefined ? true : Boolean(r.is_watched),
    last_fetched_at: toIso(r.last_fetched_at),
    article_count: Number(r.article_count ?? 0),
    unique_count: Number(r.unique_count ?? 0),
    last_published_at: toIso(r.last_published_at),
  };
}

/**
 * Ortak SELECT. Ilk parametre DAIMA tenant_key olur (LEFT JOIN icinde).
 * LEFT JOIN: tercih kaydi olmayan kaynakta is_watched NULL gelir ve
 * serializer bunu "izleniyor" olarak yorumlar.
 */
const SOURCE_SELECT = `
  SELECT s.id, s.slug, s.name, s.homepage_url, s.feed_url, s.source_type,
         s.authority_weight, s.country_code, s.language, s.is_active,
         s.last_fetched_at, tsp.is_watched,
         COUNT(a.id) AS article_count,
         SUM(CASE WHEN a.is_duplicate = 0 THEN 1 ELSE 0 END) AS unique_count,
         MAX(a.published_at) AS last_published_at
    FROM sources s
    LEFT JOIN tenant_source_prefs tsp
           ON tsp.source_id = s.id AND tsp.tenant_key = ?
    LEFT JOIN articles a ON a.source_id = s.id
`;

/** Tek kaynagi kiraci tercihiyle birlikte getirir. */
async function findSourceById(id, tenantKey = DEFAULT_TENANT) {
  const row = await queryOne(`${SOURCE_SELECT} WHERE s.id = ? GROUP BY s.id, tsp.is_watched`, [tenantKey, id]);
  return row ? serializeSourceRow(row) : null;
}

async function findSourceBySlug(slug, tenantKey = DEFAULT_TENANT) {
  const row = await queryOne(`${SOURCE_SELECT} WHERE s.slug = ? GROUP BY s.id, tsp.is_watched`, [tenantKey, slug]);
  return row ? serializeSourceRow(row) : null;
}

/**
 * Ayni siteye ikinci kayit acilmasini onler.
 *
 * Slug kontrolu yetmiyor: "T.C. Resmî Gazete" -> `t-c-resmi-gazete` ile
 * mevcut `resmi-gazete` kaydindan farkli slug uretiyor ve ayni siteye ikinci
 * kaynak aciliyordu (canli veride bir kez oldu).
 *
 * Karsilastirma dedup.js'teki normalizeUrl ile yapilir - protokol, www ve
 * sondaki egik cizgi farkini yutar, boylece "https://www.resmigazete.gov.tr/"
 * ile "https://resmigazete.gov.tr" ayni sayilir. Tekillestirmede kullanilan
 * normalizasyonun aynisini kullanmak onemli: iki ayri kural iki ayri
 * "ayni site" tanimi demek olurdu.
 */
async function findSourceByHomepage(homepageUrl, tenantKey = DEFAULT_TENANT) {
  if (!homepageUrl) return null;
  const target = normalizeUrl(homepageUrl);
  if (!target) return null;
  const rows = await query(
    `${SOURCE_SELECT} WHERE s.homepage_url IS NOT NULL GROUP BY s.id, tsp.is_watched`,
    [tenantKey],
  );
  const hit = rows.find((r) => normalizeUrl(r.homepage_url) === target);
  return hit ? serializeSourceRow(hit) : null;
}

// --- GET /api/sources --------------------------------------------------
router.get('/', asyncHandler(async (req, res) => {
  const tenantKey = tenantKeyOf(req);
  const where = [];
  const params = [tenantKey];

  const type = pickFromAllowList(req.query.source_type ?? req.query.type, SOURCE_TYPES);
  if (type) { where.push('s.source_type = ?'); params.push(type); }

  // ?active=0/1 — YONETICI durumu (taraniyor mu).
  const activeParam = toBool(qs(req.query.active));
  if (activeParam !== undefined) {
    where.push('s.is_active = ?');
    params.push(activeParam ? 1 : 0);
  }

  // ?watched=0/1 — KIRACI tercihi. Kayit yoklugu "izleniyor" demek oldugu
  // icin NULL kontrolu acikca yaziliyor.
  const watchedParam = toBool(qs(req.query.watched));
  if (watchedParam === true) where.push('(tsp.is_watched IS NULL OR tsp.is_watched = 1)');
  if (watchedParam === false) where.push('tsp.is_watched = 0');

  const rows = await query(
    `${SOURCE_SELECT}
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     GROUP BY s.id, tsp.is_watched
     ORDER BY s.authority_weight DESC, s.name ASC`,
    params,
  );

  res.json({
    data: rows.map(serializeSourceRow),
    total: rows.length,
    tenant_key: tenantKey,
  });
}));

// --- POST /api/sources -------------------------------------------------
router.post('/', asyncHandler(async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const tenantKey = tenantKeyOf(req);

  const name = String(body.name ?? '').trim();
  if (!name) throw ApiError.badRequest('Kaynak adı zorunludur');
  if (name.length > 190) throw ApiError.badRequest('Kaynak adı en fazla 190 karakter olabilir');

  const homepageUrl = normalizeHttpUrl(body.homepage_url);
  if (!homepageUrl) {
    throw ApiError.badRequest('Geçerli bir http(s) adresi girilmelidir (homepage_url)');
  }

  // source_type ENUM'dan biri olmak zorunda; bilinmeyen deger sessizce
  // 'diger'e dusmez, cunku kaynak ailesi otorite/rapor gruplamasini etkiler.
  const sourceType = pickFromAllowList(body.source_type, SOURCE_TYPES);
  if (!sourceType) {
    throw ApiError.badRequest(
      `Geçersiz kaynak türü. Geçerli değerler: ${SOURCE_TYPES.join(', ')}`,
    );
  }

  // slug verilmediyse addan uretilir (Türkçe karakterler ASCII'ye katlanir).
  const slug = slugifyTag(body.slug ? String(body.slug) : name);
  if (!slug) throw ApiError.badRequest('Kaynak kısa adı (slug) üretilemedi, açıkça belirtin');

  const existing = await findSourceBySlug(slug, tenantKey);
  if (existing) {
    // Cift kayit acmiyoruz; mevcut kaydi da dondurerek istemciye ne
    // yapacagina karar verme sansi veriyoruz.
    return res.status(409).json({
      error: { code: 'CONFLICT', message: `Bu kısa ad (slug) zaten kullanılıyor: ${slug}` },
      data: existing,
    });
  }

  const sameSite = await findSourceByHomepage(homepageUrl, tenantKey);
  if (sameSite) {
    return res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: `Bu adres zaten kayıtlı: ${sameSite.name}`,
      },
      data: sameSite,
    });
  }

  const feedUrl = body.feed_url ? normalizeHttpUrl(body.feed_url) : null;
  if (body.feed_url && !feedUrl) {
    throw ApiError.badRequest('Geçerli bir http(s) besleme adresi girilmelidir (feed_url)');
  }

  let authority = 50;
  if (body.authority_weight !== undefined && body.authority_weight !== null && body.authority_weight !== '') {
    const n = Number(body.authority_weight);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw ApiError.badRequest('Otorite ağırlığı 0 ile 100 arasında olmalıdır');
    }
    authority = Math.round(n);
  }

  const countryCode = body.country_code
    ? String(body.country_code).trim().slice(0, 2).toUpperCase() : null;
  const language = String(body.language ?? 'tr').trim().slice(0, 5) || 'tr';

  // is_active govdeden ALINMAZ: yeni kaynak daima taranir (global katman).
  const result = await query(
    `INSERT INTO sources
       (slug, name, homepage_url, feed_url, source_type, authority_weight,
        country_code, language, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [slug, name, homepageUrl, feedUrl, sourceType, authority, countryCode, language],
  );

  return res.status(201).json(await findSourceById(result.insertId, tenantKey));
}));

// --- PATCH /api/sources/:id -------------------------------------------
/**
 * Guncellenebilir alanlar ALLOW-LIST. SQL'e giren kolon adi daima bu
 * tablodan gelir; istemcinin gonderdigi anahtar asla SQL'e birlestirilmez.
 *
 * `is_active` KASITLI OLARAK YOK: kaynagin taranip taranmamasi yonetici
 * kararidir ve paylasilan veri katmanini ilgilendirir. Panelden "izlemeyi
 * birak" istegi PUT /sources/:id/watch ucuna gider.
 */
const PATCHABLE = {
  authority_weight: (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw ApiError.badRequest('Otorite ağırlığı 0 ile 100 arasında olmalıdır');
    }
    return Math.round(n);
  },
  name: (value) => {
    const s = String(value ?? '').trim();
    if (!s) throw ApiError.badRequest('Kaynak adı boş olamaz');
    if (s.length > 190) throw ApiError.badRequest('Kaynak adı en fazla 190 karakter olabilir');
    return s;
  },
};

router.patch('/:id', asyncHandler(async (req, res) => {
  const id = parseIdParam(req.params.id, 'Geçersiz kaynak kimliği');
  const tenantKey = tenantKeyOf(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // Sessizce yoksaymak yerine acikca reddediyoruz: istemci yanlis uca
  // gittigini ogrenmeli, "kaydettim ama degismedi" durumu olusmamali.
  if (Object.prototype.hasOwnProperty.call(body, 'is_active')) {
    throw ApiError.badRequest(
      'is_active bu uçtan değiştirilemez; panelde izlemeyi durdurmak için PUT /api/sources/:id/watch kullanın',
    );
  }
  if (Object.prototype.hasOwnProperty.call(body, 'is_watched')) {
    throw ApiError.badRequest('İzleme tercihi için PUT /api/sources/:id/watch kullanın');
  }

  const setParts = [];
  const params = [];
  for (const [column, dogrula] of Object.entries(PATCHABLE)) {
    if (!Object.prototype.hasOwnProperty.call(body, column)) continue;
    setParts.push(`${column} = ?`); // kolon adi allow-list'ten, govdeden degil
    params.push(dogrula(body[column]));
  }

  if (setParts.length === 0) {
    throw ApiError.badRequest(
      `Güncellenecek alan yok. Kabul edilen alanlar: ${Object.keys(PATCHABLE).join(', ')}`,
    );
  }

  const current = await queryOne('SELECT id FROM sources WHERE id = ? LIMIT 1', [id]);
  if (!current) throw ApiError.notFound('Kaynak bulunamadı');

  params.push(id);
  await query(`UPDATE sources SET ${setParts.join(', ')} WHERE id = ?`, params);

  res.json(await findSourceById(id, tenantKey));
}));

// --- PUT /api/sources/watch/bulk --------------------------------------
// DIKKAT: '/watch/bulk' rotasi '/:id/watch'tan ONCE tanimlanmali; aksi
// halde ':id' = 'watch' eslesmesi bu yolu yutar.
router.put('/watch/bulk', asyncHandler(async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const tenantKey = tenantKeyOf(req);

  const isWatched = toBool(body.is_watched);
  if (isWatched === undefined) {
    throw ApiError.badRequest('is_watched true veya false olmalıdır');
  }

  if (!Array.isArray(body.source_ids)) {
    throw ApiError.badRequest('source_ids bir dizi olmalıdır');
  }
  const ids = [...new Set(
    body.source_ids.map((x) => Number.parseInt(String(x), 10)).filter((n) => Number.isFinite(n) && n > 0),
  )];
  if (ids.length === 0) throw ApiError.badRequest('En az bir geçerli kaynak kimliği gönderilmelidir');
  // 81 kaynak var; tavan cok uzakta ama sinirsiz govde kabul etmiyoruz.
  if (ids.length > 1000) throw ApiError.badRequest('Tek istekte en fazla 1000 kaynak gönderilebilir');

  // Var olmayan kimlikler sessizce dusurulur; FK hatasi yerine rapor.
  const placeholdersSql = ids.map(() => '?').join(', ');
  const found = await query(`SELECT id FROM sources WHERE id IN (${placeholdersSql})`, ids);
  const validIds = found.map((r) => Number(r.id));
  const missing = ids.filter((id) => !validIds.includes(id));
  if (validIds.length === 0) throw ApiError.notFound('Verilen kimliklerle eşleşen kaynak yok');

  await withTransaction(async (conn) => {
    // Toplu upsert: tek sorgu, kaynak basina tek satir.
    const values = validIds.map(() => '(?, ?, ?)').join(', ');
    const params = [];
    for (const id of validIds) params.push(tenantKey, id, isWatched ? 1 : 0);
    await conn.execute(
      `INSERT INTO tenant_source_prefs (tenant_key, source_id, is_watched)
       VALUES ${values}
       ON DUPLICATE KEY UPDATE is_watched = VALUES(is_watched)`,
      params,
    );
  });

  const rows = await query(
    `${SOURCE_SELECT} WHERE s.id IN (${validIds.map(() => '?').join(', ')})
     GROUP BY s.id, tsp.is_watched
     ORDER BY s.authority_weight DESC, s.name ASC`,
    [tenantKey, ...validIds],
  );

  res.json({
    data: rows.map(serializeSourceRow),
    updated: validIds.length,
    missing_ids: missing,
    is_watched: isWatched,
    tenant_key: tenantKey,
  });
}));

// --- PUT /api/sources/:id/watch ---------------------------------------
router.put('/:id/watch', asyncHandler(async (req, res) => {
  const id = parseIdParam(req.params.id, 'Geçersiz kaynak kimliği');
  const tenantKey = tenantKeyOf(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  const isWatched = toBool(body.is_watched);
  if (isWatched === undefined) {
    throw ApiError.badRequest('is_watched true veya false olmalıdır');
  }

  const current = await queryOne('SELECT id FROM sources WHERE id = ? LIMIT 1', [id]);
  if (!current) throw ApiError.notFound('Kaynak bulunamadı');

  await query(
    `INSERT INTO tenant_source_prefs (tenant_key, source_id, is_watched)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE is_watched = VALUES(is_watched)`,
    [tenantKey, id, isWatched ? 1 : 0],
  );

  res.json(await findSourceById(id, tenantKey));
}));

export { findSourceById, findSourceBySlug, serializeSourceRow, SOURCE_SELECT };
export default router;
