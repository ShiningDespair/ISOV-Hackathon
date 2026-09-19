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
// ---------------------------------------------------------------------

/** Kova supurgesinin periyodu. */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * IP anahtarli sabit pencere sayaci uretir.
 *
 * Sabit pencere (kayan degil) bilincli secim: kayan pencere her IP icin
 * zaman damgasi dizisi tutmayi gerektirir; kaba kuvvet savunmasinda
 * kazanci yok, bellek maliyeti var.
 *
 * @param {object}  opts
 * @param {number}  opts.windowMs Pencere uzunlugu (ms)
 * @param {number}  opts.max      Pencere basina izin verilen istek sayisi
 * @param {string}  opts.name     Kova ad alani — /login ve /register
 *                                sayaclari birbirini tuketmesin
 * @param {string}  opts.message  429 govdesindeki Turkce mesaj
 */
export function createRateLimit({ windowMs, max, name = 'genel', message }) {
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
    // app.set('trust proxy', 1) tanimli oldugu icin req.ip proxy arkasinda
    // da gercek istemciyi verir.
    const key = `${name}:${req.ip || req.socket?.remoteAddress || 'bilinmeyen'}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(resetSeconds));

    if (bucket.count > max) {
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

    return next();
  };

  /** Test ve bakim icin: sayaclari sifirla. */
  limiter.reset = () => buckets.clear();
  limiter.size = () => buckets.size;

  return limiter;
}

// ---------------------------------------------------------------------
// Sozlesmedeki hazir sinirlayicilar
// ---------------------------------------------------------------------

/** 15 dakikada 10 deneme — /auth/login. */
export const loginRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  name: 'giris',
  message: 'Çok fazla giriş denemesi yapıldı. Lütfen 15 dakika sonra tekrar deneyin.',
});

/** 15 dakikada 10 deneme — /auth/register. */
export const registerRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  name: 'kayit',
  message: 'Çok fazla kayıt denemesi yapıldı. Lütfen 15 dakika sonra tekrar deneyin.',
});

/**
 * Sifre sifirlama istegi — 15 dakikada 5. Daha kati, cunku bu uc her
 * cagrisinda DB'ye kayit acar ve SMTP baglandiginda e-posta gonderecek;
 * ucuz bir spam vektoru olmasin.
 */
export const passwordResetRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  name: 'sifre-sifirlama',
  message: 'Çok fazla şifre sıfırlama isteği gönderildi. Lütfen 15 dakika sonra tekrar deneyin.',
});
