// ---------------------------------------------------------------------
// SIR SIFRELEME — AES-256-GCM (node:crypto)
//
// NEDEN BU DOSYA VAR:
// `app_settings` tablosunda SMTP sifresi gibi degerler duruyor. Bu
// degerler API yanitinda ASLA donmez (yalnizca "tanimli/tanimsiz"), ama
// e-posta gonderebilmek icin geri okunabilir olmalari gerekir — yani
// tek yonlu ozet (scrypt) burada ISE YARAMAZ, tersine cevrilebilir
// sifreleme gerekir. Bu dosya o tek noktayi tutar.
//
// NEDEN YENI BAGIMLILIK YOK: AES-256-GCM Node cekirdeginde (OpenSSL).
// GCM secildi cunku hem gizlilik hem BUTUNLUK saglar: bozulmus ya da
// elle degistirilmis bir kayit sessizce yanlis cozulmez, dogrulama
// etiketi (tag) tutmaz ve hata firlatir.
//
// BICIM: v1:iv:tag:ciphertext  — parcalar base64url, ayirac iki nokta.
//   v1  : surum oneki. Ileride anahtar turetme ya da sifre degisirse
//         eski kayitlar taninmaya devam eder (passwords.js'in ozetin
//         icine N/r/p yazma gerekcesinin aynisi).
//   iv  : 12 bayt rastgele (GCM'in onerilen nonce boyu).
//   tag : 16 bayt GCM dogrulama etiketi.
// base64url secildi: JSON icinde ve gerekirse URL'de ek kacis
// gerektirmez, '+' ve '/' karakterleri cikmaz.
//
// ---------------------------- KRITIK KURAL ---------------------------
// `SETTINGS_SECRET` tanimli DEGILSE bu modul sifreleme YAPMAZ ve acik
// Turkce mesajla hata firlatir. Sessizce duz metin yazmak en kotu
// secenektir: yonetici sifresinin korundugunu sanir, oysa veritabani
// yedeginde acik durur. Cagiran taraf (settingsService) bu hatayi
// kullaniciya gosterir ve KAYDI YAPMAZ.
// ---------------------------------------------------------------------
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from './http.js';

/** Sifreleme surum oneki — bicim degisirse artirilir. */
export const SECRET_VERSION = 'v1';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;   // AES-256
const IV_BYTES = 12;    // GCM nonce
const TAG_BYTES = 16;   // GCM dogrulama etiketi

/**
 * Adminin ekranda gorecegi mesaj. TEK yerde duruyor ki backend hatasi,
 * arayuzdeki devre disi form aciklamasi ve /durum sayfasi ayrisamasin.
 */
export const SETTINGS_SECRET_MISSING_MESSAGE =
  'SETTINGS_SECRET tanımlı değil, SMTP şifresi kaydedilemez. '
  + 'Sunucuda 32 baytlık bir anahtar tanımlanmalı: '
  + '`openssl rand -hex 32` çıktısını SETTINGS_SECRET ortam değişkenine yazın ve backend\'i yeniden başlatın.';

/** Anahtarin bicimi bozuksa gosterilecek mesaj. */
export const SETTINGS_SECRET_INVALID_MESSAGE =
  'SETTINGS_SECRET tanımlı ama geçersiz: 32 baytlık bir değer olmalı '
  + '(64 karakter hex ya da base64). Şifre kaydedilemez.';

/** Sir sifreleme hatalari icin ayri kod — arayuz bunu tanir ve formu kapatir. */
export const SETTINGS_SECRET_ERROR_CODE = 'SETTINGS_SECRET_YOK';

/**
 * Ham ortam degiskenini 32 baytlik anahtara cevirir.
 * Hex (64 karakter) ya da base64/base64url kabul eder.
 *
 * Kasten TURETME YOK (scrypt/HKDF ile "kisa parolayi anahtara cevirme"):
 * zayif bir parolayi guclu bir anahtar gibi gostermek yanlis guven verir.
 * Anahtar dogrudan 32 bayt olmak zorunda.
 *
 * @returns {Buffer|null} gecerliyse anahtar, degilse null
 */
function parseKey(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  if (/^[0-9a-fA-F]{64}$/.test(s)) {
    return Buffer.from(s, 'hex');
  }
  // base64 / base64url — uzunluk 32 bayta cozulmelidir.
  try {
    const buf = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    return buf.length === KEY_BYTES ? buf : null;
  } catch {
    return null;
  }
}

/**
 * Anahtarin durumu. Arayuz bunu okuyup SMTP sifre alanini devre disi
 * birakir ve NEDENINI yazar.
 *
 * @returns {{available: boolean, reason: string|null, kod: string|null}}
 */
export function settingsSecretStatus() {
  const raw = process.env.SETTINGS_SECRET;
  if (raw === undefined || String(raw).trim() === '') {
    return { available: false, reason: SETTINGS_SECRET_MISSING_MESSAGE, kod: 'yok' };
  }
  if (!parseKey(raw)) {
    return { available: false, reason: SETTINGS_SECRET_INVALID_MESSAGE, kod: 'gecersiz' };
  }
  return { available: true, reason: null, kod: 'hazir' };
}

/** Kisayol: sifre kaydedilebilir mi? */
export function hasSettingsSecret() {
  return settingsSecretStatus().available;
}

/**
 * Anahtari dondurur; yoksa ya da bozuksa acik Turkce mesajla 400 firlatir.
 * Cagiran taraf bu hatayi yakalamaz — merkezi hata yakalayici admine
 * dogrudan gosterir.
 */
function requireKey() {
  const status = settingsSecretStatus();
  if (!status.available) {
    throw new ApiError(400, SETTINGS_SECRET_ERROR_CODE, status.reason);
  }
  return parseKey(process.env.SETTINGS_SECRET);
}

/** base64url kodlama (padding'siz). */
function b64u(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url cozme. */
function unb64u(str) {
  return Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Duz metni sifreler.
 *
 * @param {string} plain
 * @returns {string} `v1:iv:tag:ciphertext`
 * @throws {ApiError} SETTINGS_SECRET yok/gecersizse (kod: SETTINGS_SECRET_YOK)
 */
export function encryptSecret(plain) {
  if (typeof plain !== 'string' || plain === '') {
    throw ApiError.badRequest('Şifrelenecek değer boş olamaz.');
  }
  const key = requireKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [SECRET_VERSION, b64u(iv), b64u(tag), b64u(ciphertext)].join(':');
}

/** Saklanan deger bu modulun urettigi bicimde mi? */
export function isEncryptedSecret(stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split(':');
  return parts.length === 4 && parts[0] === SECRET_VERSION;
}

/**
 * Sifrelenmis degeri cozer.
 *
 * Butunluk hatasi (tag tutmazsa) SESSIZCE YUTULMAZ: yanlis anahtarla
 * cozulmus bir SMTP sifresi ile e-posta gondermeye calismak, "kimlik
 * dogrulama basarisiz" diye anlasilmaz bir hataya donusurdu.
 *
 * @param {string} stored
 * @returns {string} duz metin
 * @throws {ApiError}
 */
export function decryptSecret(stored) {
  if (!isEncryptedSecret(stored)) {
    throw ApiError.badRequest('Saklanan sır biçimi tanınmıyor (beklenen ön ek: v1).');
  }
  const key = requireKey();
  const [, ivPart, tagPart, ctPart] = stored.split(':');
  const iv = unb64u(ivPart);
  const tag = unb64u(tagPart);
  const ciphertext = unb64u(ctPart);

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw ApiError.badRequest('Saklanan sır bozuk: başlangıç vektörü ya da doğrulama etiketi eksik.');
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new ApiError(
      400,
      'SIR_COZULEMEDI',
      'Saklanan şifre çözülemedi. SETTINGS_SECRET değeri, şifre kaydedildiği andakinden farklı olabilir. '
      + 'Doğru anahtarı geri yükleyin ya da SMTP şifresini yeniden girin.',
    );
  }
}

/**
 * Iki sirri sabit zamanda karsilastirir. Test ucunun "girilen sifre
 * kayitli olanla ayni mi" kontrolunde kullanilir; `===` ilk farkli
 * baytta donerdi.
 */
export function secretsEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export default {
  SECRET_VERSION,
  SETTINGS_SECRET_MISSING_MESSAGE,
  SETTINGS_SECRET_INVALID_MESSAGE,
  SETTINGS_SECRET_ERROR_CODE,
  settingsSecretStatus,
  hasSettingsSecret,
  encryptSecret,
  decryptSecret,
  isEncryptedSecret,
  secretsEqual,
};
