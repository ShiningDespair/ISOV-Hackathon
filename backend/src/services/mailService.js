// ---------------------------------------------------------------------
// POSTA SERVISI — SMTP gonderimi + email_log kaydi
//
// OPSIYONEL BAGIMLILIK DESENI (services/llm.js sozlesmesi, HARFIYEN):
//   * `nodemailer` DINAMIK IMPORT ile yuklenir. Paket kurulu degilse API
//     yine ayaga kalkar, yalnizca gonderim devre disi kalir.
//   * `isAvailable()` tek dogruluk noktasidir ve SENKRONDUR.
//   * BU MODUL ASLA ISTISNA FIRLATMAZ. `sendMail` her durumda bir zarf
//     doner (`{ok:false, error}`) ve basarisizlikta email_log'a
//     `status='hata'` yazar. Bir bulten isi 40 kullanicinin 7'sinde
//     SMTP hatasi aldi diye durmamali.
//
// AYAR KAYNAGI SIRASI:
//   1) `app_settings.smtp` — admin panelinden yazilir, sifre AES-256-GCM
//      ile saklanir ve `lib/secrets.js` ile cozulur
//      (services/settingsService.js:getSmtpTransportConfig).
//   2) `SMTP_URL` env (or. smtps://kullanici:sifre@mail.ornek.com:465)
//   3) `SMTP_HOST` + `SMTP_PORT` + `SMTP_USER` + `SMTP_PASSWORD` env
//   Hicbiri yoksa `available:false` ve gonderim denenmez.
//
// NEDEN DB ONCE: demo makinesinde .env'i degistirmek konteyner yeniden
// baslatmak demek; admin panelinden SMTP girmek ise aninda etkili olmali.
//
// HIZ SINIRI: AYNI ALICIYA dakikada en fazla 5 e-posta. Hem bellek-ici
// pencere hem email_log sorgusu ile kontrol edilir — bellek yeniden
// baslatmada sifirlanir, DB sayaci ise sifirlanmaz; ikisinin birlikte
// olmasi "konteyner restart atilarak sinir asilir" acigini kapatir.
// ---------------------------------------------------------------------
import { createHash } from 'node:crypto';
import { query, queryOne } from '../lib/db.js';
import { getSmtpTransportConfig } from './settingsService.js';

/** Alici basina pencere (ms) ve azami gonderim. */
export const RATE_WINDOW_MS = 60_000;
export const RATE_MAX_PER_RECIPIENT = Math.max(
  1,
  Number(process.env.MAIL_RATE_PER_MINUTE || 5),
);

/** email_log.kind ENUM degerleri — sema ile birebir. */
export const MAIL_KINDS = Object.freeze([
  'dogrulama', 'sifre-sifirlama', 'bulten', 'davet', 'paylasim', 'uyari', 'test',
]);

// --- dahili durum ----------------------------------------------------

let nodemailerPromise = null;
let cachedTransport = null;   // { signature, transport, config, source }
/** Son basarili yapilandirma okumasi — senkron isAvailable() bunu okur. */
let lastConfigKnownGood = false;
const rateWindows = new Map(); // e-posta -> zaman damgasi dizisi

/** nodemailer'i tembel yukler; paket yoksa null (uyari basar, throw etmez). */
async function getNodemailer() {
  if (!nodemailerPromise) {
    nodemailerPromise = import('nodemailer')
      .then((mod) => mod.default ?? mod)
      .catch((err) => {
        console.warn('[mail] nodemailer yuklenemedi, gonderim devre disi:', err.message);
        return null;
      });
  }
  return nodemailerPromise;
}

// ---------------------------------------------------------------------
// YAPILANDIRMA
// ---------------------------------------------------------------------

function envConfig() {
  const url = String(process.env.SMTP_URL || '').trim();
  const from = String(process.env.SMTP_FROM || '').trim();

  if (url) {
    return {
      source: 'env:SMTP_URL',
      transport: url,
      from: from || String(process.env.SMTP_USER || '').trim() || null,
    };
  }

  const host = String(process.env.SMTP_HOST || '').trim();
  if (!host) return null;

  const port = Number(process.env.SMTP_PORT || 587);
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '');
  return {
    source: 'env:SMTP_HOST',
    transport: {
      host,
      port,
      // 465 daima ortuk TLS; digerlerinde STARTTLS (secure=false + requireTLS).
      secure: String(process.env.SMTP_SECURE || (port === 465 ? 'true' : 'false')) === 'true',
      auth: user ? { user, pass } : undefined,
    },
    from: from || user || null,
  };
}

/**
 * Gonderim yapilandirmasini cozer. app_settings once, sonra env.
 * ASLA throw etmez: sir cozulemezse (SETTINGS_SECRET degismis) hata
 * mesaji zarfta doner.
 *
 * @returns {Promise<{ok:boolean, source?:string, transport?:any, from?:string, missing?:string[], error?:string}>}
 */
export async function loadMailConfig() {
  let dbMissing = [];
  let dbError = null;

  // 1) Veritabani ayari
  try {
    const smtp = await getSmtpTransportConfig();
    if (smtp?.yapilandirilmis && smtp.config?.host) {
      lastConfigKnownGood = true;
      const port = Number(smtp.config.port || 587);
      return {
        ok: true,
        source: 'app_settings.smtp',
        transport: {
          host: smtp.config.host,
          port,
          secure: smtp.config.secure ?? port === 465,
          auth: smtp.config.auth || undefined,
        },
        from: smtp.config.from || smtp.config.from_email || null,
      };
    }
    // Eksik alanlar env yoluna dusmeyi engellemez; env varsa o kullanilir.
    dbMissing = smtp?.eksik || [];
  } catch (err) {
    // SETTINGS_SECRET kaybolmus / sir bozulmus / DB erisilemiyor olabilir.
    console.warn('[mail] app_settings.smtp okunamadi:', err.message);
    dbError = err.message;
  }

  // 2) Ortam degiskenleri
  const env = envConfig();
  if (env) {
    lastConfigKnownGood = true;
    return { ok: true, ...env };
  }

  lastConfigKnownGood = false;
  return {
    ok: false,
    missing: dbMissing.length ? dbMissing : ['SMTP sunucu adresi'],
    error: dbError
      ? `SMTP yapılandırması okunamadı: ${dbError}`
      : 'SMTP yapılandırılmadı. Yönetim panelinden SMTP ayarlarını girin veya SMTP_URL ortam değişkenini tanımlayın.',
  };
}

/**
 * Gonderim kullanilabilir mi? TEK DOGRULUK NOKTASI (llm.js:isAvailable).
 *
 * DIKKAT — SENKRON: SMTP ayarlarinin bir kismi VERITABANINDA (app_settings)
 * ve onu senkron okumanin yolu yok. Bu yuzden:
 *   * env'de SMTP tanimliysa dogrudan true,
 *   * degilse, bu surecte DAHA ONCE basarili bir yapilandirma okunduysa true.
 * Yani "henuz hic denenmemis + yalnizca DB'de tanimli" durumda false doner.
 * Cagiranlar icin dogru soru genelde `isAvailableAsync()`; senkron surum
 * llm.js sozlesmesini korumak ve hizli on eleme yapmak icin var.
 */
export function isAvailable() {
  if (String(process.env.MAIL_ENABLED ?? 'true').toLowerCase() === 'false') return false;
  if (String(process.env.SMTP_URL || process.env.SMTP_HOST || '').trim()) return true;
  return lastConfigKnownGood;
}

/** Gercek cevap: yapilandirmayi (gerekirse DB'den) okur. */
export async function isAvailableAsync() {
  if (String(process.env.MAIL_ENABLED ?? 'true').toLowerCase() === 'false') return false;
  const cfg = await loadMailConfig();
  return cfg.ok === true;
}

/** Tani bilgisi — admin panelindeki "SMTP durumu" gostergesi icin. */
export async function mailStatus() {
  const cfg = await loadMailConfig();
  const nm = await getNodemailer();
  // Yapilandirma yoksa `transport` TANIMSIZ olur; '(SMTP_URL)' yazmak
  // "URL ile yapilandirilmis" izlenimi verirdi. Once ok kontrolu.
  const asObject = cfg.ok && cfg.transport && typeof cfg.transport === 'object';
  const asUrl = cfg.ok && typeof cfg.transport === 'string';
  return {
    available: cfg.ok === true && nm !== null,
    nodemailer: nm !== null,
    source: cfg.source || null,
    host: asObject ? (cfg.transport.host ?? null) : (asUrl ? '(SMTP_URL)' : null),
    port: asObject ? (cfg.transport.port ?? null) : null,
    from: cfg.from || null,
    missing: cfg.missing || [],
    error: cfg.error || null,
    rate_limit: { window_ms: RATE_WINDOW_MS, max_per_recipient: RATE_MAX_PER_RECIPIENT },
  };
}

/** Yapilandirma imzasi — degisince tasiyici yeniden kurulur. */
function signatureOf(cfg) {
  return createHash('sha1')
    .update(JSON.stringify({ s: cfg.source, t: cfg.transport, f: cfg.from }))
    .digest('hex');
}

/** Tasiyici (transport) — ayni yapilandirmada yeniden kullanilir. */
async function getTransport() {
  const cfg = await loadMailConfig();
  if (!cfg.ok) return { ok: false, error: cfg.error, missing: cfg.missing };

  const nm = await getNodemailer();
  if (!nm) {
    return { ok: false, error: 'nodemailer paketi kurulu değil; e-posta gönderimi devre dışı.' };
  }

  const signature = signatureOf(cfg);
  if (cachedTransport?.signature === signature) {
    return { ok: true, transport: cachedTransport.transport, config: cfg };
  }

  try {
    if (cachedTransport?.transport?.close) cachedTransport.transport.close();
  } catch { /* yoksay */ }

  try {
    const transport = nm.createTransport(
      typeof cfg.transport === 'string' ? cfg.transport : {
        ...cfg.transport,
        // Baglanti kurulamadiginda is asili kalmasin.
        connectionTimeout: Number(process.env.SMTP_CONNECT_TIMEOUT_MS || 10_000),
        greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10_000),
        socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 20_000),
        // Tek konteyner, gece toplu gonderim: havuz kullanmak baglantiyi
        // yeniden kullanir ve sunucu tarafi "too many connections" yemez.
        pool: true,
        maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS || 2),
        maxMessages: Number(process.env.SMTP_MAX_MESSAGES || 50),
      },
    );
    cachedTransport = { signature, transport, config: cfg };
    return { ok: true, transport, config: cfg };
  } catch (err) {
    return { ok: false, error: `SMTP taşıyıcısı kurulamadı: ${err.message}` };
  }
}

/**
 * Admin panelinin "bağlantıyı test et" dugmesi.
 * ASLA throw etmez.
 */
export async function verifyConnection() {
  const t = await getTransport();
  if (!t.ok) {
    return { ok: false, error: t.error, missing: t.missing || [] };
  }
  try {
    await t.transport.verify();
    const cfg = t.config;
    return {
      ok: true,
      source: cfg.source,
      host: typeof cfg.transport === 'object' ? cfg.transport.host : '(SMTP_URL)',
      port: typeof cfg.transport === 'object' ? cfg.transport.port : null,
      secure: typeof cfg.transport === 'object' ? Boolean(cfg.transport.secure) : null,
      from: cfg.from,
    };
  } catch (err) {
    return { ok: false, error: `SMTP bağlantısı doğrulanamadı: ${err.message}` };
  }
}

// ---------------------------------------------------------------------
// HIZ SINIRI
// ---------------------------------------------------------------------

function memoryRateCount(email) {
  const now = Date.now();
  const list = (rateWindows.get(email) || []).filter((t) => now - t < RATE_WINDOW_MS);
  rateWindows.set(email, list);
  return list.length;
}

function memoryRateMark(email) {
  const list = rateWindows.get(email) || [];
  list.push(Date.now());
  rateWindows.set(email, list);
}

/**
 * Alici bu dakika icinde sinira takildi mi?
 * DB sorgusu email_log'a bakar; sorgu hata verirse SINIR ENGELLEMEZ
 * (bellek sayaci yine korur) — DB dalgalanmasi bulteni durdurmasin.
 */
export async function rateLimited(email) {
  const key = String(email || '').toLowerCase();
  if (memoryRateCount(key) >= RATE_MAX_PER_RECIPIENT) {
    return { limited: true, source: 'bellek', count: memoryRateCount(key) };
  }
  try {
    const row = await queryOne(
      `SELECT COUNT(*) AS c FROM email_log
        WHERE LOWER(to_email) = ?
          AND queued_at >= (NOW() - INTERVAL 1 MINUTE)`,
      [key],
    );
    const count = Number(row?.c ?? 0);
    if (count >= RATE_MAX_PER_RECIPIENT) return { limited: true, source: 'email_log', count };
    return { limited: false, count };
  } catch (err) {
    console.warn('[mail] hiz siniri sorgusu basarisiz, bellek sayaci kullanilyor:', err.message);
    return { limited: false, count: memoryRateCount(key) };
  }
}

// ---------------------------------------------------------------------
// GONDERIM
// ---------------------------------------------------------------------

function normalizeKind(kind) {
  return MAIL_KINDS.includes(kind) ? kind : 'uyari';
}

/** HTML'den kaba duz metin — cok kisimli (multipart) e-posta icin. */
export function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * E-posta gonderir ve email_log'a yazar.
 *
 * ASLA ISTISNA FIRLATMAZ.
 *
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {string} [opts.text]           verilmezse html'den turetilir
 * @param {Array}  [opts.attachments]    [{filename, content:Buffer, contentType}]
 * @param {string} [opts.kind='uyari']   email_log.kind
 * @param {number} [opts.userId]
 * @param {string} [opts.digestDate]     'YYYY-MM-DD' — uq_email_once'in parcasi
 * @param {number[]} [opts.articleIds]
 * @param {number} [opts.reportId]
 * @param {boolean} [opts.dryRun]        gonderme, email_log'a da YAZMA
 * @returns {Promise<{ok:boolean, logId?:number, messageId?:string,
 *   skipped?:boolean, reason?:string, error?:string}>}
 */
export async function sendMail({
  to, subject, html, text, attachments = [],
  kind = 'uyari', userId = null, digestDate = null,
  articleIds = null, reportId = null, dryRun = false,
} = {}) {
  const recipient = String(to || '').trim();
  const konu = String(subject || '').trim().slice(0, 300);
  const kindSafe = normalizeKind(kind);

  if (!recipient || !recipient.includes('@')) {
    return { ok: false, error: 'Geçersiz alıcı adresi.', reason: 'gecersiz-alici' };
  }
  if (!konu) {
    return { ok: false, error: 'E-posta konusu boş olamaz.', reason: 'konu-yok' };
  }

  // DENEME KOSUMU: email_log'a HIC YAZMAZ. Sebep: uq_email_once
  // (user_id, kind, digest_date) yuvasini tuketirse gercek gonderim
  // "zaten gonderildi" diye atlanirdi.
  if (dryRun) {
    return { ok: true, dryRun: true, reason: 'deneme-kosumu', to: recipient, subject: konu };
  }

  // HIZ SINIRI KAYIT ACMADAN ONCE: takilan istek uq_email_once yuvasini
  // tuketmesin, sonra tekrar denenebilsin.
  const rate = await rateLimited(recipient);
  if (rate.limited) {
    console.warn(`[mail] hiz siniri: ${recipient} (${rate.count}/${RATE_MAX_PER_RECIPIENT}, ${rate.source})`);
    return {
      ok: false,
      reason: 'hiz-siniri',
      error: `Bu adrese son bir dakikada ${rate.count} e-posta gönderildi; `
        + `dakikada en fazla ${RATE_MAX_PER_RECIPIENT} gönderilir.`,
    };
  }

  const bodyHash = createHash('sha1').update(String(html || '')).digest('hex');
  const ids = Array.isArray(articleIds)
    ? articleIds.map(Number).filter(Number.isFinite).slice(0, 200)
    : null;

  // 1) KAYIT ACILIR (kuyrukta). Gonderim yarida kalirsa bile iz kalir.
  let logId = null;
  try {
    const result = await query(
      `INSERT INTO email_log
         (user_id, to_email, kind, digest_date, subject, body_hash, article_ids,
          status, attempt_count, report_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'kuyrukta', 0, ?)`,
      [
        userId ?? null, recipient.slice(0, 190), kindSafe, digestDate ?? null,
        konu, bodyHash, ids ? JSON.stringify(ids) : null, reportId ?? null,
      ],
    );
    logId = Number(result.insertId);
  } catch (err) {
    // uq_email_once: ayni kullaniciya ayni tur + ayni gun ikinci kez.
    // Bulten isi iki kez kossa da e-posta iki kez GITMEZ — sema garantisi.
    if (err?.code === 'ER_DUP_ENTRY') {
      return {
        ok: false, skipped: true, reason: 'zaten-kayitli',
        error: 'Bu alıcıya bu tür e-posta bu tarih için zaten kaydedilmiş.',
      };
    }
    console.error('[mail] email_log kaydi acilamadi:', err.message);
    // Kayit acilamadiysa gonderim de denenmez: izlenemeyen gonderim
    // en kotu secenek (ayni e-posta tekrar tekrar gidebilir).
    return { ok: false, error: `Gönderim kaydı açılamadı: ${err.message}`, reason: 'kayit-hatasi' };
  }

  // 2) TASIYICI
  const t = await getTransport();
  if (!t.ok) {
    await markFailed(logId, t.error || 'SMTP yapılandırılmadı.');
    return { ok: false, logId, error: t.error, reason: 'smtp-yok', missing: t.missing || [] };
  }

  // 3) GONDER
  memoryRateMark(recipient.toLowerCase());
  try {
    const info = await t.transport.sendMail({
      from: t.config.from || undefined,
      to: recipient,
      subject: konu,
      html: String(html || ''),
      text: text || htmlToText(html),
      attachments: (attachments || []).filter(Boolean),
    });

    await query(
      `UPDATE email_log
          SET status = 'gonderildi', sent_at = NOW(), attempt_count = attempt_count + 1,
              provider_message_id = ?, error = NULL
        WHERE id = ?`,
      [String(info?.messageId || '').slice(0, 190) || null, logId],
    ).catch((err) => console.error('[mail] basari kaydi yazilamadi:', err.message));

    return { ok: true, logId, messageId: info?.messageId || null, accepted: info?.accepted || [] };
  } catch (err) {
    await markFailed(logId, err.message);
    return { ok: false, logId, error: `E-posta gönderilemedi: ${err.message}`, reason: 'gonderim-hatasi' };
  }
}

/** email_log satirini hata olarak isaretler. Kendi hatasini yutar. */
async function markFailed(logId, message) {
  if (!logId) return;
  try {
    await query(
      `UPDATE email_log
          SET status = 'hata', error = ?, attempt_count = attempt_count + 1
        WHERE id = ?`,
      [String(message || 'bilinmeyen hata').slice(0, 500), logId],
    );
  } catch (err) {
    console.error('[mail] hata kaydi yazilamadi:', err.message);
  }
}

/** Bakim: bekleyen/basarisiz gonderim sayaclari (admin panel ozeti). */
export async function emailLogSummary({ days = 7 } = {}) {
  try {
    const rows = await query(
      `SELECT kind, status, COUNT(*) AS c
         FROM email_log
        WHERE queued_at >= (NOW() - INTERVAL ? DAY)
        GROUP BY kind, status
        ORDER BY kind, status`,
      [Math.max(1, Math.min(90, Number(days) || 7))],
    );
    return { ok: true, rows: rows.map((r) => ({ kind: r.kind, status: r.status, count: Number(r.c) })) };
  } catch (err) {
    return { ok: false, error: err.message, rows: [] };
  }
}

/** Havuzu kapatir (CLI isleri surec bitiminde cagirir). */
export function closeTransport() {
  try {
    if (cachedTransport?.transport?.close) cachedTransport.transport.close();
  } catch { /* yoksay */ }
  cachedTransport = null;
}

export default {
  isAvailable, isAvailableAsync, mailStatus, loadMailConfig,
  sendMail, verifyConnection, rateLimited, htmlToText, emailLogSummary,
  closeTransport, RATE_MAX_PER_RECIPIENT, MAIL_KINDS,
};
