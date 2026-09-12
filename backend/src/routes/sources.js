// ---------------------------------------------------------------------
// GET /api/sources — izlenen kaynaklar + haber sayilari
// ---------------------------------------------------------------------
import { Router } from 'express';
import { query } from '../lib/db.js';
import { asyncHandler, pickFromAllowList, qs } from '../lib/http.js';
import { toIso } from '../lib/serialize.js';

const router = Router();

const SOURCE_TYPES = ['mevzuat', 'kurum', 'acik_veri', 'basin', 'uluslararasi', 'diger'];

router.get('/', asyncHandler(async (req, res) => {
  const where = [];
  const params = [];

  const type = pickFromAllowList(req.query.source_type ?? req.query.type, SOURCE_TYPES);
  if (type) { where.push('s.source_type = ?'); params.push(type); }

  const activeParam = qs(req.query.active);
  if (activeParam !== undefined) {
    where.push('s.is_active = ?');
    params.push(['0', 'false', 'hayir'].includes(activeParam.toLowerCase()) ? 0 : 1);
  }

  const rows = await query(
    `SELECT s.id, s.slug, s.name, s.homepage_url, s.feed_url, s.source_type,
            s.authority_weight, s.country_code, s.language, s.is_active,
            s.last_fetched_at,
            COUNT(a.id) AS article_count,
            SUM(CASE WHEN a.is_duplicate = 0 THEN 1 ELSE 0 END) AS unique_count,
            MAX(a.published_at) AS last_published_at
       FROM sources s
       LEFT JOIN articles a ON a.source_id = s.id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY s.id
      ORDER BY s.authority_weight DESC, s.name ASC`,
    params,
  );

  res.json({
    data: rows.map((r) => ({
      id: Number(r.id),
      slug: r.slug,
      name: r.name,
      homepage_url: r.homepage_url,
      feed_url: r.feed_url,
      source_type: r.source_type,
      authority_weight: Number(r.authority_weight),
      country_code: r.country_code,
      language: r.language,
      is_active: Boolean(r.is_active),
      last_fetched_at: toIso(r.last_fetched_at),
      article_count: Number(r.article_count),
      unique_count: Number(r.unique_count ?? 0),
      last_published_at: toIso(r.last_published_at),
    })),
    total: rows.length,
  });
}));

export default router;
