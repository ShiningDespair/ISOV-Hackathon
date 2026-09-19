// ---------------------------------------------------------------------
// UYGULAMA AYARLARI — `app_settings` anahtar/deger tablosu
//
// NEDEN ANAHTAR/DEGER (genis tek satirli ayar tablosu DEGIL):
// Her yeni ayar bir ALTER TABLE olmasin. Bedeli kolon basina tip
// guvencesinin kaybi -> uygulama katmaninda zod semasi ile odenir
// (zod zaten bagimlilikta, yeni paket YOK).
//
// SAPMA-ONLY DESEN (tenant_source_prefs ve user_profiles'tan miras):
// Varsayilanlar KODDA durur. Satir yoksa varsayilan gecerlidir; bos
// durum, "ayarlar yuklenemedi" ekrani ya da yarim yapilandirma yok.
// Somut sonucu: temiz bir veritabaninda panel ilk açılışta calisir.
//
// SIRLAR:
// `smtp.password` bir SIRDIR. Veritabaninda yalnizca AES-256-GCM ile
// sifrelenmis hali (`password_enc`) durur, API yanitinda ASLA donmez —
// yerine `{tanimli: true|false}` doner. SETTINGS_SECRET yoksa sifre
// KAYDEDILMEZ (lib/secrets.js firlatir); sessizce duz metin yazmak en
// kotu secenektir.
//
// TEK YAZMA NOKTASI: butun dogrulama, sir sifreleme ve varsayilan
// harmanlamasi burada. Route katmani (routes/admin.js) yalnizca yetki
// kontrolu yapip bu fonksiyonlari cagirir.
// ---------------------------------------------------------------------
import { z } from 'zod';
import { query, queryOne } from '../lib/db.js';
import { ApiError } from '../lib/http.js';
import { parseJsonColumn, toIso } from '../lib/serialize.js';
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  settingsSecretStatus,
} from '../lib/secrets.js';

/** Yonetilebilir ayar anahtarlari — CONTRACT.md "Yonetim ucları". */
export const SETTING_KEYS = Object.freeze([
  'smtp', 'auth', 'personalization', 'digest', 'branding',
]);

/**
 * Hangi anahtar sir tasiyor. `app_settings.is_secret` bu tablodan
 * yazilir; boylece "bu satir maskelenmeli mi" sorusu veritabanindan da
 * okunabilir (denetim kolaylasir), ama DOGRULUK KAYNAGI buradaki kod.
 */
const KEY_HAS_SECRET = Object.freeze({
  smtp: true, auth: false, personalization: false, digest: false, branding: false,
});

/** Sir tasiyan alanlarin saklanma adi -> API'de gorunen "tanimli mi" adi. */
const SECRET_FIELDS = Object.freeze({
  smtp: [{ input: 'password', stored: 'password_enc', flag: 'password_tanimli' }],
});

// ---------------------------------------------------------------------
// SEMALAR
//
// Mesajlar duzgun Turkce imla ile yazilir; dogrudan admine gosterilir.
// Sinirlar keyfi degil: port 1..65535 (TCP), saat 0..23 (gun), agirliklar
// 0..1 (harman katsayisi), pin_ratio 0..0,5 (yarisindan fazlasi
// sabitlenirse siralama kisisel olmaktan cikar).
// ---------------------------------------------------------------------

const hostSchema = z.string().trim().max(190, 'Sunucu adresi en fazla 190 karakter olabilir.');
const emailSchema = z.string().trim().max(190).refine(
  (v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  'Geçerli bir e-posta adresi girin.',
);

const SCHEMAS = Object.freeze({
  smtp: z.object({
    host: hostSchema,
    port: z.number({ invalid_type_error: 'Port bir sayı olmalıdır.' })
      .int('Port tam sayı olmalıdır.')
      .min(1, 'Port 1 ile 65535 arasında olmalıdır.')
      .max(65535, 'Port 1 ile 65535 arasında olmalıdır.'),
    // TLS/SSL: 465 icin true (implicit TLS), 587 icin false (STARTTLS).
    secure: z.boolean({ invalid_type_error: 'Güvenli bağlantı alanı açık ya da kapalı olmalıdır.' }),
    user: z.string().trim().max(190, 'Kullanıcı adı en fazla 190 karakter olabilir.'),
    // SIR — duz metin ASLA saklanmaz; yalnizca sifreli hali tutulur.
    password_enc: z.string().nullable(),
    from_name: z.string().trim().max(120, 'Gönderen adı en fazla 120 karakter olabilir.'),
    from_email: emailSchema,
  }),

  auth: z.object({
    registration_open: z.boolean({ invalid_type_error: 'Kayıt alanı açık ya da kapalı olmalıdır.' }),
    // Bos dizi = kisitlama yok. Alan adlari kucuk harfe cekilir.
    allowed_email_domains: z.array(
      z.string().trim().toLowerCase().max(190)
        .refine((v) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(v), 'Alan adı geçersiz (örnek: iso.org.tr).'),
    ).max(20, 'En fazla 20 alan adı tanımlanabilir.'),
    min_password_length: z.number().int()
      .min(8, 'En az şifre uzunluğu 8 karakterin altına indirilemez.')
      .max(64, 'En az şifre uzunluğu 64 karakterden büyük olamaz.'),
    session_ttl_hours: z.number().int()
      .min(1, 'Oturum süresi en az 1 saat olmalıdır.')
      .max(8760, 'Oturum süresi en fazla 8.760 saat (1 yıl) olabilir.'),
  }),

  // Agirliklar demo gunu DEPLOY'SUZ ayarlanabilsin diye ayar tablosunda.
  // Toplamlarinin 1 olmasi zorunlu: aksi halde "kisisel skor" olcegi
  // global skorla karsilastirilamaz hale gelir ve bant esikleri kayar.
  personalization: z.object({
    enabled: z.boolean({ invalid_type_error: 'Kişiselleştirme açık ya da kapalı olmalıdır.' }),
    global_weight: z.number().min(0, 'Ağırlık 0 ile 1 arasında olmalıdır.').max(1, 'Ağırlık 0 ile 1 arasında olmalıdır.'),
    personal_weight: z.number().min(0, 'Ağırlık 0 ile 1 arasında olmalıdır.').max(1, 'Ağırlık 0 ile 1 arasında olmalıdır.'),
    // KRITIK haberlerin listenin basina sabitlenme payi (filtre balonu korumasi).
    pin_ratio: z.number().min(0, 'Sabitleme payı 0 ile 0,5 arasında olmalıdır.').max(0.5, 'Sabitleme payı 0 ile 0,5 arasında olmalıdır.'),
  }).refine(
    (v) => Math.abs(v.global_weight + v.personal_weight - 1) < 0.0005,
    { message: 'Genel ve kişisel ağırlıkların toplamı 1 olmalıdır.', path: ['global_weight'] },
  ),

  digest: z.object({
    enabled: z.boolean({ invalid_type_error: 'Bülten açık ya da kapalı olmalıdır.' }),
    default_hour: z.number().int()
      .min(0, 'Gönderim saati 0 ile 23 arasında olmalıdır.')
      .max(23, 'Gönderim saati 0 ile 23 arasında olmalıdır.'),
    max_items: z.number().int()
      .min(1, 'Bültendeki haber sayısı en az 1 olmalıdır.')
      .max(60, 'Bültendeki haber sayısı en fazla 60 olabilir.'),
  }),

  branding: z.object({
    site_name: z.string().trim().min(1, 'Site adı boş olamaz.').max(120, 'Site adı en fazla 120 karakter olabilir.'),
    footer_note: z.string().trim().max(300, 'Alt bilgi notu en fazla 300 karakter olabilir.'),
  }),
});

/**
 * VARSAYILANLAR — satir yoksa bunlar gecerli.
 * Object.freeze + her okumada kopya: cagiran taraf varsayilani
 * degistirirse butun surec etkilenmesin.
 */
const DEFAULTS = Object.freeze({
  smtp: Object.freeze({
    host: '',
    port: 587,           // STARTTLS; 465 kullanan sunucularda secure=true yapilir
    secure: false,
    user: '',
    password_enc: null,
    from_name: 'İSO · İSOV Dış Kaynak İzleme',
    from_email: '',
  }),
  auth: Object.freeze({
    registration_open: true,
    allowed_email_domains: Object.freeze([]),
    // lib/passwords.js MIN_PASSWORD_LENGTH ile ayni taban.
    min_password_length: 10,
    session_ttl_hours: 168,   // 7 gün
  }),
  personalization: Object.freeze({
    enabled: true,
    // CONTRACT.md: final = 0,62 * global + 0,38 * kisisel
    global_weight: 0.62,
    personal_weight: 0.38,
    pin_ratio: 0.2,
  }),
  digest: Object.freeze({
    enabled: true,
    default_hour: 8,          // TRT
    max_items: 12,            // 5 dakikalik vakit butcesinin yogunlugu
  }),
  branding: Object.freeze({
    site_name: 'İSO · İSOV Dış Kaynak İzleme',
    footer_note: '',
  }),
});

/** Varsayilanin derin kopyasi (dondurulmus nesne yazilamaz). */
function defaultsFor(key) {
  return JSON.parse(JSON.stringify(DEFAULTS[key]));
}

/** Anahtar dogrulama — bilinmeyen anahtar 404, cunku yol parametresi. */
export function assertSettingKey(key) {
  const k = String(key ?? '').trim().toLowerCase();
  if (!SETTING_KEYS.includes(k)) {
    throw ApiError.notFound(
      `Bilinmeyen ayar anahtarı: "${key}". Geçerli anahtarlar: ${SETTING_KEYS.join(', ')}.`,
    );
  }
  return k;
}

/** zod hatasini tek satirlik, okunur Turkce mesaja cevirir. */
function zodMessage(error) {
  const issues = Array.isArray(error?.issues) ? error.issues : [];
  if (issues.length === 0) return 'Gönderilen ayar değerleri geçersiz.';
  return issues
    .map((i) => {
      const path = Array.isArray(i.path) ? i.path.filter((p) => p !== 'password_enc').join('.') : '';
      return path ? `${path}: ${i.message}` : i.message;
    })
    .join(' ');
}

// ---------------------------------------------------------------------
// OKUMA
// ---------------------------------------------------------------------

/**
 * HAM ayar degeri: varsayilanlar + veritabanindaki sapmalar.
 * Sirlarin SIFRELI hali (password_enc) bu nesnede DURUR — bu yuzden
 * dogrudan API'ye verilmez; `maskSetting()` uygulanir.
 *
 * @param {string} key
 * @returns {Promise<{key:string, value:object, updated_at:string|null, updated_by:number|null, exists:boolean}>}
 */
export async function getSetting(key) {
  const k = assertSettingKey(key);
  const row = await queryOne(
    'SELECT setting_key, value, is_secret, updated_by, updated_at FROM app_settings WHERE setting_key = ?',
    [k],
  );

  const stored = row ? parseJsonColumn(row.value, {}) : {};
  // Varsayilanin USTUNE sapmalar: yeni bir alan eklendiginde eski satirlar
  // kirilmaz, eksik alan varsayilanindan gelir.
  const value = { ...defaultsFor(k), ...(stored && typeof stored === 'object' ? stored : {}) };

  return {
    key: k,
    value,
    exists: Boolean(row),
    updated_at: row ? toIso(row.updated_at) : null,
    updated_by: row?.updated_by ? Number(row.updated_by) : null,
  };
}

/**
 * API'ye cikacak sekil: sirlar CIKARILIR, yerine `<alan>_tanimli` bayragi
 * konur. Bu fonksiyonu atlayan bir yol sir sizdirir; bu yuzden route
 * katmani HER ZAMAN buradan geciyor.
 */
export function maskSetting(key, value) {
  const k = assertSettingKey(key);
  const out = { ...value };
  for (const field of SECRET_FIELDS[k] ?? []) {
    const stored = out[field.stored];
    out[field.flag] = typeof stored === 'string' && stored.length > 0;
    delete out[field.stored];
    delete out[field.input];   // duz metin hic saklanmasa da savunmaci silme
  }
  return out;
}

/** Tek ayarin API sekli — sirlar maskeli, sir anahtari durumu ekli. */
export async function getSettingForApi(key) {
  const rec = await getSetting(key);
  const out = {
    key: rec.key,
    value: maskSetting(rec.key, rec.value),
    varsayilan: !rec.exists,
    updated_at: rec.updated_at,
    updated_by: rec.updated_by,
  };
  if (KEY_HAS_SECRET[rec.key]) out.sir_anahtari = settingsSecretStatus();
  return out;
}

/** Tum ayarlar tek yanitta — panel ilk acilista tek istek atsin. */
export async function getAllSettingsForApi() {
  const entries = await Promise.all(SETTING_KEYS.map((k) => getSettingForApi(k)));
  const out = {};
  for (const e of entries) out[e.key] = e;
  return out;
}

// ---------------------------------------------------------------------
// YAZMA
// ---------------------------------------------------------------------

/**
 * Anahtara ozel on isleme: sirlarin sifrelenmesi ve turetilen alanlar.
 *
 * @param {string} k        ayar anahtari
 * @param {object} current  mevcut HAM deger (varsayilan harmanlanmis)
 * @param {object} patch    istekten gelen alanlar
 * @returns {object} semaya verilecek tam nesne
 */
function prepareValue(k, current, patch) {
  const merged = { ...current, ...patch };

  // --- Sirlar ---------------------------------------------------------
  for (const field of SECRET_FIELDS[k] ?? []) {
    // API'de donmeyen bayrak geri gelirse yoksay (yuvarlak gidis-donus).
    delete merged[field.flag];

    const incoming = patch[field.input];

    if (incoming === undefined) {
      // Alan gonderilmedi -> mevcut sifreli deger KORUNUR.
      merged[field.stored] = current[field.stored] ?? null;
    } else if (incoming === null || String(incoming).trim() === '') {
      // Bos gonderim = "sifreyi sil". Bos string ile "degistirme" ayrimi
      // arayuzde de boyle: alan bos birakilirsa istege konmaz.
      merged[field.stored] = null;
    } else {
      if (typeof incoming !== 'string') {
        throw ApiError.badRequest('Şifre alanı metin olmalıdır.');
      }
      if (incoming.length > 400) {
        throw ApiError.badRequest('Şifre en fazla 400 karakter olabilir.');
      }
      // KRITIK: SETTINGS_SECRET yoksa burada ApiError firlar ve HICBIR SEY
      // kaydedilmez — duz metin yazma yolu YOK.
      merged[field.stored] = encryptSecret(incoming);
    }
    delete merged[field.input];
  }

  // --- Turetilen alanlar ----------------------------------------------
  if (k === 'personalization') {
    // Arayuzde tek kaydiraci var; yalnizca biri gelirse digerini turet.
    // Boylece "toplam 1 olmali" kurali kullaniciyi bir hataya carpmaz.
    const hasG = patch.global_weight !== undefined;
    const hasP = patch.personal_weight !== undefined;
    if (hasG && !hasP && Number.isFinite(Number(patch.global_weight))) {
      merged.personal_weight = Math.round((1 - Number(patch.global_weight)) * 1000) / 1000;
    } else if (hasP && !hasG && Number.isFinite(Number(patch.personal_weight))) {
      merged.global_weight = Math.round((1 - Number(patch.personal_weight)) * 1000) / 1000;
    }
    // Ondalik gurultusu 1 toplamini bozmasin (0,62 + 0,38 = 0,9999...).
    for (const f of ['global_weight', 'personal_weight', 'pin_ratio']) {
      if (Number.isFinite(Number(merged[f]))) {
        merged[f] = Math.round(Number(merged[f]) * 1000) / 1000;
      }
    }
  }

  if (k === 'smtp') {
    // 465 implicit TLS, 587 STARTTLS — kullanici secure'u hic gondermezse
    // porta gore makul varsayim. Acikca gonderilmisse DOKUNULMAZ.
    if (patch.secure === undefined && patch.port !== undefined) {
      merged.secure = Number(patch.port) === 465;
    }
  }

  return merged;
}

/**
 * Ayari kaydeder. Kismi govde kabul eder: gonderilmeyen alanlar mevcut
 * degerini korur (PUT gibi degil, PATCH gibi davranir — arayuzde SMTP
 * sifresini her kayitta yeniden yazdirmamak icin ZORUNLU).
 *
 * @param {string} key
 * @param {object} patch
 * @param {number|null} userId  degisikligi yapan admin (denetim izi)
 */
export async function setSetting(key, patch, userId = null) {
  const k = assertSettingKey(key);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw ApiError.badRequest('Ayar gövdesi bir nesne olmalıdır.');
  }

  const current = (await getSetting(k)).value;
  const prepared = prepareValue(k, current, patch);

  const parsed = SCHEMAS[k].safeParse(prepared);
  if (!parsed.success) {
    throw ApiError.badRequest(zodMessage(parsed.error));
  }
  const value = parsed.data;

  await query(
    `INSERT INTO app_settings (setting_key, value, is_secret, updated_by)
     VALUES (?, CAST(? AS JSON), ?, ?)
     ON DUPLICATE KEY UPDATE
       value = VALUES(value),
       is_secret = VALUES(is_secret),
       updated_by = VALUES(updated_by)`,
    [k, JSON.stringify(value), KEY_HAS_SECRET[k] ? 1 : 0, userId ?? null],
  );

  return getSettingForApi(k);
}

// ---------------------------------------------------------------------
// SMTP — gonderim tarafi icin
// ---------------------------------------------------------------------

/**
 * Posta servisinin kullanacagi SMTP yapilandirmasi. Sifre BURADA cozulur
 * ve BU FONKSIYONUN DISINA yalnizca gonderim katmanina verilir; hicbir
 * route bunu dogrudan yanita koymaz.
 *
 * @returns {Promise<{yapilandirilmis:boolean, eksik:string[], config:object}>}
 */
export async function getSmtpTransportConfig() {
  const { value } = await getSetting('smtp');

  const eksik = [];
  if (!value.host) eksik.push('sunucu adresi');
  if (!value.from_email) eksik.push('gönderen e-posta adresi');
  if (!value.password_enc) eksik.push('şifre');

  let password = null;
  if (value.password_enc) {
    // Anahtar degismisse burada anlasilir hata firlar; sessiz basarisizlik yok.
    password = isEncryptedSecret(value.password_enc) ? decryptSecret(value.password_enc) : null;
    if (password === null) eksik.push('şifre (saklanan biçim tanınmıyor)');
  }

  return {
    yapilandirilmis: eksik.length === 0,
    eksik,
    config: {
      host: value.host,
      port: value.port,
      secure: value.secure,
      auth: value.user ? { user: value.user, pass: password } : null,
      from: value.from_name ? `${value.from_name} <${value.from_email}>` : value.from_email,
      from_email: value.from_email,
      from_name: value.from_name,
    },
  };
}

export default {
  SETTING_KEYS,
  assertSettingKey,
  getSetting,
  getSettingForApi,
  getAllSettingsForApi,
  maskSetting,
  setSetting,
  getSmtpTransportConfig,
};
