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
import sourceSuggestions from './sourceSuggestions.js';
import stats from './stats.js';
import reports from './reports.js';
import collect from './collect.js';
// Faz 0'da yer tutucu olarak acildi; ilgili ajanlar dosya iceriklerini yazar.
import auth from './auth.js';
import me from './me.js';
import admin from './admin.js';
import changes from './changes.js';

const router = Router();

router.use('/health', health);
router.use('/articles', articles);
router.use('/clusters', clusters);
router.use('/tags', tags);
router.use('/sources', sources);
router.use('/source-suggestions', sourceSuggestions);
router.use('/stats', stats);
router.use('/reports', reports);
router.use('/collect', collect);
router.use('/auth', auth);
router.use('/me', me);
router.use('/admin', admin);
router.use('/changes', changes);

export default router;
