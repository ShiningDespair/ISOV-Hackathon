// ---------------------------------------------------------------------
// SIFRE OZETLEME — node:crypto scrypt
//
// NEDEN YENI BAGIMLILIK YOK (argon2/bcrypt degil):
// argon2 ve bcrypt native derleme ister; hackathon konteynerinde derleyici
// zinciri yok ve `npm ci` kirilirsa TUM backend ayaga kalkmaz. scrypt
// Node cekirdeginde (OpenSSL) ve RFC 7914 parametreleriyle bcrypt-sinifi
// bir KDF. Bedeli: parametreleri KENDIMIZ tasimak zorundayiz — bu yuzden
// N/r/p ozetin ICINE yaziliyor, boylece ileride maliyet artirildiginda
// eski ozetler dogrulanmaya devam eder (tek dosyada gecis mantigi).
//
// Bicim: scrypt$N$r$p$saltBase64$hashBase64
//
// N=16384, r=8, p=1 -> bellek maliyeti 128*N*r = 16 MiB, tek dogrulama
// ~50-90 ms. Hackathon trafiginde kabul edilebilir; kaba kuvvete karsi
// bellek maliyeti asil koruma (IP sinirlayici ve hesap kilidi USTUNE gelir).
// ---------------------------------------------------------------------
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

/** Ozetin icine yazilan mevcut maliyet parametreleri. */
export const SCRYPT_N = 16384;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;

const SALT_BYTES = 32;
const HASH_BYTES = 64;

// 128 * N * r = 16 MiB; Node varsayilan maxmem 32 MiB sinirina takilmamak
// ve ileride N buyutulebilsin diye acik veriyoruz.
const MAX_MEM = 64 * 1024 * 1024;

/** scrypt'in callback surumunu Promise'e cevirir (senkron surum event loop'u kilitler). */
function derive(plain, salt, { N, r, p }) {
  return new Promise((resolve, reject) => {
    scryptCb(
      Buffer.from(String(plain), 'utf8'),
      salt,
      HASH_BYTES,
      { N, r, p, maxmem: MAX_MEM },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

/**
 * Duz sifreden saklanabilir ozet uretir.
 * @returns {Promise<string>} `scrypt$N$r$p$salt$hash`
 */
export async function hashPassword(plain) {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('hashPassword: bos sifre ozetlenemez');
  }
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(plain, salt, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

/**
 * Saklanan ozeti duz sifre ile karsilastirir.
 *
 * Parametreler ozetten OKUNUR, sabitlerden degil: maliyet ileride
 * artirildiginda eski kullanicilar girisi kaybetmez.
 *
 * Karsilastirma `timingSafeEqual` ile yapilir — `===` ilk farkli baytta
 * donerdi ve ozet baytlarini zaman uzerinden sizdiran bir kanal acardi.
 */
export async function verifyPassword(plain, stored) {
  if (typeof plain !== 'string' || typeof stored !== 'string') return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number.parseInt(parts[1], 10);
  const r = Number.parseInt(parts[2], 10);
  const p = Number.parseInt(parts[3], 10);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  // Kotu niyetli / bozuk bir kayit asiri parametreyle sunucuyu bellege
  // bogmasin (ozet kolonu DB'den gelir, yine de sinir koyuyoruz).
  if (N < 1024 || N > 1_048_576 || r < 1 || r > 32 || p < 1 || p > 16) return false;

  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[4], 'base64');
    expected = Buffer.from(parts[5], 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let actual;
  try {
    actual = await new Promise((resolve, reject) => {
      scryptCb(
        Buffer.from(plain, 'utf8'),
        salt,
        expected.length,
        { N, r, p, maxmem: MAX_MEM },
        (err, key) => (err ? reject(err) : resolve(key)),
      );
    });
  } catch {
    return false;
  }

  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------------
// SIFRE POLITIKASI
//
// En az 10 karakter + en az bir harf + en az bir rakam. Karmasiklik
// dayatmasi (ozel karakter, buyuk harf) KASTEN YOK: kullaniciyi
// "Sifre1!" gibi tahmin edilebilir kaliplara itiyor. Uzunluk daha iyi
// koruma sagliyor.
//
// Harf kontrolu \p{L} ile Unicode: "şifre" icindeki Turkce harfler de
// harf sayilir, aksi halde yalnizca Turkce harf kullanan gecerli bir
// sifre reddedilirdi.
// ---------------------------------------------------------------------
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

const HAS_LETTER = /\p{L}/u;
const HAS_DIGIT = /\d/u;

/**
 * Politikaya uymayan sifre icin Turkce hata mesaji, uyuyorsa null.
 * @param {unknown} plain
 * @returns {string|null}
 */
export function passwordPolicyError(plain) {
  if (typeof plain !== 'string' || plain.length === 0) {
    return 'Şifre alanı zorunludur.';
  }
  if (plain.length < MIN_PASSWORD_LENGTH) {
    return `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.`;
  }
  if (plain.length > MAX_PASSWORD_LENGTH) {
    return `Şifre en fazla ${MAX_PASSWORD_LENGTH} karakter olabilir.`;
  }
  if (!HAS_LETTER.test(plain)) {
    return 'Şifre en az bir harf içermelidir.';
  }
  if (!HAS_DIGIT.test(plain)) {
    return 'Şifre en az bir rakam içermelidir.';
  }
  return null;
}

/** Politika metni — kayit formunun gosterecegi aciklama (tek dogruluk noktasi). */
export const PASSWORD_POLICY_TEXT =
  `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı, en az bir harf ve bir rakam içermelidir.`;
