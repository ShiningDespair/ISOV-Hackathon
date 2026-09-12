// ---------------------------------------------------------------------
// GET /api/tags — etiketler + kullanim sayisi (DESC)
// ---------------------------------------------------------------------
import { Router } from 'express';
import { query } from '../lib/db.js';
import { asyncHandler, pickFromAllowList, qs } from '../lib/http.js';

const router = Router();

const KINDS = ['konu', 'sektor', 'kurum', 'mevzuat', 'cografya'];

router.get('/', asyncHandler(async (req, res) => {
  const kind = pickFromAllowList(req.query.kind, KINDS);

  // Kullanim sayisi tekillestirilmis haberler uzerinden; tekrarlar
  // etiket bulutunu sisirmesin diye is_duplicate=0 filtresi var.
  const params = [];
  let where = '';
  if (kind) { where = 'WHERE t.kind = ?'; params.push(kind); }

  const rawLimit = Number.parseInt(qs(req.query.limit) ?? '', 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, 500)
    : 200;

  const rows = await query(
    `SELECT t.id, t.slug, t.label, t.kind, t.weight,
            COUNT(a.id) AS usage_count
       FROM tags t
       LEFT JOIN article_tags at ON at.tag_id = t.id
       LEFT JOIN articles a ON a.id = at.article_id AND a.is_duplicate = 0
       ${where}
      GROUP BY t.id, t.slug, t.label, t.kind, t.weight
      ORDER BY usage_count DESC, t.weight DESC, t.slug ASC
      LIMIT ${limit}`,
    params,
  );

  res.json({
    data: rows.map((r) => ({
      id: Number(r.id),
      slug: r.slug,
      label: r.label,
      kind: r.kind,
      weight: Number(r.weight),
      usage_count: Number(r.usage_count),
    })),
    total: rows.length,
  });
}));

export default router;
