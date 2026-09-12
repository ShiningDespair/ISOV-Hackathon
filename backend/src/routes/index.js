// ---------------------------------------------------------------------
// Tum uc noktalari /api altinda toplayan router.
// CONTRACT.md tablosu ile birebir eslesir.
// ---------------------------------------------------------------------
import { Router } from 'express';
import health from './health.js';
import articles from './articles.js';
import clusters from './clusters.js';
import tags from './tags.js';
import sources from './sources.js';
import stats from './stats.js';
import reports from './reports.js';
import collect from './collect.js';

const router = Router();

router.use('/health', health);
router.use('/articles', articles);
router.use('/clusters', clusters);
router.use('/tags', tags);
router.use('/sources', sources);
router.use('/stats', stats);
router.use('/reports', reports);
router.use('/collect', collect);

export default router;
