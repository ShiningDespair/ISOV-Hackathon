// ---------------------------------------------------------------------
// /api/auth — KIMLIK DOGRULAMA UCLARI
//
// Sozlesme: docs/CONTRACT.md -> "KULLANICI SISTEMI ve KISISELLESTIRME (v2)"
//
//   POST /auth/register                {email, password, full_name, title?, tenant_key?} -> 201
//   POST /auth/login                   {email, password}                                 -> 200
//   POST /auth/logout                                                                    -> 200
//   GET  /auth/me                      oturum sahibi + profil + turetilmis layout/view  -> 200
//   POST /auth/password                {current, next}                                   -> 200
//   POST /auth/password/reset-request  {email}                                           -> 202
//   POST /auth/password/reset          {token, next}                                     -> 200
//   GET  /auth/policy                  sifre politikasi metni (form ipucu)               -> 200
//
// KATMAN AYRIMI: bu dosya yalnizca HTTP ile ilgilenir (govde dogrulama,
// durum kodu, cerez). Kurallar services/authService.js'te — ayni kurallari
// `npm run migrate` admin tohumlamasi da cagiriyor.
//
// Govde dogrulamasi zod ile (zaten bagimlilikta): elle yazilmis tip
// kontrolleri her ucta biraz farkli davranir ve "gecersiz istek" ile
// "sunucu hatasi" ayrimini kaybeder.
// ---------------------------------------------------------------------
import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncHandler } from '../lib/http.js';
import {
  clearSessionCookie, clearViewCookie, createSession, readSessionToken,
  revokeAllSessions, revokeSessionByToken, sessionTtlHours, setSessionCookie,
  setViewCookie,
} from '../lib/session.js';
import { requireAuth } from '../middleware/session.js';
import {
  loginRateLimit, passwordResetRateLimit, registerRateLimit,
} from '../middleware/rateLimit.js';
import {
  MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PASSWORD_POLICY_TEXT,
} from '../lib/passwords.js';
import {
  authenticate, buildMePayload, changePassword, consumePasswordReset,
  createPasswordReset, findUserById, registerUser,
} from '../services/authService.js';

const router = Router();

const isProduction = process.env.NODE_ENV === 'production';

// --- zod semalari -----------------------------------------------------
// Mesajlar Turkce: zod'un varsayilan Ingilizce metinleri dogrudan
// kullaniciya gidiyor, bu yuzden her alanda acikca yaziliyor.

const emailSchema = z.string({
  required_error: 'E-posta adresi zorunludur.',
  invalid_type_error: 'E-posta adresi metin olmalıdır.',
})
  .trim()
  .min(3, 'Geçersiz e-posta adresi.')
  .max(190, 'E-posta adresi en fazla 190 karakter olabilir.')
  .email('Geçersiz e-posta adresi.');

// Politika kontrolu authService/passwords.js'te; burada yalnizca kaba
// sinirlar var ki 1 MB'lik bir "sifre" scrypt'e hic girmesin.
const passwordSchema = z.string({
  required_error: 'Şifre zorunludur.',
  invalid_type_error: 'Şifre metin olmalıdır.',
})
  .min(1, 'Şifre zorunludur.')
  .max(MAX_PASSWORD_LENGTH, `Şifre en fazla ${MAX_PASSWORD_LENGTH} karakter olabilir.`);

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  full_name: z.string({
    required_error: 'Ad soyad zorunludur.',
    invalid_type_error: 'Ad soyad metin olmalıdır.',
  }).trim().min(2, 'Ad soyad en az 2 karakter olmalıdır.')
    .max(190, 'Ad soyad en fazla 190 karakter olabilir.'),
  title: z.string({ invalid_type_error: 'Unvan metin olmalıdır.' })
    .trim().max(120, 'Unvan en fazla 120 karakter olabilir.')
    .optional().or(z.literal('')),
  tenant_key: z.string({ invalid_type_error: 'Kurum anahtarı metin olmalıdır.' })
    .trim().max(64, 'Kurum anahtarı en fazla 64 karakter olabilir.')
    .optional().or(z.literal('')),
});

const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

const changePasswordSchema = z.object({
  current: passwordSchema,
  next: passwordSchema,
});

const resetRequestSchema = z.object({ email: emailSchema });

const resetSchema = z.object({
  token: z.string({
    required_error: 'Sıfırlama anahtarı zorunludur.',
    invalid_type_error: 'Sıfırlama anahtarı metin olmalıdır.',
  })
    .trim().min(10, 'Sıfırlama anahtarı geçersiz.').max(200, 'Sıfırlama anahtarı geçersiz.'),
  next: passwordSchema,
});

/**
 * zod sonucunu tek bir 400'e cevirir.
 * Ilk hatanin mesaji kullaniciya, tamami `details.alanlar`a konur —
 * form tek seferde tum hatalari gosterebilsin.
 */
function parseBody(schema, body) {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;

  const issues = result.error.issues.map((i) => ({
    alan: i.path.join('.') || '(govde)',
    mesaj: i.message,
  }));
  throw ApiError.badRequest(issues[0]?.mesaj || 'Geçersiz istek.', { alanlar: issues });
}

/** Istek sahibinin IP ve tarayici bilgisi — oturum kaydina yazilir. */
function requestMeta(req) {
  return {
    ip: req.ip || req.socket?.remoteAddress || null,
    userAgent: req.get('user-agent') || null,
  };
}

/**
 * Oturum acar, IKI cerezi yazar, standart oturum ozetini doner.
 *
 * Ikinci cerez `isov_view` (httpOnly DEGIL, bkz. lib/session.js): degeri
 * `payload.default_view`, yani pozisyondan turetilen varsayilan gorunum.
 * Payload'dan okunur, burada YENIDEN HESAPLANMAZ — /auth/me'nin dondurdugu
 * alan ile cerez ayrisirsa hangisinin dogru oldugu belirsiz kalirdi.
 *
 * Kayitta (POST /auth/register) profil satiri ACILMADIGI icin
 * `default_view` dogal olarak 'panel' olur; ozel bir dal gerekmiyor.
 */
async function openSession(req, res, userRow, payload) {
  const { token, expiresAt } = await createSession(userRow.id, requestMeta(req));
  setSessionCookie(res, token);
  setViewCookie(res, payload?.default_view);
  return {
    expires_at: expiresAt.toISOString(),
    ttl_hours: sessionTtlHours(),
  };
}

// ---------------------------------------------------------------------
// GET /auth/policy — kayit formunun okudugu sifre kurali.
// Kurali arayuzde yeniden yazmak, iki tarafin ayrismasi demek.
// ---------------------------------------------------------------------
router.get('/policy', (req, res) => {
  res.json({
    data: {
      min_length: MIN_PASSWORD_LENGTH,
      max_length: MAX_PASSWORD_LENGTH,
      requires_letter: true,
      requires_digit: true,
      text: PASSWORD_POLICY_TEXT,
      session_ttl_hours: sessionTtlHours(),
    },
  });
});

// ---------------------------------------------------------------------
// POST /auth/register -> 201 + oturum cerezi
// ---------------------------------------------------------------------
router.post('/register', registerRateLimit, asyncHandler(async (req, res) => {
  const body = parseBody(registerSchema, req.body);

  const user = await registerUser({
    email: body.email,
    password: body.password,
    full_name: body.full_name,
    title: body.title || null,
    tenant_key: body.tenant_key || undefined,
  });

  // Kayit BASARILI olunca oturum acilir: kullanici ikinci kez kimlik
  // bilgisi girmesin. user_profiles satiri ACILMAZ (sapma-only) —
  // profili onboarding adiminda kendisi dolduracak. Dolayisiyla gorunum
  // cerezi burada 'panel' yazilir; rolden gelen varsayilan ilk profil
  // kaydinda (PUT /me/profile) devreye girer.
  const payload = await buildMePayload(user);
  const session = await openSession(req, res, user, payload);

  res.status(201).json({ data: { ...payload, session } });
}));

// ---------------------------------------------------------------------
// POST /auth/login -> 200 + oturum cerezi
// ---------------------------------------------------------------------
router.post('/login', loginRateLimit, asyncHandler(async (req, res) => {
  const body = parseBody(loginSchema, req.body);

  // authenticate() basarisizlikta DAIMA ayni mesaji uretir ve olmayan
  // kullanici dalinda da scrypt maliyetini oder (varlik sizintisi yok).
  const user = await authenticate({ email: body.email, password: body.password });

  // Payload ONCE: `default_view` hem yanitta hem `isov_view` cerezinde
  // ayni degeri tasisin.
  const payload = await buildMePayload(user);
  const session = await openSession(req, res, user, payload);

  res.json({ data: { ...payload, session } });
}));

// ---------------------------------------------------------------------
// POST /auth/logout
//
// Oturumsuz cagri da 200 doner: "cikis yap" fiilen istenen duruma
// (oturum yok) ulasmistir, kullaniciya hata gostermek anlamsiz olur.
// ---------------------------------------------------------------------
router.post('/logout', asyncHandler(async (req, res) => {
  const token = readSessionToken(req);
  let revoked = false;
  if (token) revoked = await revokeSessionByToken(token);

  clearSessionCookie(res);
  // Gorunum cerezi de dusurulur: oturum yokken tarayicida rolden gelen
  // bir mizanpaj tercihi kalmasi anlamsiz olurdu. Kullanicinin KENDI acik
  // secimi (localStorage['isov:view']) ETKILENMEZ — o frontend'de durur ve
  // cikis onu temizlemez; kasten, cunku tercihi cihaza ait.
  clearViewCookie(res);
  res.json({ data: { revoked }, message: 'Oturum kapatıldı.' });
}));

// ---------------------------------------------------------------------
// GET /auth/me — kullanici + profil (varsa) + TURETILMIS layout
// ---------------------------------------------------------------------
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  // Orta katmanin verdigi ozet yeterli olmadigi icin (profil ve tam
  // kullanici satiri gerekiyor) tek bir okuma daha yapiliyor.
  const user = await findUserById(req.user.id);
  if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Oturum artık geçerli değil.');

  const payload = await buildMePayload(user);
  res.json({
    data: {
      ...payload,
      session: {
        expires_at: req.session?.expires_at
          ? new Date(req.session.expires_at).toISOString()
          : null,
      },
    },
  });
}));

// ---------------------------------------------------------------------
// POST /auth/password — {current, next}
// ---------------------------------------------------------------------
router.post('/password', requireAuth, asyncHandler(async (req, res) => {
  const body = parseBody(changePasswordSchema, req.body);

  const user = await findUserById(req.user.id);
  if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Oturum artık geçerli değil.');

  await changePassword(user, body.current, body.next);

  // DIGER cihazlarin oturumu dusurulur, bu sekme ayakta kalir: sifre
  // degistirmenin amaci genelde baskasinin erisimini kesmek.
  const revoked = await revokeAllSessions(user.id, { exceptToken: readSessionToken(req) });

  res.json({
    data: { revoked_other_sessions: revoked },
    message: 'Şifreniz güncellendi.',
  });
}));

// ---------------------------------------------------------------------
// POST /auth/password/reset-request -> DAIMA 202
//
// SMTP henuz yok: kayit acilir, e-posta gonderimi SMTP baglandiginda ayni
// tablodan beslenir. Token YANITTA DONMEZ — donmesi, e-posta sahipligini
// hic dogrulamadan sifre degistirmeye izin vermek olurdu.
//
// Kullanici yoksa da 202: farkli yanit, kayitli e-postalari tespit etmeye
// yarayan bir kesif araci olurdu.
// ---------------------------------------------------------------------
router.post('/password/reset-request', passwordResetRateLimit, asyncHandler(async (req, res) => {
  const body = parseBody(resetRequestSchema, req.body);
  const result = await createPasswordReset(body.email);

  // Gelistirme kolayligi: SMTP yokken akisi deneyebilmek icin token
  // SUNUCU GUNLUGUNE yazilir. production'da ASLA yazilmaz; orada
  // baglanti ya e-posta ile ya da admin ucundan uretilir.
  if (!isProduction && result.token) {
    console.log(`[auth] (gelistirme) sifre sifirlama tokeni uretildi: ${result.token}`);
  }

  res.status(202).json({
    message: 'Kayıtlı bir hesap varsa şifre sıfırlama talimatları gönderilecek.',
    data: { queued: true },
  });
}));

// ---------------------------------------------------------------------
// POST /auth/password/reset — {token, next}
// ---------------------------------------------------------------------
router.post('/password/reset', passwordResetRateLimit, asyncHandler(async (req, res) => {
  const body = parseBody(resetSchema, req.body);
  await consumePasswordReset(body.token, body.next);

  // consumePasswordReset() kullanicinin TUM oturumlarini iptal etti;
  // bu tarayicidaki (varsa artik islevsiz) cerezleri de dusurelim.
  clearSessionCookie(res);
  clearViewCookie(res);

  res.json({
    data: { ok: true },
    message: 'Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.',
  });
}));

export default router;
