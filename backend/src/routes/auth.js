// ---------------------------------------------------------------------
// /api/auth — YER TUTUCU
//
// Bu dosya Faz 0'da route baglama catismasini onlemek icin acildi:
// routes/index.js'i uc ajanin ayni anda duzenlemesi gerekmesin.
// Ilgili ajan bu dosyanin ICERIGINI yazacak, index.js'e DOKUNMAYACAK.
//
// Sozlesme: docs/CONTRACT.md -> "KULLANICI SISTEMI ve KISISELLESTIRME (v2)"
// ---------------------------------------------------------------------
import { Router } from 'express';

const router = Router();

// Henuz uygulanmadi. 501 doner ki arayuz "yayinda degil" yerine
// "henuz uygulanmadi" ayrimini yapabilsin.
router.use((req, res) => {
  res.status(501).json({
    error: { code: 'NOT_IMPLEMENTED', message: 'Bu uç nokta henüz uygulanmadı.' },
  });
});

export default router;
