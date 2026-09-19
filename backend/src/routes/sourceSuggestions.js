// ---------------------------------------------------------------------
// POST  /api/source-suggestions      — kaynak oner
// GET   /api/source-suggestions      — oneri listesi (?status=)
// PATCH /api/source-suggestions/:id  — durum degistir (beklemede|kabul|red)
//
// 'kabul' edilen oneri AYNI TRANSACTION icinde `sources` tablosuna da
// islenir. Ayni slug zaten varsa yeni kaynak ACILMAZ, yalnizca onerinin
// durumu guncellenir — aksi halde "Dünya Gazetesi" iki kez izlenir ve
// tekillestirme kumelerinde ayni haber iki bagimsiz kaynak gibi gorunup
// corroboration bilesenini sisirirdi.
// ---------------------------------------------------------------------
import { Router } from 'express';
import { query, queryOne, withTransaction } from '../lib/db.js';
import {
  ApiError, asyncHandler, normalizeHttpUrl, parseIdParam,
  parsePagination, pickFromAllowList, qs,
} from '../lib/http.js';
import { toIso } from '../lib/serialize.js';
import { slugifyTag } from '../services/llm.js';
import { SOURCE_TYPES, findSourceById, tenantKeyOf } from './sources.js';

const router = Router();

/** source_suggestions.status ENUM'u — allow-list. */
export const SUGGESTION_STATUSES = ['beklemede', 'kabul', 'red'];

const SUGGESTION_SELECT = `
  SELECT id, name, url, reason, submitted_by, source_type, status,
         created_at, reviewed_at
    FROM source_suggestions
`;

function serializeSuggestion(r) {
  if (!r) return null;
  return {
    id: Number(r.id),
    name: r.name,
    url: r.url,
    reason: r.reason ?? null,
    submitted_by: r.submitted_by ?? null,
    source_type: r.source_type ?? null,
    status: r.status,
    created_at: toIso(r.created_at),
    reviewed_at: toIso(r.reviewed_at),
  };
}

async function findSuggestionById(id) {
  return serializeSuggestion(await queryOne(`${SUGGESTION_SELECT} WHERE id = ? LIMIT 1`, [id]));
}

// --- POST /api/source-suggestions --------------------------------------
router.post('/', asyncHandler(async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  const name = String(body.name ?? '').trim();
  if (!name) throw ApiError.badRequest('Kaynak adı zorunludur');
  if (name.length > 190) throw ApiError.badRequest('Kaynak adı en fazla 190 karakter olabilir');

  const url = normalizeHttpUrl(body.url, { maxLength: 500 });
  if (!url) throw ApiError.badRequest('Geçerli bir http(s) adresi girilmelidir (url)');

  // source_type OPSIYONEL; verilmisse ENUM'dan biri olmak zorunda.
  let sourceType = null;
  if (body.source_type !== undefined && body.source_type !== null && body.source_type !== '') {
    sourceType = pickFromAllowList(body.source_type, SOURCE_TYPES);
    if (!sourceType) {
      throw ApiError.badRequest(
        `Geçersiz kaynak türü. Geçerli değerler: ${SOURCE_TYPES.join(', ')}`,
      );
    }
  }

  const reason = body.reason ? String(body.reason).slice(0, 5000) : null;
  const submittedBy = body.submitted_by ? String(body.submitted_by).trim().slice(0, 190) : null;

  // Ayni URL ikinci kez onerilirse 409 + mevcut kayit.
  const existingRow = await queryOne(`${SUGGESTION_SELECT} WHERE url = ? LIMIT 1`, [url]);
  if (existingRow) {
    return res.status(409).json({
      error: { code: 'CONFLICT', message: 'Bu adres daha önce önerilmiş' },
      data: serializeSuggestion(existingRow),
    });
  }

  let insertId;
  try {
    const result = await query(
      `INSERT INTO source_suggestions (name, url, reason, submitted_by, source_type, status)
       VALUES (?, ?, ?, ?, ?, 'beklemede')`,
      [name, url, reason, submittedBy, sourceType],
    );
    insertId = result.insertId;
  } catch (err) {
    // Es zamanli iki oneri yarisirsa UNIQUE anahtar bizi korur; yine 409.
    if (err?.code === 'ER_DUP_ENTRY') {
      const row = await queryOne(`${SUGGESTION_SELECT} WHERE url = ? LIMIT 1`, [url]);
      return res.status(409).json({
        error: { code: 'CONFLICT', message: 'Bu adres daha önce önerilmiş' },
        data: serializeSuggestion(row),
      });
    }
    throw err;
  }

  return res.status(201).json(await findSuggestionById(insertId));
}));

// --- GET /api/source-suggestions ---------------------------------------
router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);

  const where = [];
  const params = [];
  const status = pickFromAllowList(qs(req.query.status), SUGGESTION_STATUSES);
  if (status) { where.push('status = ?'); params.push(status); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRow = await queryOne(
    `SELECT COUNT(*) AS total FROM source_suggestions ${whereSql}`, params,
  );
  const total = Number(countRow?.total ?? 0);

  // Yeniden eskiye. LIMIT/OFFSET parsePagination'dan gecti (1..100).
  const rows = await query(
    `${SUGGESTION_SELECT} ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  res.json({
    data: rows.map(serializeSuggestion),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / (limit || 1))),
  });
}));

// --- PATCH /api/source-suggestions/:id ---------------------------------
router.patch('/:id', asyncHandler(async (req, res) => {
  const id = parseIdParam(req.params.id, 'Geçersiz öneri kimliği');
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  const status = pickFromAllowList(body.status, SUGGESTION_STATUSES);
  if (!status) {
    throw ApiError.badRequest(
      `Geçersiz durum. Geçerli değerler: ${SUGGESTION_STATUSES.join(', ')}`,
    );
  }

  const suggestion = await findSuggestionById(id);
  if (!suggestion) throw ApiError.notFound('Kaynak önerisi bulunamadı');

  // Kabul yolunda oneri + kaynak AYNI transaction icinde yazilir: kaynak
  // eklenemezse oneri 'kabul' isaretlenmis halde kalmaz.
  const sonuc = await withTransaction(async (conn) => {
    await conn.execute(
      // 'beklemede'ye geri alinirsa inceleme zamani da temizlenir.
      `UPDATE source_suggestions
          SET status = ?, reviewed_at = ${status === 'beklemede' ? 'NULL' : 'NOW()'}
        WHERE id = ?`,
      [status, id],
    );

    if (status !== 'kabul') return { sourceId: null, sourceCreated: false, sourceSlug: null };

    // slug: once addan, olmazsa URL host'undan uretilir.
    let slug = slugifyTag(suggestion.name);
    if (!slug) {
      try { slug = slugifyTag(new URL(suggestion.url).hostname.replace(/^www\./, '')); }
      catch { slug = ''; }
    }
    if (!slug) throw ApiError.badRequest('Öneriden kaynak kısa adı (slug) üretilemedi');

    const [dup] = await conn.execute('SELECT id FROM sources WHERE slug = ? LIMIT 1', [slug]);
    if (dup[0]) {
      // Kaynak zaten izleniyor: cift kayit acma, yalnizca durumu guncelledik.
      return { sourceId: Number(dup[0].id), sourceCreated: false, sourceSlug: slug };
    }

    const [ins] = await conn.execute(
      `INSERT INTO sources
         (slug, name, homepage_url, source_type, authority_weight, language, is_active)
       VALUES (?, ?, ?, ?, 50, 'tr', 1)`,
      [slug, suggestion.name, suggestion.url, suggestion.source_type || 'diger'],
    );
    return { sourceId: Number(ins.insertId), sourceCreated: true, sourceSlug: slug };
  });

  const updated = await findSuggestionById(id);
  const tenantKey = tenantKeyOf(req);
  res.json({
    ...updated,
    source_created: sonuc.sourceCreated,
    source: sonuc.sourceId ? await findSourceById(sonuc.sourceId, tenantKey) : null,
  });
}));

export default router;
