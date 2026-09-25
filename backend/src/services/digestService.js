// ---------------------------------------------------------------------
// BULTEN SERVISI — kullanici basina icerik secimi ve gonderim
//
// ABONELIK: `user_newsletter_prefs`, SAPMA-ONLY.
//   Satir YOKSA varsayilan: haftalik, 08:00 (TRT), min_band = YUKSEK,
//   send_weekday = 1 (Pazartesi). Yani hicbir tercih girmemis kullanici
//   makul bir bulten alir; bos durum yok.
//
// HABER SAYISI: `user_profiles.time_budget_min` -> lib/positions.js DENSITY
//   (2 dk -> 5, 5 dk -> 12, 10 dk -> 20). `max_items` VERILMISSE O KAZANIR.
//   Ucuncu kademe 15 DEGIL 10 dakika (docs/SADELESTIRME.md §4); eski
//   kayitlardaki 15 degeri normalizeTimeBudget() ile 10'a eslenir.
//   Sayilar okuma suresi aritmetiginden geliyor (CONTRACT "Vakit butcesi"),
//   burada YENIDEN tanimlanmiyor — DENSITY'den okunuyor.
//
// SIRALAMA: kisisel siralama (services/personalize.js:listPersonalized)
//   kullanilir. Kisisel yol herhangi bir sebeple basarisiz olursa
//   (Qdrant kapali, profil vektoru yok, beklenmeyen hata) GLOBAL editoryal
//   siralamaya (importance_score DESC) DUSULUR — bulten hicbir kosulda
//   bos gitmemeli.
//
// IKI KEZ GONDERIM: `uq_email_once (user_id, kind, digest_date)` sema
//   garantisi. Ona GUVENILIYOR (INSERT dup hatasi yakalanir) ama AYRICA
//   gonderim oncesi kendi kontrolumuz de yapiliyor: sema garantisi
//   "gonderilmedi" demez, "iki kayit acilmaz" der; SMTP'ye bosa gidip
//   hata kaydi yazmadan once ucuz bir SELECT ile ayiklamak daha durust.
// ---------------------------------------------------------------------
import { query, queryOne } from '../lib/db.js';
import { toMysqlDate, toMysqlDateTime } from '../lib/http.js';
import { formatTrtDate } from '../lib/serialize.js';
import { densityOf } from '../lib/positions.js';
import { loadProfile, listPersonalized } from './personalize.js';
import { serializeArticleRows, ARTICLE_COLUMNS, ARTICLE_FROM } from './articleService.js';
import { sendMail } from './mailService.js';
import { isAvailable as pdfAvailable, renderDigestPdf } from './pdfService.js';
import { renderDigestMail } from '../templates/mail.js';

/** Tercih satiri yoksa gecerli olan varsayilanlar. */
export const DEFAULT_PREFS = Object.freeze({
  frequency: 'haftalik',
  send_hour: 8,
  send_weekday: 1,      // Pazartesi
  format: 'ozet',
  max_items: null,      // null -> time_budget_min'den turetilir
  min_band: 'YUKSEK',
  only_changes: 0,
});

/** Band siralamasi — min_band suzgecinin anlami bu sirayla tanimli. */
const BAND_RANK = Object.freeze({ DUSUK: 0, ORTA: 1, YUKSEK: 2, KRITIK: 3 });

/** min_band'e gore izin verilen band listesi. */
export function bandsAtLeast(minBand) {
  const floor = BAND_RANK[minBand] ?? BAND_RANK.YUKSEK;
  return Object.keys(BAND_RANK).filter((b) => BAND_RANK[b] >= floor);
}

/** Sert ust sinir: tek bultene 60'tan fazla haber girmez (okunmaz). */
export const MAX_ITEMS_HARD = 60;

// ---------------------------------------------------------------------
// TERCIHLER
// ---------------------------------------------------------------------

/** Kullanicinin bulten tercihleri; satir yoksa DEFAULT_PREFS. */
export async function resolvePrefs(userId) {
  const row = await queryOne(
    `SELECT user_id, frequency, send_hour, send_weekday, format, max_items,
            min_band, only_changes, last_sent_at
       FROM user_newsletter_prefs WHERE user_id = ? LIMIT 1`,
    [userId],
  );
  if (!row) return { ...DEFAULT_PREFS, user_id: Number(userId), exists: false };
  return {
    exists: true,
    user_id: Number(row.user_id),
    frequency: row.frequency || DEFAULT_PREFS.frequency,
    send_hour: Number.isFinite(Number(row.send_hour)) ? Number(row.send_hour) : DEFAULT_PREFS.send_hour,
    send_weekday: row.send_weekday === null || row.send_weekday === undefined
      ? DEFAULT_PREFS.send_weekday
      : Number(row.send_weekday),
    format: row.format || DEFAULT_PREFS.format,
    max_items: row.max_items === null || row.max_items === undefined ? null : Number(row.max_items),
    min_band: row.min_band || DEFAULT_PREFS.min_band,
    only_changes: Number(row.only_changes) === 1 ? 1 : 0,
    last_sent_at: row.last_sent_at ?? null,
  };
}

/**
 * Bultendeki haber sayisi.
 * `max_items` acikca verilmisse O KAZANIR; yoksa vakit butcesinden turer.
 */
export function itemCountFor({ prefs, timeBudgetMin }) {
  if (prefs?.max_items) return Math.max(1, Math.min(MAX_ITEMS_HARD, Number(prefs.max_items)));
  const density = densityOf(timeBudgetMin);
  return Math.max(1, Math.min(MAX_ITEMS_HARD, density.items));
}

// ---------------------------------------------------------------------
// TRT TAKVIMI
//
// Tum zamanlama TRT'ye gore. Konteynerde TZ=Europe/Istanbul ama surec baska
// bir makinede kosabilir; bu yuzden saat/gun/tarih Intl ile ACIKCA
// Europe/Istanbul'dan okunuyor — yerel saate guvenmek UTC sunucuda
// bulteni 3 saat kaydirirdi.
// ---------------------------------------------------------------------

const TRT_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
});

const WEEKDAY_NUM = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** @returns {{date:string, hour:number, minute:number, weekday:number}} TRT */
export function trtNow(now = new Date()) {
  const parts = {};
  for (const p of TRT_PARTS.formatToParts(now)) parts[p.type] = p.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAY_NUM[parts.weekday] ?? 1,
  };
}

/**
 * Bulten donemi: gunluk son 1 gun, haftalik son 7 gun (TRT gun sinirlari).
 *
 * TUZAK — BIR KEZ YASANDI (haftalik pencere 7 yerine 8 gun cikti):
 * Ilk surum gunu `new Date(`${date}T00:00:00+03:00`)` ile kurup sonucu
 * `toISOString().slice(0,10)` ile geri okuyordu. TRT gece yarisi UTC'de
 * bir onceki gunun 21:00'i oldugu icin ISO metni GUNU BIR GERI kaydiriyor
 * ve pencere bir gun genisliyordu (olculdu: 12 Eylul'deki haber 13-19
 * penceresine sizdi).
 * Duzeltme: gun ortasi (12:00) capa alinir — saat kaymasi gunu asla
 * degistiremez — ve gun yine TRT takviminden (formatTrtDate) okunur.
 */
export function digestWindow(frequency, now = new Date()) {
  const { date } = trtNow(now);
  const end = date;
  const days = frequency === 'gunluk' ? 1 : 7;
  const anchor = new Date(`${date}T12:00:00+03:00`);
  anchor.setUTCDate(anchor.getUTCDate() - (days - 1));
  const start = formatTrtDate(anchor);
  return { start, end, days };
}

// ---------------------------------------------------------------------
// ADAY KULLANICILAR
// ---------------------------------------------------------------------

/**
 * Su anda bulteni gonderilecek kullanicilar.
 *
 * Kosullar:
 *   * users.status = 'aktif'
 *   * frequency <> 'kapali'
 *   * send_hour = su anki TRT saati  (`force` ile atlanir)
 *   * haftalik ise send_weekday = bugunun TRT gunu (`force` ile atlanir)
 *   * bugun ayni tur icin email_log kaydi YOK (gonderildi/kuyrukta)
 *
 * TERCIH SATIRI OLMAYAN KULLANICI DA KAPSAMDA: LEFT JOIN + COALESCE ile
 * varsayilanlar SQL'de uygulanir. Sapma-only ilkesi geregi "satir yok"
 * bir eksiklik degil, varsayilanin kendisi.
 */
export async function dueUsers({ now = new Date(), force = false, userIds = null, limit = 500 } = {}) {
  const t = trtNow(now);
  const params = [];
  const where = [
    "u.status = 'aktif'",
    `COALESCE(np.frequency, '${DEFAULT_PREFS.frequency}') <> 'kapali'`,
  ];

  if (!force) {
    where.push(`COALESCE(np.send_hour, ${DEFAULT_PREFS.send_hour}) = ?`);
    params.push(t.hour);
    // Haftalik icin gun kontrolu; gunluk her gun gider.
    where.push(`(COALESCE(np.frequency, '${DEFAULT_PREFS.frequency}') = 'gunluk'
       OR COALESCE(np.send_weekday, ${DEFAULT_PREFS.send_weekday}) = ?)`);
    params.push(t.weekday);
  }

  if (Array.isArray(userIds) && userIds.length) {
    const clean = userIds.map(Number).filter(Number.isFinite);
    if (clean.length === 0) return [];
    where.push(`u.id IN (${clean.map(() => '?').join(', ')})`);
    params.push(...clean);
  }

  // BUGUN ZATEN GONDERILDI MI: uq_email_once'a ek olarak kendi kontrolumuz.
  // 'hata' durumundaki kayit tekrar denenebilir sayilmaz (ayni gun icinde
  // ayni satir uq yuzunden zaten acilamaz); bu yuzden tum durumlar sayilir.
  where.push(`NOT EXISTS (
    SELECT 1 FROM email_log el
     WHERE el.user_id = u.id AND el.kind = 'bulten' AND el.digest_date = ?
  )`);
  params.push(t.date);

  const rows = await query(
    `SELECT u.id, u.email, u.full_name, u.tenant_id, t.tenant_key,
            COALESCE(np.frequency, '${DEFAULT_PREFS.frequency}') AS frequency,
            COALESCE(np.send_hour, ${DEFAULT_PREFS.send_hour}) AS send_hour,
            COALESCE(np.send_weekday, ${DEFAULT_PREFS.send_weekday}) AS send_weekday,
            COALESCE(up.time_budget_min, 5) AS time_budget_min,
            np.user_id IS NOT NULL AS has_prefs
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       LEFT JOIN user_newsletter_prefs np ON np.user_id = u.id
       LEFT JOIN user_profiles up ON up.user_id = u.id
      WHERE ${where.join('\n        AND ')}
      ORDER BY u.id ASC
      LIMIT ${Math.max(1, Math.min(2000, Number(limit) || 500))}`,
    params,
  );

  return rows.map((r) => ({
    id: Number(r.id),
    email: r.email,
    full_name: r.full_name,
    tenant_id: Number(r.tenant_id),
    tenant_key: r.tenant_key,
    frequency: r.frequency,
    send_hour: Number(r.send_hour),
    send_weekday: Number(r.send_weekday),
    time_budget_min: Number(r.time_budget_min),
    has_prefs: Number(r.has_prefs) === 1,
  }));
}

/** Bugun bu kullaniciya bu tur gonderildi mi? (kendi kontrolumuz) */
export async function alreadySent(userId, digestDate, kind = 'bulten') {
  const row = await queryOne(
    `SELECT id, status FROM email_log
      WHERE user_id = ? AND kind = ? AND digest_date = ? LIMIT 1`,
    [userId, kind, digestDate],
  );
  return row ? { sent: true, logId: Number(row.id), status: row.status } : { sent: false };
}

// ---------------------------------------------------------------------
// ICERIK SECIMI
// ---------------------------------------------------------------------

/**
 * Bulten icin WHERE parcasi. `listPersonalized` route'un `buildFilters()`
 * ciktisini bekliyor; burada ayni bicimde (tam `WHERE ...` metni + params)
 * uretilip veriliyor — filtre mantigi iki yerde kopyalanmasin.
 */
export function buildDigestFilter({ user, prefs, window: win }) {
  const where = ['a.is_duplicate = 0'];
  const params = [];

  where.push('a.published_at >= ?');
  params.push(`${win.start} 00:00:00`);
  where.push('a.published_at < DATE_ADD(?, INTERVAL 1 DAY)');
  params.push(win.end);

  const bands = bandsAtLeast(prefs.min_band);
  where.push(`a.importance_band IN (${bands.map(() => '?').join(', ')})`);
  params.push(...bands);

  // Kullanicinin GIZLEDIGI haberler bultene girmez. Veri silinmiyor,
  // yalnizca bu kullanicinin gorunumunden dusuyor (user_article_prefs).
  where.push(`NOT EXISTS (
    SELECT 1 FROM user_article_prefs uap
     WHERE uap.user_id = ? AND uap.article_id = a.id AND uap.hidden_at IS NOT NULL
  )`);
  params.push(user.id);

  // only_changes: yalnizca donemde DEGISIKLIK kaydi olan haberler.
  // "yeni" de bir degisiklik turudur, yoksa ilk kez gorunen haber
  // "sadece degisiklikler" bulteninden tamamen dusardi.
  if (Number(prefs.only_changes) === 1) {
    where.push(`EXISTS (
      SELECT 1 FROM article_changes ac
       WHERE ac.article_id = a.id
         AND ac.detected_at >= ?
    )`);
    params.push(`${win.start} 00:00:00`);
  }

  return { whereSql: `WHERE ${where.join('\n    AND ')}`, params };
}

/** GLOBAL (editoryal) siralama — kisisel yol basarisiz olursa bu kullanilir. */
async function globalPick({ whereSql, params, limit }) {
  const rows = await query(
    `SELECT ${ARTICLE_COLUMNS} ${ARTICLE_FROM} ${whereSql}
      ORDER BY a.importance_score DESC, a.published_at DESC, a.id DESC
      LIMIT ${Math.max(1, Math.min(MAX_ITEMS_HARD, Number(limit) || 12))}`,
    params,
  );
  return serializeArticleRows(rows, { reveal: false });
}

/**
 * Donem istatistikleri — bultenin KPI seridi ve grafikleri icin.
 * `clusters` yalnizca pencerede TEKIL haberi olan kumeleri sayar; tekrarin
 * kumesini de saymak rapor #1'de "73 kume / 72 tekil" celiskisini uretti
 * (temsilcisi pencere disinda kalan kume). Ayrinti: reportService.js.
 */
async function windowStats({ win }) {
  const row = await queryOne(
    `SELECT COUNT(*) AS scanned,
            SUM(CASE WHEN is_duplicate = 1 THEN 1 ELSE 0 END) AS duplicates,
            COUNT(DISTINCT CASE WHEN is_duplicate = 0 THEN cluster_id END) AS clusters,
            SUM(CASE WHEN is_duplicate = 0 THEN 1 ELSE 0 END) AS uniq,
            COUNT(DISTINCT source_id) AS sources
       FROM articles
      WHERE published_at >= ? AND published_at < DATE_ADD(?, INTERVAL 1 DAY)`,
    [`${win.start} 00:00:00`, win.end],
  );
  const scanned = Number(row?.scanned ?? 0);
  const duplicates = Number(row?.duplicates ?? 0);
  return {
    scanned,
    unique: Number(row?.uniq ?? 0),
    duplicates,
    clusters: Number(row?.clusters ?? 0),
    sources: Number(row?.sources ?? 0),
    dedup_ratio: scanned > 0 ? Number((duplicates / scanned).toFixed(4)) : 0,
  };
}

/** Secilen haberlerin band/bolge/kategori dagilimi (sablonlar bunu okur). */
function selectionStats(articles) {
  const byBand = { KRITIK: 0, YUKSEK: 0, ORTA: 0, DUSUK: 0 };
  const byRegion = {};
  const byCategory = {};
  for (const a of articles) {
    if (a.importance_band in byBand) byBand[a.importance_band] += 1;
    byRegion[a.region] = (byRegion[a.region] || 0) + 1;
    if (a.category) byCategory[a.category] = (byCategory[a.category] || 0) + 1;
  }
  return {
    by_band: byBand,
    by_region: byRegion,
    top_categories: Object.entries(byCategory)
      .sort((x, y) => y[1] - x[1]).slice(0, 10)
      .map(([key, count]) => ({ key, count })),
  };
}

/**
 * Bir kullanicinin bultenini hazirlar (GONDERMEZ).
 *
 * @returns {Promise<object>} {ok, user, prefs, window, articles, stats, kind,
 *   digestDate, ranking:'kisisel'|'global', title}
 */
export async function buildDigest({ user, prefs = null, now = new Date() } = {}) {
  const tercih = prefs || await resolvePrefs(user.id);
  const win = digestWindow(tercih.frequency, now);
  const t = trtNow(now);
  const kind = tercih.frequency === 'gunluk' ? 'gunluk' : 'haftalik';
  const limit = itemCountFor({ prefs: tercih, timeBudgetMin: user.time_budget_min ?? 5 });

  const { whereSql, params } = buildDigestFilter({ user, prefs: tercih, window: win });

  let articles = [];
  let ranking = 'kisisel';
  let rankingError = null;

  try {
    const profile = await loadProfile(user.id, user.tenant_key || null);
    const result = await listPersonalized({
      whereSql, params, profile, page: 1, limit, offset: 0, reveal: false,
    });
    articles = result.data || [];
    if (articles.length === 0) throw new Error('kisisel siralama bos dondu');
  } catch (err) {
    // KISISEL YOL DUSERSE GLOBAL SIRALAMA: bulten bos gitmemeli.
    ranking = 'global';
    rankingError = err.message;
    try {
      articles = await globalPick({ whereSql, params, limit });
    } catch (err2) {
      return {
        ok: false,
        error: `Bülten içeriği hazırlanamadı: ${err2.message}`,
        user, prefs: tercih, kind, digestDate: t.date,
      };
    }
  }

  const stats = { ...(await windowStats({ win })), ...selectionStats(articles) };

  const donem = kind === 'gunluk'
    ? `${win.end}`
    : `${win.start} – ${win.end}`;

  return {
    ok: true,
    user,
    prefs: tercih,
    window: win,
    kind,
    digestDate: t.date,
    articles,
    stats,
    ranking,
    ranking_error: rankingError,
    title: kind === 'gunluk'
      ? 'İSO/İSOV Günlük Bülten'
      : 'İSO/İSOV Haftalık Bülten',
    subject: kind === 'gunluk'
      ? `İSO/İSOV Günlük Bülten — ${donem}`
      : `İSO/İSOV Haftalık Bülten — ${donem}`,
  };
}

// ---------------------------------------------------------------------
// GONDERIM
// ---------------------------------------------------------------------

/** PDF eki isteniyor mu? `format='tam'` veya DIGEST_ATTACH_PDF=true. */
function wantsPdf(prefs) {
  if (String(process.env.DIGEST_ATTACH_PDF ?? 'true').toLowerCase() === 'false') return false;
  return prefs?.format === 'tam' || String(process.env.DIGEST_ATTACH_PDF || '').toLowerCase() === 'true';
}

/**
 * Tek kullaniciya bulten gonderir. ASLA THROW ETMEZ.
 *
 * @param {object} opts
 * @param {object} opts.user      dueUsers() satiri (en az {id,email})
 * @param {boolean} [opts.dryRun] gonderme, email_log'a da yazma
 * @param {boolean} [opts.force]  "bugun gonderildi" kontrolunu atla
 *                                (uq_email_once yine korur)
 */
export async function sendDigestToUser({ user, prefs = null, now = new Date(), dryRun = false, force = false } = {}) {
  try {
    const tercih = prefs || await resolvePrefs(user.id);
    if (tercih.frequency === 'kapali') {
      return { ok: false, skipped: true, reason: 'abonelik-kapali', userId: user.id };
    }

    const t = trtNow(now);
    if (!force && !dryRun) {
      const zaten = await alreadySent(user.id, t.date, 'bulten');
      if (zaten.sent) {
        return {
          ok: false, skipped: true, reason: 'bugun-gonderildi',
          userId: user.id, logId: zaten.logId, status: zaten.status,
        };
      }
    }

    const digest = await buildDigest({ user, prefs: tercih, now });
    if (!digest.ok) return { ok: false, error: digest.error, userId: user.id };

    if (digest.articles.length === 0) {
      return { ok: false, skipped: true, reason: 'icerik-yok', userId: user.id };
    }

    // --- PDF eki (opsiyonel; Chromium yoksa e-posta EKSIZ gider) --------
    const attachments = [];
    let pdfInfo = { attached: false, reason: null };
    if (wantsPdf(tercih)) {
      if (!pdfAvailable()) {
        pdfInfo = { attached: false, reason: 'chromium-yok' };
      } else {
        const pdf = await renderDigestPdf({
          tip: digest.kind,
          title: digest.title,
          articles: digest.articles,
          stats: digest.stats,
          periodStart: digest.window.start,
          periodEnd: digest.window.end,
        });
        if (pdf.ok) {
          attachments.push({
            filename: pdf.filename,
            content: pdf.buffer,
            contentType: 'application/pdf',
          });
          pdfInfo = { attached: true, bytes: pdf.bytes, pages: pdf.pages, filename: pdf.filename };
        } else {
          pdfInfo = { attached: false, reason: pdf.reason || 'uretim-hatasi', error: pdf.error };
        }
      }
    }

    const html = renderDigestMail({
      user,
      kind: digest.kind,
      articles: digest.articles,
      stats: digest.stats,
      periodStart: digest.window.start,
      periodEnd: digest.window.end,
      pdfNote: pdfInfo.attached
        ? 'Görsel rapor ekte PDF olarak gönderildi.'
        : '',
    });

    const result = await sendMail({
      to: user.email,
      subject: digest.subject,
      html,
      attachments,
      kind: 'bulten',
      userId: user.id,
      digestDate: digest.digestDate,
      articleIds: digest.articles.map((a) => a.id),
      dryRun,
    });

    // last_sent_at yalnizca GERCEK gonderimde tazelenir. Satir yoksa
    // acilmaz: sapma-only ilkesi geregi varsayilanla yasayan kullanici
    // icin tercih satiri uretmek yanlis olurdu.
    if (result.ok && !dryRun && tercih.exists) {
      await query(
        'UPDATE user_newsletter_prefs SET last_sent_at = NOW() WHERE user_id = ?',
        [user.id],
      ).catch((err) => console.warn('[bulten] last_sent_at yazilamadi:', err.message));
    }

    return {
      ...result,
      userId: user.id,
      email: user.email,
      kind: digest.kind,
      ranking: digest.ranking,
      ranking_error: digest.ranking_error,
      item_count: digest.articles.length,
      pdf: pdfInfo,
      digestDate: digest.digestDate,
    };
  } catch (err) {
    // SON SIGORTA: tek kullanicinin hatasi toplu isi dusurmesin.
    console.error(`[bulten] kullanici ${user?.id} icin beklenmeyen hata:`, err.message);
    return { ok: false, error: err.message, userId: user?.id ?? null, reason: 'beklenmeyen-hata' };
  }
}

/** Es zamanlilik siniri — fetch-images.js deseni (nazik ol, yigilma yapma). */
export const CONCURRENCY = Math.max(1, Number(process.env.DIGEST_CONCURRENCY || 3));

/**
 * Toplu bulten gonderimi. ASLA THROW ETMEZ, ozet nesnesi doner.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun]
 * @param {boolean} [opts.force]      saat/gun ve "bugun gonderildi" kontrollerini atla
 * @param {number[]} [opts.userIds]   yalnizca bu kullanicilar
 * @param {number} [opts.limit]
 */
export async function runDigest({
  now = new Date(), dryRun = false, force = false, userIds = null, limit = 500,
} = {}) {
  const basladi = Date.now();
  const t = trtNow(now);

  const ozet = {
    trt: `${t.date} ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`,
    weekday: t.weekday,
    dry_run: Boolean(dryRun),
    force: Boolean(force),
    candidates: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    pdf_attached: 0,
    ranking: { kisisel: 0, global: 0 },
    reasons: {},
    results: [],
  };

  let users;
  try {
    users = await dueUsers({ now, force, userIds, limit });
  } catch (err) {
    console.error('[bulten] aday kullanicilar okunamadi:', err.message);
    return { ...ozet, error: err.message, duration_ms: Date.now() - basladi };
  }
  ozet.candidates = users.length;
  if (users.length === 0) return { ...ozet, duration_ms: Date.now() - basladi };

  let sira = 0;
  async function isci() {
    for (;;) {
      const index = sira;
      sira += 1;
      if (index >= users.length) return;
      const user = users[index];

      const result = await sendDigestToUser({ user, now, dryRun, force });

      if (result.ok) {
        ozet.sent += 1;
        if (result.ranking) ozet.ranking[result.ranking] = (ozet.ranking[result.ranking] || 0) + 1;
        if (result.pdf?.attached) ozet.pdf_attached += 1;
      } else if (result.skipped) {
        ozet.skipped += 1;
      } else {
        ozet.errors += 1;
      }
      const reason = result.reason || (result.ok ? 'gonderildi' : 'hata');
      ozet.reasons[reason] = (ozet.reasons[reason] || 0) + 1;

      ozet.results.push({
        user_id: user.id,
        email: user.email,
        ok: Boolean(result.ok),
        reason,
        item_count: result.item_count ?? 0,
        ranking: result.ranking ?? null,
        pdf: result.pdf?.attached ? `${result.pdf.pages ?? '?'} sayfa` : (result.pdf?.reason ?? null),
        error: result.error ?? null,
      });
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(CONCURRENCY, users.length) },
    isci,
  ));

  return { ...ozet, duration_ms: Date.now() - basladi };
}

/** Rapor PDF'i icin tarih yardimcisi (CLI parametreleri) — dis kullanim. */
export { toMysqlDate, toMysqlDateTime };
export default {
  DEFAULT_PREFS, resolvePrefs, itemCountFor, bandsAtLeast, trtNow, digestWindow,
  dueUsers, alreadySent, buildDigest, buildDigestFilter, sendDigestToUser, runDigest,
};
