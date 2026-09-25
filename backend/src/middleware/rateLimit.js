// ---------------------------------------------------------------------
// HIZ SINIRI — IP anahtarli, bellek-ici
//
// NEDEN YENI BAGIMLILIK YOK (express-rate-limit degil):
// Sistem TEK konteynerde calisiyor (docker-compose: isov-backend x1), yani
// paylasilan bir depo (Redis) zorunlulugu yok. Bellek-ici sayac 60 satir
// ve davranisi tamamen gorunur.
//
// SINIRI: konteyner yeniden baslarsa sayaclar sifirlanir ve yatay
// olceklenmede her kopya kendi sayacini tutar. Bu yuzden IP sinirlayici
// TEK savunma DEGIL — e-posta bazli kalici kilit (users.failed_login_count
// + locked_until) sabit diskte durur ve yeniden baslatmayi atlatilamaz.
// Ikisi birlikte: IP sinirlayici gurultuyu keser, kilit hesabi korur.
//
// SIZINTI KORUMASI: Map suresiz buyumesin diye periyodik supurge var.
// Sayac her istekte de tembel olarak tazelenir; supurge yalnizca bir daha
// hic gelmeyen IP'lerin kaydini dusurur.
//
// TUR 4 DUZELTMESI — KURUMSAL NAT (olculen hata, persona testi
// 2026-09-25): `/auth/login` anahtari YALNIZCA IP idi, 15 dk'da 10 istek,
// ve BASARILI girisler de sayiliyordu. Bes personanin 4'u ayni cikis
// IP'sinden 429 aldi; Burak DOGRU sifreyle 429 aldi. ISOV uyesi 1.400
// kisilik bir fabrika internete TEK kurumsal IP'den cikar: sabah 10.
// basarili giristen sonra tum fabrika 15 dakika disarida kalirdi.
// Yeni kurgu (asagida `loginIpRateLimit` + `loginAccountRateLimit`):
//   - yalnizca BASARISIZ denemeler sayilir (`countOnly: 'failure'`);
//   - asil sinir IP + normalize e-posta ciftinde: bir calisanin yanlis
//     sifresi digerini etkilemez;
//   - IP basina AYRI ve cok daha gevsek bir ust sinir kaba kuvvet /
//     kimlik doldurma (credential stuffing) korumasi olarak kalir.
// authService'teki hesap kilidi (5 hatali -> 15 dk) DEGISMEDI.
// ---------------------------------------------------------------------
import { normalizeEmail } from '../services/authService.js';

/** Kova supurgesinin periyodu. */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Sabit pencere sayaci uretir.
 *
 * Sabit pencere (kayan degil) bilincli secim: kayan pencere her anahtar
 * icin zaman damgasi dizisi tutmayi gerektirir; kaba kuvvet savunmasinda
 * kazanci yok, bellek maliyeti var.
 *
 * `countOnly: 'failure'` — YALNIZCA BASARISIZ istekler sayilir. Sayac
 * istek BASINDA rezerve edilir, yanit 2xx/3xx (basari), 429 (zaten
 * reddedildi, sifre denenmedi) veya 5xx (sunucu hatasi, kullanicinin
 * kabahati degil) ile biterse IADE edilir. Rezervasyon sart: sayac yanit
 * bittikten sonra artirilsaydi, saldirgan ayni anda 100 paralel istek
 * gonderip hepsini sinirin altinda gecirebilirdi.
 *
 * @param {object}   opts
 * @param {number}   opts.windowMs  Pencere uzunlugu (ms)
 * @param {number}   opts.max       Pencere basina izin verilen (sayilan) istek
 * @param {string}   opts.name      Kova ad alani — sayaclar birbirini tuketmesin
 * @param {string}   opts.message   429 govdesindeki Turkce mesaj
 * @param {Function} [opts.keyOf]   req -> anahtar (string) | null. null ise bu
 *                                  sinirlayici istegi SAYMADAN gecirir.
 *                                  Varsayilan: istemci IP'si.
 * @param {'all'|'failure'} [opts.countOnly='all']
 */
export function createRateLimit({
  windowMs, max, name = 'genel', message, keyOf = ipOf, countOnly = 'all',
}) {
  /** @type {Map<string, {count: number, resetAt: number}>} */
  const buckets = new Map();

  // unref(): bu zamanlayici surecin kapanmasini engellemesin
  // (`npm run migrate` gibi kisa omurlu komutlar takilmasin).
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, SWEEP_INTERVAL_MS);
  sweeper.unref();

  const limiter = (req, res, next) => {
    const part = keyOf(req);
    if (part === null || part === undefined || part === '') return next();
    const key = `${name}:${part}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    // Sinir DOLUYSA reddet ve SAYMA: reddedilen istek sifre denemedi.
    if (bucket.count >= max) {
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', String(resetSeconds));
      res.setHeader('Retry-After', String(resetSeconds));
      const minutes = Math.ceil(resetSeconds / 60);
      return res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: message
            || `Çok fazla deneme yaptınız. Lütfen ${minutes} dakika sonra tekrar deneyin.`,
          details: { retry_after_seconds: resetSeconds },
        },
      });
    }

    bucket.count += 1;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('X-RateLimit-Reset', String(resetSeconds));

    if (countOnly === 'failure') {
      const reserved = bucket;
      res.once('finish', () => {
        const status = res.statusCode;
        const failed = status >= 400 && status < 500 && status !== 429;
        // Pencere bu arada yenilendiyse eski kovaya dokunma.
        if (!failed && buckets.get(key) === reserved && reserved.count > 0) reserved.count -= 1;
      });
    }

    return next();
  };

  /** Test ve bakim icin: sayaclari sifirla. */
  limiter.reset = () => buckets.clear();
  limiter.size = () => buckets.size;
  /** Test icin: bir anahtarin o anki sayaci. */
  limiter.peek = (part) => buckets.get(`${name}:${part}`)?.count ?? 0;

  return limiter;
}

/** app.set('trust proxy', 1) tanimli: req.ip proxy arkasinda da gercek istemci. */
export function ipOf(req) {
  return req.ip || req.socket?.remoteAddress || 'bilinmeyen';
}

/**
 * IP + NORMALIZE e-posta. Normalizasyon authService.normalizeEmail ile
 * AYNI fonksiyon: "Deniz@X.com " ile "deniz@x.com" ayni hesaptir ve ayni
 * kovaya dusmeli, yoksa buyuk/kucuk harf oynamasiyla sinir asilirdi.
 * E-posta yoksa null -> bu sinirlayici atlanir (dogrulama 400 dondurur,
 * IP sinirlayicisi onu yine sayar).
 */
export function ipAndEmailOf(req) {
  const email = normalizeEmail(req.body?.email);
  if (!email) return null;
  return `${ipOf(req)}|${email}`;
}

// ---------------------------------------------------------------------
// Hazir sinirlayicilar
// ---------------------------------------------------------------------

const FIFTEEN_MIN = 15 * 60 * 1000;
const LOGIN_MESSAGE = 'Çok fazla hatalı giriş denemesi yapıldı. Lütfen 15 dakika sonra tekrar deneyin.';

/**
 * GIRIS — IP + e-posta: 15 dakikada 10 BASARISIZ deneme.
 * Hesap kilidi (authService, 5 hatali -> 15 dk) bundan ONCE devreye girer;
 * bu kova olmayan e-postalari ve surec yeniden baslayana kadar bellekte
 * tutulan sahte kilidi tamamlar. Basarili giris hic sayilmaz.
 */
export const loginAccountRateLimit = createRateLimit({
  windowMs: FIFTEEN_MIN,
  max: 10,
  name: 'giris-hesap',
  keyOf: ipAndEmailOf,
  countOnly: 'failure',
  message: LOGIN_MESSAGE,
});

/**
 * GIRIS — yalnizca IP: 15 dakikada 200 BASARISIZ deneme (kaba kuvvet ust
 * siniri). 200'un gerekcesi: 1.400 kisilik bir fabrikanin TAMAMI ayni
 * 15 dakikalik sabah penceresinde giris yapsa ve %10'u bir kez yanlis
 * yazsa 140 basarisiz deneme eder; 200 bunu ~1,4 kat payla karsilar.
 * Saldirgan acisindan: tek IP'den saatte en fazla 800 sifre denemesi, ve
 * her hesapta 5. hatada kilit — hesap basina 4 tahmin.
 */
export const loginIpRateLimit = createRateLimit({
  windowMs: FIFTEEN_MIN,
  max: 200,
  name: 'giris-ip',
  countOnly: 'failure',
  message: 'Bu ağdan çok fazla hatalı giriş denemesi yapıldı. Lütfen 15 dakika sonra tekrar deneyin.',
});

/**
 * Geriye uyumluluk: eski tek-sinirlayici adi. Express dizileri duzlestirir,
 * dolayisiyla `router.post('/login', loginRateLimit, ...)` ayni zinciri
 * kurar. Yeni kod iki sinirlayiciyi acikca baglar (routes/auth.js).
 */
export const loginRateLimit = [loginIpRateLimit, loginAccountRateLimit];

/**
 * KAYIT — IP: 15 dakikada 60, BASARILI kayitlar DAHIL.
 * Basarili kayit da sayilir, cunku her basari DB'de bir hesap acar (sahte
 * hesap yigini vektoru). Eski sinir 10'du: kurumsal NAT arkasinda bir
 * "herkes bugun kayit olsun" duyurusu 11. kisiyi disarida birakirdi.
 * 60: 1.400 kisinin 8 saatlik bir is gunune yayilmis kaydi ~44 / 15 dk.
 */
export const registerRateLimit = createRateLimit({
  windowMs: FIFTEEN_MIN,
  max: 60,
  name: 'kayit',
  message: 'Bu ağdan çok fazla kayıt denemesi yapıldı. Lütfen 15 dakika sonra tekrar deneyin.',
});

/**
 * SIFRE SIFIRLAMA ISTEGI — IP + e-posta: 15 dakikada 3 (tumu sayilir).
 * Her cagri DB'ye kayit acar ve SMTP baglandiginda e-posta gonderecek:
 * BIR KISININ kutusu bombalanamasin diye asil sinir e-posta basina.
 * Eski hali IP basina 5'ti ve ayni kovayi token tuketme ucuyla PAYLASIYORDU:
 * ayni ofisten 5 kisi sifre sifirlarsa altincisi linkine tiklayamazdi.
 */
export const passwordResetRequestRateLimit = createRateLimit({
  windowMs: FIFTEEN_MIN,
  max: 3,
  name: 'sifre-sifirlama-istek',
  keyOf: ipAndEmailOf,
  message: 'Bu adres için çok fazla şifre sıfırlama isteği gönderildi. Lütfen 15 dakika sonra tekrar deneyin.',
});

/** SIFRE SIFIRLAMA ISTEGI — IP ust siniri: 15 dakikada 30 (tumu sayilir). */
export const passwordResetRequestIpRateLimit = createRateLimit({
  windowMs: FIFTEEN_MIN,
  max: 30,
  name: 'sifre-sifirlama-istek-ip',
  message: 'Bu ağdan çok fazla şifre sıfırlama isteği gönderildi. Lütfen 15 dakika sonra tekrar deneyin.',
});

/**
 * SIFRE SIFIRLAMA (token tuketme) — IP: 15 dakikada 10 BASARISIZ.
 * Token 32 bayt rastgele; tahmin korumasi zaten kriptografik. Sinir
 * yalnizca gecersiz token yiginini keser; gecerli token ile yapilan
 * sifirlama sayilmaz.
 */
export const passwordResetConsumeRateLimit = createRateLimit({
  windowMs: FIFTEEN_MIN,
  max: 10,
  name: 'sifre-sifirlama',
  countOnly: 'failure',
  message: 'Çok fazla şifre sıfırlama denemesi yapıldı. Lütfen 15 dakika sonra tekrar deneyin.',
});

/** Geriye uyumluluk: eski ad. */
export const passwordResetRateLimit = passwordResetConsumeRateLimit;
