// ---------------------------------------------------------------------
// GET  /api/reports            — rapor listesi
// GET  /api/reports/:id        — rapor + icindeki haberler (bolumlere ayrilmis)
// POST /api/reports/generate   — donemsel rapor uret
// ---------------------------------------------------------------------
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../lib/db.js';
import { ApiError, asyncHandler, parsePagination, pickFromAllowList } from '../lib/http.js';
import { serializeList, wantsReveal } from '../lib/serialize.js';
import { generateReport, serializeReportRow, SECTION_ORDER } from '../services/reportService.js';
import { findArticleRowsByIds, serializeArticleRows } from '../services/articleService.js';

const router = Router();

const PERIOD_TYPES = ['gunluk', 'haftalik', 'aylik', 'ozel'];

/** POST govdesi semasi — zod ile dogrulanir, hatalar 400 doner. */
const generateSchema = z.object({
  period_start: z.string().min(8).max(30),
  period_end: z.string().min(8).max(30),
  period_type: z.enum(['gunluk', 'haftalik', 'aylik', 'ozel']).default('haftalik'),
  title: z.string().min(3).max(300).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  section_limit: z.coerce.number().int().min(1).max(100).optional(),
});

router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const periodType = pickFromAllowList(req.query.period_type, PERIOD_TYPES);

  const params = [];
  let where = '';
  if (periodType) { where = 'WHERE r.period_type = ?'; params.push(periodType); }

  const countRow = await queryOne(`SELECT COUNT(*) AS total FROM reports r ${where}`, params);
  const total = Number(countRow?.total ?? 0);

  const rows = await query(
    `SELECT r.id, r.title, r.period_start, r.period_end, r.period_type,
            r.executive_summary, r.stats, r.created_at,
            (SELECT COUNT(*) FROM report_items ri WHERE ri.report_id = r.id) AS item_count
       FROM reports r
       ${where}
      ORDER BY r.period_end DESC, r.id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  res.json(serializeList(rows.map(serializeReportRow), { page, limit, total }));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) throw ApiError.badRequest('Gecersiz rapor id');

  const row = await queryOne(
    `SELECT id, title, period_start, period_end, period_type,
            executive_summary, stats, created_at
       FROM reports WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!row) throw ApiError.notFound('Rapor bulunamadi');

  const itemRows = await query(
    `SELECT article_id, rank_order, section FROM report_items
      WHERE report_id = ? ORDER BY rank_order ASC`,
    [id],
  );

  const reveal = wantsReveal(req);
  const articleRows = await findArticleRowsByIds(itemRows.map((r) => r.article_id));
  const serialized = await serializeArticleRows(articleRows, { reveal });
  const byId = new Map(serialized.map((a) => [a.id, a]));

  // Rapor kalemleri rank sirasina sadik kalsin; bolumler CONTRACT sirasinda.
  const items = itemRows
    .map((r) => ({
      rank_order: Number(r.rank_order),
      section: r.section,
      article: byId.get(Number(r.article_id)) || null,
    }))
    .filter((x) => x.article);

  const sections = SECTION_ORDER
    .map((key) => ({
      key,
      items: items.filter((i) => i.section === key),
    }))
    .filter((s) => s.items.length > 0);

  res.json({
    ...serializeReportRow(row),
    item_count: items.length,
    sections,
    items,
  });
}));

router.post('/generate', asyncHandler(async (req, res) => {
  const parsed = generateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    throw ApiError.badRequest(
      'Rapor parametreleri gecersiz',
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }

  const result = await generateReport(parsed.data);
  res.status(201).json(result);
}));

export default router;
