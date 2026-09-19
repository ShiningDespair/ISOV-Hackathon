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
import meta from './meta.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();

// ---------------------------------------------------------------------
// PANEL TAMAMEN KAPALI (CONTRACT.md).
//
// Acik kalan tek ucler:
//   /health   — izleme ve konteyner saglik kontrolu
//   /auth/*   — giris, kayit, sifre sifirlama
//   /meta/*   — taksonomi ve ilgi alanlari; KAYIT FORMU bunlari giristen
//               ONCE okumak zorunda, aksi halde kayit ekrani bos kalir
//
// Geri kalan her sey oturum ister. requireAuth burada TEK yerde uygulaniyor;
// her router'a tek tek eklemek, yeni bir router eklendiginde unutulmaya
// acik olurdu - kapali olmasi gereken bir ucun sessizce acik kalmasi
// en kotu hata kipi.
//
// NOT: /admin/* zaten requireRole('admin') ile korunuyor, /me/* kendi
// icinde requireAuth kullaniyor; buradaki katman onlari da kapsar ve
// cift koruma zarar vermez.
// ---------------------------------------------------------------------

router.use('/health', health);
router.use('/auth', auth);
// Taksonomi ucu oturum gerektirmez: kayit formu bunu giristen ONCE okur.
router.use('/meta', meta);

// --- Buradan sonrasi OTURUM ISTER --------------------------------------
router.use(requireAuth);

router.use('/articles', articles);
router.use('/clusters', clusters);
router.use('/tags', tags);
router.use('/sources', sources);
router.use('/source-suggestions', sourceSuggestions);
router.use('/stats', stats);
router.use('/reports', reports);
router.use('/collect', collect);
router.use('/me', me);
router.use('/admin', admin);
router.use('/changes', changes);

export default router;
