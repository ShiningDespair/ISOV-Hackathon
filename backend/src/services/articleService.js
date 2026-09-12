// ---------------------------------------------------------------------
// Haber okuma yardimcilari.
// Route'lar arasinda SELECT listesinin kopyalanmasini onlemek icin tek
// yerde duruyor; serializer'in bekledigi takma adlar (source_slug vb.)
// buradaki SELECT ile eslesmek zorunda.
// ---------------------------------------------------------------------
import { query } from '../lib/db.js';
import { placeholders } from '../lib/http.js';
import { serializeArticle } from '../lib/serialize.js';

/** articles + sources + clusters ortak SELECT govdesi. */
export const ARTICLE_COLUMNS = `
  a.id, a.title, a.url, a.summary, a.key_points, a.entities,
  a.region, a.category, a.sentiment,
  a.importance_band, a.importance_score, a.published_at,
  a.cluster_id, a.is_duplicate, a.duplicate_of_id,
  s.slug AS source_slug, s.name AS source_name, s.source_type AS source_type,
  c.member_count AS cluster_member_count
`;

export const ARTICLE_FROM = `
  FROM articles a
  JOIN sources s ON s.id = a.source_id
  LEFT JOIN clusters c ON c.id = a.cluster_id
`;

/**
 * Verilen makale id'leri icin etiketleri tek sorguda ceker (N+1 yok).
 * @returns {Map<number, Array>} article_id -> tag satirlari
 */
export async function tagsByArticleIds(ids) {
  const map = new Map();
  const clean = [...new Set((ids || []).map(Number).filter(Number.isFinite))];
  if (clean.length === 0) return map;

  const rows = await query(
    `SELECT at.article_id, t.slug, t.label, t.kind, t.weight
       FROM article_tags at
       JOIN tags t ON t.id = at.tag_id
      WHERE at.article_id IN (${placeholders(clean.length)})
      ORDER BY t.weight DESC, t.slug ASC`,
    clean,
  );

  for (const row of rows) {
    const key = Number(row.article_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

/** Satir listesini etiketleriyle birlikte API seklinde serilestirir. */
export async function serializeArticleRows(rows, { reveal = false } = {}) {
  if (!rows || rows.length === 0) return [];
  const tagMap = await tagsByArticleIds(rows.map((r) => r.id));
  return rows.map((row) => serializeArticle(row, {
    reveal,
    tags: tagMap.get(Number(row.id)) || [],
  }));
}

/** Tek makaleyi id ile getirir (ham satir). */
export async function findArticleRow(id) {
  const rows = await query(
    `SELECT ${ARTICLE_COLUMNS} ${ARTICLE_FROM} WHERE a.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

/** Bir kumenin tum uyelerini onem sirasina gore getirir. */
export async function findClusterMemberRows(clusterId) {
  return query(
    `SELECT ${ARTICLE_COLUMNS} ${ARTICLE_FROM}
      WHERE a.cluster_id = ?
      ORDER BY a.importance_score DESC, a.published_at DESC, a.id ASC`,
    [clusterId],
  );
}

/** Id listesine gore makale satirlari (rapor kalemleri icin). */
export async function findArticleRowsByIds(ids) {
  const clean = [...new Set((ids || []).map(Number).filter(Number.isFinite))];
  if (clean.length === 0) return [];
  return query(
    `SELECT ${ARTICLE_COLUMNS} ${ARTICLE_FROM}
      WHERE a.id IN (${placeholders(clean.length)})`,
    clean,
  );
}
