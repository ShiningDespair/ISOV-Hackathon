// ---------------------------------------------------------------------
// GET /api/clusters/:id — kume ve tum uyeleri
// ---------------------------------------------------------------------
import { Router } from 'express';
import { queryOne } from '../lib/db.js';
import { ApiError, asyncHandler } from '../lib/http.js';
import { toIso, wantsReveal } from '../lib/serialize.js';
import { findClusterMemberRows, serializeArticleRows } from '../services/articleService.js';

const router = Router();

router.get('/:id', asyncHandler(async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) throw ApiError.badRequest('Geçersiz küme kimliği');

  const cluster = await queryOne(
    `SELECT id, cluster_key, representative_article_id, member_count,
            headline, first_seen_at, last_seen_at, created_at
       FROM clusters WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!cluster) throw ApiError.notFound('Küme bulunamadı');

  const reveal = wantsReveal(req);
  const memberRows = await findClusterMemberRows(id);
  const members = await serializeArticleRows(memberRows, { reveal });

  res.json({
    id: Number(cluster.id),
    cluster_key: cluster.cluster_key,
    headline: cluster.headline,
    member_count: Number(cluster.member_count),
    representative_article_id: cluster.representative_article_id
      ? Number(cluster.representative_article_id) : null,
    first_seen_at: toIso(cluster.first_seen_at),
    last_seen_at: toIso(cluster.last_seen_at),
    // Kumeyi kac farkli kaynak dogrulamis — "corroboration"in gorunur yuzu.
    source_count: new Set(members.map((m) => m.source?.slug).filter(Boolean)).size,
    members,
  });
}));

export default router;
