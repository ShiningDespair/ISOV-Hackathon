// ---------------------------------------------------------------------
// /api/changes — DEGISIKLIK AKISI
//
// Veri `article_changes` tablosundan gelir; YAZMA burada DEGIL, hattin 4.
// adiminda (`services/changeLog.js`). Bu dosya yalnizca okur.
//
// OTURUM: bu uc oturum ISTEMEZ. Icerik korpusun kendisi (hangi haber yeni,
// hangi kume buyudu) ve kullaniciya ozel hicbir sey tasimiyor; oturum
// gerektiren "son ziyaretten beri" sorusu `/me/changes`te yanitlaniyor.
// Oturum varsa gizlenen haberler suzulur ve takip edilen dosyalar
// isaretlenir — yani oturum davranisi IYILESTIRIR, kapi olmaz.
//
// Sozlesme: docs/CONTRACT.md -> "Degisiklik takibi"
// ---------------------------------------------------------------------
import { Router } from 'express';
import { query } from '../lib/db.js';
import {
  ApiError, asyncHandler, parseIdParam, parsePagination, pickFromAllowList, qs,
} from '../lib/http.js';
import { parseJsonColumn, toIso } from '../lib/serialize.js';
import { CHANGE_TYPES } from '../services/changeLog.js';

const router = Router();

/** Allow-list — `?type=` degeri dogrudan SQL'e gitmez, buradan secilir. */
export const CHANGE_TYPE_LIST = [...CHANGE_TYPES];

export const CHANGE_LABELS = Object.freeze({
  yeni: 'Yeni haber',
  'kume-buyudu': 'Daha fazla kaynak doğruladı',
  'band-yukseldi': 'Önem bandı yükseldi',
  'dosya-gelismesi': 'Aynı dosyada gelişme',
  'ozet-guncellendi': 'Özet güncellendi',
});

/**
 * Tek satirin API sekli. `/changes` ve `/me/changes` AYNI serilestiriciyi
 * kullanir — iki uc arasinda alan farki olusmasin.
 */
export function serializeChangeRow(row) {
  const detail = parseJsonColumn(row.detail, {});
  return {
    id: Number(row.id),
    change_type: row.change_type,
    label: CHANGE_LABELS[row.change_type] ?? row.change_type,
    detected_at: toIso(row.detected_at),
    detail,
    article: {
      id: Number(row.article_id),
      title: row.title,
      importance_band: row.importance_band ?? null,
      category: row.category ?? null,
      published_at: toIso(row.published_at),
      source: row.source_slug ? { slug: row.source_slug, name: row.source_name } : null,
    },
    thread: row.thread_id
      ? {
        id: Number(row.thread_id),
        thread_key: row.thread_key ?? null,
        label: row.thread_label ?? null,
        ref_code: row.ref_code ?? null,
        // ONAYSIZ DOSYA CEKINCELI GOSTERILIR: arayuz bu bayraga gore
        // "olası gelişme" ifadesini kullanir, kesinlik iddia etmez.
        is_confirmed: Number(row.thread_confirmed) === 1,
      }
      : null,
    following: row.following !== undefined ? Number(row.following) === 1 : null,
  };
}

/** Ortak SELECT — kolonlar serializer'in bekledigi takma adlarla eslesir. */
const CHANGE_SELECT = `
  ac.id, ac.article_id, ac.thread_id, ac.change_type, ac.detail, ac.detected_at,
  a.title, a.importance_band, a.published_at, a.category,
  s.slug AS source_slug, s.name AS source_name,
  t.thread_key, t.label AS thread_label, t.ref_code, t.is_confirmed AS thread_confirmed
`;
const CHANGE_FROM = `
  FROM article_changes ac
  JOIN articles a ON a.id = ac.article_id
  JOIN sources s ON s.id = a.source_id
  LEFT JOIN topic_threads t ON t.id = ac.thread_id
`;

/**
 * GET /api/changes
 * Query: `type`, `since`, `article_id`, `thread_id`, `page`, `limit`
 */
router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const where = [];
  const params = [];

  const type = pickFromAllowList(req.query.type, CHANGE_TYPE_LIST);
  if (type) { where.push('ac.change_type = ?'); params.push(type); }

  const rawSince = qs(req.query.since);
  if (rawSince) {
    const d = new Date(rawSince.length === 10 ? `${rawSince}T00:00:00+03:00` : rawSince);
    if (Number.isNaN(d.getTime())) throw ApiError.badRequest('since geçerli bir tarih olmalı');
    where.push('ac.detected_at >= ?');
    params.push(d);
  }

  const articleId = qs(req.query.article_id);
  if (articleId) {
    where.push('ac.article_id = ?');
    params.push(parseIdParam(articleId, 'Geçersiz haber kimliği'));
  }

  const threadId = qs(req.query.thread_id);
  if (threadId) {
    where.push('ac.thread_id = ?');
    params.push(parseIdParam(threadId, 'Geçersiz dosya kimliği'));
  }

  // Oturum varsa kullanicinin gizledigi haberler akista da gorunmez.
  if (req.user?.id) {
    where.push(`NOT EXISTS (
      SELECT 1 FROM user_article_prefs uap
       WHERE uap.article_id = ac.article_id AND uap.user_id = ? AND uap.hidden_at IS NOT NULL
    )`);
    params.push(req.user.id);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRows = await query(`SELECT COUNT(*) AS total ${CHANGE_FROM} ${whereSql}`, params);
  const total = Number(countRows[0]?.total ?? 0);

  const rows = total === 0 ? [] : await query(
    `SELECT ${CHANGE_SELECT} ${CHANGE_FROM} ${whereSql}
      ORDER BY ac.detected_at DESC, ac.id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  const counts = await query(
    `SELECT ac.change_type, COUNT(*) AS c ${CHANGE_FROM} ${whereSql} GROUP BY ac.change_type`,
    params,
  );

  res.json({
    data: rows.map(serializeChangeRow),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / (limit || 1))),
    counts: Object.fromEntries(counts.map((r) => [r.change_type, Number(r.c)])),
    types: CHANGE_TYPE_LIST.map((t) => ({ key: t, label: CHANGE_LABELS[t] })),
  });
}));

/**
 * GET /api/changes/threads — dosya listesi
 *
 * Dosya = `topic_threads`. `clusters`tan AYRI bir katman: kume "kac bagimsiz
 * kaynak dogruladi", dosya "bu konu nasil gelisti" sorusunu yanitlar
 * (gerekce: services/topicThreads.js bas yorumu).
 */
router.get('/threads', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const where = ['t.member_count > 1'];
  const params = [];

  const onlyConfirmed = qs(req.query.confirmed);
  if (onlyConfirmed === '1' || onlyConfirmed === 'true') where.push('t.is_confirmed = 1');

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const countRows = await query(`SELECT COUNT(*) AS total FROM topic_threads t ${whereSql}`, params);
  const total = Number(countRows[0]?.total ?? 0);

  const rows = total === 0 ? [] : await query(
    `SELECT t.id, t.thread_key, t.label, t.kind, t.anchor_tag_slug, t.ref_code,
            t.member_count, t.first_seen_at, t.last_seen_at, t.last_article_id,
            t.is_confirmed
       FROM topic_threads t ${whereSql}
      ORDER BY t.last_seen_at DESC, t.id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  const ids = rows.map((r) => Number(r.id));
  const items = ids.length
    ? await query(
      `SELECT tti.thread_id, tti.article_id, tti.similarity, tti.prev_article_id,
              tti.join_reason, a.title, a.published_at, a.importance_band,
              s.slug AS source_slug, s.name AS source_name
         FROM topic_thread_items tti
         JOIN articles a ON a.id = tti.article_id
         JOIN sources s ON s.id = a.source_id
        WHERE tti.thread_id IN (${ids.map(() => '?').join(', ')})
        ORDER BY a.published_at ASC, a.id ASC`,
      ids,
    )
    : [];

  const follows = req.user?.id && ids.length
    ? new Set((await query(
      `SELECT thread_id FROM user_thread_follows
        WHERE user_id = ? AND thread_id IN (${ids.map(() => '?').join(', ')})`,
      [req.user.id, ...ids],
    )).map((r) => Number(r.thread_id)))
    : new Set();

  const itemsByThread = new Map();
  for (const it of items) {
    const key = Number(it.thread_id);
    if (!itemsByThread.has(key)) itemsByThread.set(key, []);
    itemsByThread.get(key).push({
      article_id: Number(it.article_id),
      title: it.title,
      published_at: toIso(it.published_at),
      importance_band: it.importance_band,
      similarity: it.similarity === null ? null : Number(it.similarity),
      prev_article_id: it.prev_article_id === null ? null : Number(it.prev_article_id),
      join_reason: it.join_reason,
      source: { slug: it.source_slug, name: it.source_name },
    });
  }

  res.json({
    data: rows.map((r) => ({
      id: Number(r.id),
      thread_key: r.thread_key,
      label: r.label,
      kind: r.kind,
      anchor_tag_slug: r.anchor_tag_slug ?? null,
      ref_code: r.ref_code ?? null,
      member_count: Number(r.member_count),
      first_seen_at: toIso(r.first_seen_at),
      last_seen_at: toIso(r.last_seen_at),
      last_article_id: r.last_article_id === null ? null : Number(r.last_article_id),
      is_confirmed: Number(r.is_confirmed) === 1,
      following: follows.has(Number(r.id)),
      items: itemsByThread.get(Number(r.id)) ?? [],
    })),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / (limit || 1))),
  });
}));

export default router;
