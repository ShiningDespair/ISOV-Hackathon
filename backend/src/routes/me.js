// ---------------------------------------------------------------------
// /api/me — OTURUM SAHIBININ KENDI VERISI
//
// HEPSI OTURUM ISTER (401). Panel kapali oldugu icin `requireAuth` router
// seviyesinde bir kez takiliyor; her ucta tek tek kontrol etmek, bir gun
// biri unuttugunda sessiz bir sizinti demek olurdu.
//
// TEK KURAL: KULLANICI VERISI SILINMEZ. "Gizle" bir damga yazar
// (`user_article_prefs.hidden_at`), haberi ya da kumeyi degistirmez; ayni
// haberi baska kullanici gormeye devam eder. Geri alma da ayni damgayi
// NULL'a ceker — kayit ve gerekce tarihcede kalir.
//
// Sozlesme: docs/CONTRACT.md -> "KULLANICI SISTEMI ve KISISELLESTIRME (v2)"
// ---------------------------------------------------------------------
import { Router } from 'express';
import { query, queryOne } from '../lib/db.js';
import {
  ApiError, asyncHandler, parseIdParam, parsePagination, pickFromAllowList, qs, toBool,
} from '../lib/http.js';
import { requireAuth, setViewCookie } from '../lib/session.js';
import { toIso } from '../lib/serialize.js';
import { layoutOf, viewOf, normalizePosition, normalizeTimeBudget, densityOf, POSITIONS, TIME_BUDGETS } from '../lib/positions.js';
import { NACE_SECTORS, sectorByCode } from '../lib/sectors.js';
import { buildDigest } from '../lib/summarize.js';
import { WEIGHTS, WEIGHTS_VERSION } from '../lib/personalRank.js';
import {
  buildProfileText, loadProfile, listPersonalized, profileHash, tagLabelMap, taxonomy,
} from '../services/personalize.js';
import { ARTICLE_COLUMNS, ARTICLE_FROM } from '../services/articleService.js';
import { serializeChangeRow, CHANGE_TYPE_LIST } from './changes.js';
import { buildFilters } from './articles.js';
import { tenantKeyOf } from './sources.js';

const router = Router();

// Tum /me uclari oturum ister.
router.use(requireAuth);

const REGIONS = ['KURESEL', 'TURKIYE', 'AMERIKA', 'AVRUPA', 'ASYA', 'DIGER'];
const HIDE_REASONS = [
  'alakasiz', 'sektorum-degil', 'zaten-biliyorum', 'cok-tekrar', 'kaynak-guvenilmez', 'diger',
];
const SHARE_CHANNELS = ['eposta', 'whatsapp', 'linkedin', 'x', 'pano', 'pdf'];
const NEWSLETTER_FREQ = ['kapali', 'gunluk', 'haftalik'];
const NEWSLETTER_FORMAT = ['ozet', 'tam'];
const BANDS = ['KRITIK', 'YUKSEK', 'ORTA', 'DUSUK'];
/** interest_tag_slugs / muted_tag_slugs ust siniri — profil metni sismesin. */
const MAX_TAGS = 25;
const MAX_SECONDARY_SECTORS = 6;

// =====================================================================
// GET/PUT /me/profile
// =====================================================================

function serializeProfile(profile) {
  const primary = sectorByCode(profile.primary_sector_code);
  return {
    position_code: profile.position_code,
    layout: layoutOf(profile.position_code),
    // Pozisyondan turetilen varsayilan gorunum — /auth/me'nin
    // `default_view` alani ile AYNI kaynak (lib/positions.js viewOf).
    // Kullanicinin acik secimini EZMEZ, yalnizca oneridir.
    //
    // `exists` KONTROLU SART: profil satiri yokken loadProfileRow()
    // EMPTY_PROFILE dondurur ve orada `position_code: 'ust-yonetim'`
    // yaziyor (form icin makul bir ON SECIM). O degeri dogrudan viewOf'a
    // vermek, hic profil doldurmamis kullaniciya 'gorsel' onerirdi ve
    // /auth/me'nin dondurdugu 'panel' ile CELISIRDI. Sapma-only ilkesi:
    // satir yoksa notr varsayilan.
    default_view: profile.exists === false ? 'panel' : viewOf(profile.position_code),
    time_budget_min: profile.time_budget_min,
    density: densityOf(profile.time_budget_min),
    primary_sector: primary ? { code: primary.code, label: primary.label } : null,
    secondary_sectors: (profile.secondary_sector_codes || [])
      .map((c) => sectorByCode(c))
      .filter(Boolean)
      .map((s) => ({ code: s.code, label: s.label })),
    region_focus: profile.region_focus || [],
    interest_tag_slugs: profile.interest_tag_slugs || [],
    muted_tag_slugs: profile.muted_tag_slugs || [],
    persona: profile.persona ?? null,
    // Anlamsal katmanin durumu KULLANICIYA GOSTERILIR: "bekliyor" iken
    // siralama semantik bilesen olmadan (taban 50) calisiyor ve bunu
    // saklamak, arayuzun olmayan bir ozelligi varmis gibi gostermesi olur.
    vector: {
      status: profile.profile_vector_status,
      model: profile.profile_vector_model,
      dim: profile.profile_vector_dim,
      built_at: toIso(profile.profile_vector_built_at),
    },
  };
}

router.get('/profile', asyncHandler(async (req, res) => {
  const profile = await loadProfile(req.user.id, tenantKeyOf(req));
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      full_name: req.user.full_name,
      title: req.user.title,
      role: req.user.role,
      tenant_key: req.user.tenant_key,
    },
    profile: serializeProfile(profile),
    weights: WEIGHTS,
    weights_version: WEIGHTS_VERSION,
    taxonomy: taxonomy(),
  });
}));

/** Gonderilen listeyi allow-list'ten suzer, tekilleştirir, sinirlar. */
function cleanList(value, { allowList = null, max = MAX_TAGS } = {}) {
  const raw = Array.isArray(value) ? value : (value === undefined || value === null ? [] : [value]);
  const out = [];
  for (const item of raw) {
    const s = String(item ?? '').trim();
    if (!s) continue;
    if (allowList && !allowList.includes(s)) continue;
    if (!out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/** Etiket slug bicimi — tags.slug ile ayni sozlesme (kucuk harf, tire). */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

router.put('/profile', asyncHandler(async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const before = await loadProfile(req.user.id, tenantKeyOf(req));

  const position = body.position_code === undefined
    ? before.position_code
    : normalizePosition(body.position_code);
  if (body.position_code !== undefined && !POSITIONS.includes(String(body.position_code))) {
    throw ApiError.badRequest(`Geçersiz pozisyon. Geçerli değerler: ${POSITIONS.join(', ')}`);
  }

  if (body.time_budget_min !== undefined
    && !TIME_BUDGETS.includes(Number(body.time_budget_min))) {
    throw ApiError.badRequest(`Vakit bütçesi ${TIME_BUDGETS.join(' / ')} dakikadan biri olmalı`);
  }
  const budget = body.time_budget_min === undefined
    ? before.time_budget_min
    : normalizeTimeBudget(body.time_budget_min);

  let primary = before.primary_sector_code;
  if (body.primary_sector_code !== undefined) {
    const code = body.primary_sector_code === null ? null : String(body.primary_sector_code).trim();
    if (code && !sectorByCode(code)) {
      throw ApiError.badRequest('Geçersiz NACE sektör kodu', {
        gecerli: NACE_SECTORS.map((s) => s.code),
      });
    }
    primary = code || null;
  }

  const secondary = body.secondary_sector_codes === undefined
    ? before.secondary_sector_codes
    : cleanList(body.secondary_sector_codes, {
      allowList: NACE_SECTORS.map((s) => s.code), max: MAX_SECONDARY_SECTORS,
    });

  const regions = body.region_focus === undefined
    ? before.region_focus
    : cleanList(body.region_focus, { allowList: REGIONS, max: REGIONS.length });

  const interests = body.interest_tag_slugs === undefined
    ? before.interest_tag_slugs
    : cleanList(body.interest_tag_slugs).filter((s) => SLUG_RE.test(s));
  const muted = body.muted_tag_slugs === undefined
    ? before.muted_tag_slugs
    : cleanList(body.muted_tag_slugs).filter((s) => SLUG_RE.test(s));

  let persona = before.persona;
  if (body.persona !== undefined) {
    persona = body.persona && typeof body.persona === 'object' ? body.persona : null;
  }

  const next = {
    position_code: position,
    time_budget_min: budget,
    primary_sector_code: primary,
    secondary_sector_codes: secondary,
    region_focus: regions,
    interest_tag_slugs: interests,
    muted_tag_slugs: muted,
    persona,
  };

  // PROFIL VEKTORU BURADA HESAPLANMAZ. `embed()`'in ilk cagrisi modeli
  // yukluyor (olculdu: 16,6 s sicak onbellekte; soguk onbellekte ~1,1 GB
  // indirme, EMBEDDING_LOAD_TIMEOUT_MS varsayilani 300.000 ms). Istek bunu
  // bekleyemez. Metin degistiyse durum 'bekliyor' yazilir, arka plan isi
  // (npm run profile-vectors) doldurur. Degismediyse mevcut vektor GECERLI
  // kalir ve gereksiz yeniden uretim olmaz.
  const labels = await tagLabelMap(interests);
  const text = buildProfileText(next, labels);
  const hash = profileHash(text);
  const vectorChanged = hash !== before.profile_hash;

  await query(
    `INSERT INTO user_profiles
       (user_id, position_code, time_budget_min, primary_sector_code,
        secondary_sector_codes, region_focus, interest_tag_slugs, muted_tag_slugs,
        persona, profile_hash, profile_vector_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       position_code = VALUES(position_code),
       time_budget_min = VALUES(time_budget_min),
       primary_sector_code = VALUES(primary_sector_code),
       secondary_sector_codes = VALUES(secondary_sector_codes),
       region_focus = VALUES(region_focus),
       interest_tag_slugs = VALUES(interest_tag_slugs),
       muted_tag_slugs = VALUES(muted_tag_slugs),
       persona = VALUES(persona),
       profile_hash = VALUES(profile_hash),
       profile_vector_status = VALUES(profile_vector_status)`,
    [
      req.user.id, next.position_code, next.time_budget_min, next.primary_sector_code,
      JSON.stringify(next.secondary_sector_codes), JSON.stringify(next.region_focus),
      JSON.stringify(next.interest_tag_slugs), JSON.stringify(next.muted_tag_slugs),
      next.persona ? JSON.stringify(next.persona) : null,
      hash,
      vectorChanged ? 'bekliyor' : (before.profile_vector_status === 'yok' ? 'bekliyor' : before.profile_vector_status),
    ],
  );

  const after = await loadProfile(req.user.id, tenantKeyOf(req));

  // GORUNUM CEREZI YENIDEN YAZILIR: pozisyon bu istekte degismis olabilir
  // ve `isov_view` girişte yazildigi degerde kalirsa, pozisyonu 'ust-yonetim'
  // yapan kullanici bir sonraki GIRISE kadar eski varsayilani gorurdu.
  //
  // Kullanicinin ACIK secimini ezmez: frontend once
  // `localStorage['isov:view']`e bakiyor, cerez yalnizca orasi bossa
  // devreye giriyor (docs/SADELESTIRME.md §3, Ajan A uygular). Backend'in
  // isi sadece cerezi dogru yazmak.
  setViewCookie(res, viewOf(after.position_code));

  res.json({
    profile: serializeProfile(after),
    profile_text: text,
    vector_queued: vectorChanged || before.profile_vector_status !== 'hazir',
  });
}));

// =====================================================================
// GET/PUT /me/newsletter
// =====================================================================

function serializeNewsletter(row) {
  if (!row) {
    return {
      frequency: 'haftalik', send_hour: 8, send_weekday: null, format: 'ozet',
      max_items: null, min_band: 'YUKSEK', only_changes: false, last_sent_at: null,
    };
  }
  return {
    frequency: row.frequency,
    send_hour: Number(row.send_hour),
    send_weekday: row.send_weekday === null ? null : Number(row.send_weekday),
    format: row.format,
    max_items: row.max_items === null ? null : Number(row.max_items),
    min_band: row.min_band,
    only_changes: Number(row.only_changes) === 1,
    last_sent_at: toIso(row.last_sent_at),
  };
}

router.get('/newsletter', asyncHandler(async (req, res) => {
  const row = await queryOne('SELECT * FROM user_newsletter_prefs WHERE user_id = ? LIMIT 1', [req.user.id]);
  res.json({ newsletter: serializeNewsletter(row), exists: Boolean(row) });
}));

router.put('/newsletter', asyncHandler(async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const current = serializeNewsletter(
    await queryOne('SELECT * FROM user_newsletter_prefs WHERE user_id = ? LIMIT 1', [req.user.id]),
  );

  const frequency = body.frequency === undefined ? current.frequency
    : pickFromAllowList(body.frequency, NEWSLETTER_FREQ);
  if (!frequency) throw ApiError.badRequest(`frequency ${NEWSLETTER_FREQ.join(' / ')} olmalı`);

  const format = body.format === undefined ? current.format
    : pickFromAllowList(body.format, NEWSLETTER_FORMAT);
  if (!format) throw ApiError.badRequest(`format ${NEWSLETTER_FORMAT.join(' / ')} olmalı`);

  const minBand = body.min_band === undefined ? current.min_band
    : pickFromAllowList(body.min_band, BANDS);
  if (!minBand) throw ApiError.badRequest(`min_band ${BANDS.join(' / ')} olmalı`);

  let hour = current.send_hour;
  if (body.send_hour !== undefined) {
    const n = Number(body.send_hour);
    if (!Number.isInteger(n) || n < 0 || n > 23) throw ApiError.badRequest('send_hour 0-23 arası olmalı');
    hour = n;
  }

  let weekday = current.send_weekday;
  if (body.send_weekday !== undefined) {
    if (body.send_weekday === null) weekday = null;
    else {
      const n = Number(body.send_weekday);
      if (!Number.isInteger(n) || n < 1 || n > 7) throw ApiError.badRequest('send_weekday 1-7 arası olmalı (1=Pazartesi)');
      weekday = n;
    }
  }
  // Haftalik secildi ama gun verilmediyse Pazartesi: "haftalik" diyen
  // kullanicinin bulteni hic gonderilmemesi kabul edilemez bir sessiz hata.
  if (frequency === 'haftalik' && weekday === null) weekday = 1;

  let maxItems = current.max_items;
  if (body.max_items !== undefined) {
    if (body.max_items === null) maxItems = null;
    else {
      const n = Number(body.max_items);
      if (!Number.isInteger(n) || n < 1 || n > 100) throw ApiError.badRequest('max_items 1-100 arası olmalı');
      maxItems = n;
    }
  }

  const onlyChanges = body.only_changes === undefined
    ? current.only_changes
    : toBool(body.only_changes) === true;

  await query(
    `INSERT INTO user_newsletter_prefs
       (user_id, frequency, send_hour, send_weekday, format, max_items, min_band, only_changes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       frequency = VALUES(frequency), send_hour = VALUES(send_hour),
       send_weekday = VALUES(send_weekday), format = VALUES(format),
       max_items = VALUES(max_items), min_band = VALUES(min_band),
       only_changes = VALUES(only_changes)`,
    [req.user.id, frequency, hour, weekday, format, maxItems, minBand, onlyChanges ? 1 : 0],
  );

  const row = await queryOne('SELECT * FROM user_newsletter_prefs WHERE user_id = ? LIMIT 1', [req.user.id]);
  res.json({ newsletter: serializeNewsletter(row) });
}));

// =====================================================================
// GET /me/changes — SON ZIYARETTEN BERI
// =====================================================================

/**
 * `since` verilmezse `users.prev_seen_at` kullanilir.
 *
 * NEDEN `last_seen_at` DEGIL: oturum orta katmani her istekte
 * `last_seen_at`i NOW()'a cekiyor. Onu esik almak "son ziyaretten beri"yi
 * DAIMA BOS dondururdu — kullanici kendi istegiyle esigi ileri itmis olur.
 * `prev_seen_at` bir onceki ziyaretin damgasi (30 dakikadan uzun ara yeni
 * ziyaret sayilir) ve dogru soruyu yanitlar.
 *
 * Hic ziyaret damgasi yoksa (ilk giris) son 7 gune duseriz: bos bir
 * "yenilikler" ekrani yerine anlamli bir baslangic penceresi.
 */
const FIRST_VISIT_WINDOW_DAYS = 7;

router.get('/changes', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const type = pickFromAllowList(req.query.type, CHANGE_TYPE_LIST);

  let since = null;
  const raw = qs(req.query.since);
  if (raw) {
    const d = new Date(raw.length === 10 ? `${raw}T00:00:00+03:00` : raw);
    if (Number.isNaN(d.getTime())) throw ApiError.badRequest('since geçerli bir tarih olmalı');
    since = d;
  } else if (req.user.prev_seen_at) {
    since = new Date(req.user.prev_seen_at);
  } else {
    since = new Date(Date.now() - FIRST_VISIT_WINDOW_DAYS * 86400000);
  }

  const where = ['ac.detected_at >= ?'];
  const params = [since];
  if (type) { where.push('ac.change_type = ?'); params.push(type); }
  // Gizlenen haberin degisikligi de gizlenir: kullanici "bu haberi gorme"
  // dedi, ayni haber degisiklik akisinda geri gelmemeli.
  where.push(`NOT EXISTS (
    SELECT 1 FROM user_article_prefs uap
     WHERE uap.article_id = ac.article_id AND uap.user_id = ? AND uap.hidden_at IS NOT NULL
  )`);
  params.push(req.user.id);
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const countRows = await query(
    `SELECT COUNT(*) AS total FROM article_changes ac ${whereSql}`, params,
  );
  const total = Number(countRows[0]?.total ?? 0);

  const rows = total === 0 ? [] : await query(
    `SELECT ac.id, ac.article_id, ac.thread_id, ac.change_type, ac.detail, ac.detected_at,
            a.title, a.importance_band, a.published_at, a.category,
            s.slug AS source_slug, s.name AS source_name,
            t.thread_key, t.label AS thread_label, t.ref_code, t.is_confirmed AS thread_confirmed
       FROM article_changes ac
       JOIN articles a ON a.id = ac.article_id
       JOIN sources s ON s.id = a.source_id
       LEFT JOIN topic_threads t ON t.id = ac.thread_id
       ${whereSql}
      ORDER BY ac.detected_at DESC, ac.id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  const counts = await query(
    `SELECT ac.change_type, COUNT(*) AS c FROM article_changes ac ${whereSql} GROUP BY ac.change_type`,
    params,
  );

  res.json({
    data: rows.map(serializeChangeRow),
    page, limit, total,
    totalPages: Math.max(1, Math.ceil(total / (limit || 1))),
    since: toIso(since),
    since_source: raw ? 'istek' : (req.user.prev_seen_at ? 'onceki-ziyaret' : 'ilk-giris'),
    counts: Object.fromEntries(counts.map((r) => [r.change_type, Number(r.c)])),
  });
}));

// =====================================================================
// GET /me/digest — VAKIT BUTCESINE GORE OZET PAKETI
//
// Vakit butcesi bir SUNUM karari: ayni kisisel siralamanin ilk N haberi,
// DENSITY'ye gore farkli yogunlukta. Ayri bir siralama YOK — iki ayri
// siralama iki ayri dogruluk kaynagi demek olurdu.
// =====================================================================

router.get('/digest', asyncHandler(async (req, res) => {
  const profile = await loadProfile(req.user.id, tenantKeyOf(req));
  const budget = req.query.time_budget === undefined
    ? profile.time_budget_min
    : normalizeTimeBudget(req.query.time_budget);
  const density = densityOf(budget);

  const { whereSql, params } = buildFilters(req, req.query, 'none');
  const out = await listPersonalized({
    whereSql, params, profile,
    page: 1, limit: density.items, offset: 0,
    reveal: false,
  });

  // Ozet kademeleri onceden uretilmis kolonlardan okunur; kolon bossa
  // lib/summarize.js anlik yardimciya duser (COALESCE mantiginin JS tarafi).
  const ids = out.data.map((a) => a.id);
  const stored = ids.length
    ? await query(
      `SELECT id, summary_short, summary_medium FROM articles WHERE id IN (${ids.map(() => '?').join(', ')})`,
      ids,
    )
    : [];
  const storedById = new Map(stored.map((r) => [Number(r.id), r]));
  const enriched = out.data.map((a) => ({
    ...a,
    summary_short: storedById.get(a.id)?.summary_short ?? null,
    summary_medium: storedById.get(a.id)?.summary_medium ?? null,
  }));

  const digest = buildDigest(enriched, budget);
  // Her kalem rozet/kaynak bilgisini de tasisin: arayuz ikinci istek atmasin.
  const metaById = new Map(out.data.map((a) => [a.id, a]));
  digest.items = digest.items.map((item) => {
    const a = metaById.get(item.id);
    return {
      ...item,
      importance_band: a?.importance_band ?? null,
      region: a?.region ?? null,
      category: a?.category ?? null,
      source: a?.source ?? null,
      published_at: a?.published_at ?? null,
      is_pinned: a?.is_pinned ?? 0,
    };
  });

  res.json({ ...digest, meta: out.meta });
}));

// =====================================================================
// PUT /me/articles/:id/{hide,read,share}
// =====================================================================

/** Satir yoksa acar, varsa gunceller. Tek yerde durur ki uc uc ayni sekilde yazsin. */
async function upsertPref(userId, articleId, sets, params) {
  const exists = await queryOne(
    'SELECT 1 AS x FROM articles WHERE id = ? LIMIT 1', [articleId],
  );
  if (!exists) throw ApiError.notFound('Haber bulunamadı');
  await query(
    `INSERT INTO user_article_prefs (user_id, article_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE user_id = user_id`,
    [userId, articleId],
  );
  await query(
    `UPDATE user_article_prefs SET ${sets} WHERE user_id = ? AND article_id = ?`,
    [...params, userId, articleId],
  );
  return queryOne(
    'SELECT * FROM user_article_prefs WHERE user_id = ? AND article_id = ? LIMIT 1',
    [userId, articleId],
  );
}

function serializePref(row) {
  if (!row) return null;
  return {
    article_id: Number(row.article_id),
    hidden: row.hidden_at !== null,
    hidden_at: toIso(row.hidden_at),
    hidden_reason: row.hidden_reason ?? null,
    hidden_note: row.hidden_note ?? null,
    read_at: toIso(row.read_at),
    read_seconds: row.read_seconds === null ? null : Number(row.read_seconds),
    shared_at: toIso(row.shared_at),
    share_count: Number(row.share_count),
    shared_channel: row.shared_channel ?? null,
  };
}

router.put('/articles/:id/hide', asyncHandler(async (req, res) => {
  const id = parseIdParam(req.params.id, 'Geçersiz haber kimliği');
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // `hidden` verilmezse gizleme kabul edilir (arayuzdeki "gizle" dugmesi
  // govde gondermeden cagirabiliyor); acikca false ise GERI ALINIR.
  const hidden = body.hidden === undefined ? true : toBool(body.hidden) !== false;

  let reason = null;
  if (hidden && body.reason !== undefined && body.reason !== null && body.reason !== '') {
    reason = pickFromAllowList(body.reason, HIDE_REASONS);
    if (!reason) {
      throw ApiError.badRequest('Geçersiz gerekçe', { gecerli: HIDE_REASONS });
    }
  }
  const note = hidden ? String(body.note ?? '').trim().slice(0, 200) || null : null;

  // VERI SILINMEZ: damga NULL'a cekilir, gerekce ve not korunur ki
  // "neden gizlemistim" sorusu sonradan yanitlanabilsin.
  const row = hidden
    ? await upsertPref(req.user.id, id,
      'hidden_at = NOW(), hidden_reason = ?, hidden_note = ?', [reason, note])
    : await upsertPref(req.user.id, id, 'hidden_at = NULL', []);

  res.json({ pref: serializePref(row), hidden: row.hidden_at !== null });
}));

router.put('/articles/:id/read', asyncHandler(async (req, res) => {
  const id = parseIdParam(req.params.id, 'Geçersiz haber kimliği');
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  let seconds = null;
  if (body.seconds !== undefined && body.seconds !== null && body.seconds !== '') {
    const n = Number(body.seconds);
    if (!Number.isFinite(n) || n < 0) throw ApiError.badRequest('seconds negatif olamaz');
    // smallint unsigned tavani: 18 saatten uzun "okuma" veri hatasi.
    seconds = Math.min(65535, Math.round(n));
  }

  // read_at ILK okumada sabitlenir (COALESCE): "ilk ne zaman okudu"
  // sorusu, "en son ne zaman actı"dan daha bilgilendirici ve
  // source_affinity sayimi tekrar aclislarla sismez.
  const row = await upsertPref(req.user.id, id,
    'read_at = COALESCE(read_at, NOW()), read_seconds = COALESCE(?, read_seconds)', [seconds]);
  res.json({ pref: serializePref(row) });
}));

router.put('/articles/:id/share', asyncHandler(async (req, res) => {
  const id = parseIdParam(req.params.id, 'Geçersiz haber kimliği');
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const channel = pickFromAllowList(body.channel, SHARE_CHANNELS);
  if (!channel) throw ApiError.badRequest('Geçersiz paylaşım kanalı', { gecerli: SHARE_CHANNELS });

  const row = await upsertPref(req.user.id, id,
    // share_count tinyint unsigned: 255'te doyar, tasmaz.
    'shared_at = NOW(), shared_channel = ?, share_count = LEAST(255, share_count + 1)', [channel]);
  res.json({ pref: serializePref(row) });
}));

// =====================================================================
// GET /me/articles/hidden — gizlenenler (geri alma ekrani icin)
// =====================================================================

router.get('/articles/hidden', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const countRows = await query(
    `SELECT COUNT(*) AS total FROM user_article_prefs
      WHERE user_id = ? AND hidden_at IS NOT NULL`, [req.user.id],
  );
  const total = Number(countRows[0]?.total ?? 0);
  const rows = total === 0 ? [] : await query(
    `SELECT ${ARTICLE_COLUMNS}, uap.hidden_at, uap.hidden_reason, uap.hidden_note
     ${ARTICLE_FROM}
     JOIN user_article_prefs uap ON uap.article_id = a.id AND uap.user_id = ?
     WHERE uap.hidden_at IS NOT NULL
     ORDER BY uap.hidden_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    [req.user.id],
  );
  res.json({
    data: rows.map((r) => ({
      id: Number(r.id),
      title: r.title,
      importance_band: r.importance_band,
      published_at: toIso(r.published_at),
      source: r.source_slug ? { slug: r.source_slug, name: r.source_name } : null,
      hidden_at: toIso(r.hidden_at),
      hidden_reason: r.hidden_reason ?? null,
      hidden_note: r.hidden_note ?? null,
    })),
    page, limit, total,
    totalPages: Math.max(1, Math.ceil(total / (limit || 1))),
  });
}));

// =====================================================================
// PUT/DELETE /me/threads/:id/follow — dosya takibi
// =====================================================================

router.put('/threads/:id/follow', asyncHandler(async (req, res) => {
  const id = parseIdParam(req.params.id, 'Geçersiz dosya kimliği');
  const thread = await queryOne('SELECT id FROM topic_threads WHERE id = ? LIMIT 1', [id]);
  if (!thread) throw ApiError.notFound('Dosya bulunamadı');
  await query(
    `INSERT INTO user_thread_follows (user_id, thread_id, source) VALUES (?, ?, 'elle')
     ON DUPLICATE KEY UPDATE source = VALUES(source)`,
    [req.user.id, id],
  );
  res.json({ thread_id: id, following: true });
}));

router.delete('/threads/:id/follow', asyncHandler(async (req, res) => {
  const id = parseIdParam(req.params.id, 'Geçersiz dosya kimliği');
  await query('DELETE FROM user_thread_follows WHERE user_id = ? AND thread_id = ?', [req.user.id, id]);
  res.json({ thread_id: id, following: false });
}));

export default router;
