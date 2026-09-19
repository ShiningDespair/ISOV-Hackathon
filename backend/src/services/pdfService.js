// ---------------------------------------------------------------------
// PDF SERVISI — sunucu tarafinda Chromium ile PDF uretimi
//
// OPSIYONEL BAGIMLILIK DESENI (services/llm.js ile BIREBIR AYNI SOZLESME):
//   * Puppeteer DINAMIK IMPORT ile yuklenir. Paket kurulu degilse API yine
//     ayaga kalkar.
//   * `isAvailable()` tek dogruluk noktasidir ve SENKRONDUR (llm.js gibi).
//   * Bu modul ASLA istisna FIRLATMAZ. Her sey `{ok:false, error}` doner.
//     Chromium yoksa sistemin geri kalani (panel, API, seeder) calismaya
//     devam eder; yalnizca PDF ucu 503 verir.
//
// NEDEN SISTEM CHROMIUM'U (puppeteer'in indirdigi degil):
//   Imaj `node:22-slim` (glibc; alpine DEGIL cunku onnxruntime-node musl'da
//   yuklenemiyor). Debian deposundaki `chromium` paketi tum paylasimli
//   kutuphane bagimliliklarini apt ile beraber getiriyor; puppeteer'in
//   indirdigi ikili icin ayni listeyi elle kurmak gerekirdi ve eksik bir
//   .so "Failed to launch the browser process" ile CALISMA ANINDA cikardi.
//   Bu yuzden `puppeteer-core` + `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`.
//   Paketli Chromium kullanmak isteyen sadece bu env'i degistirir; kod ayni.
//
// TARAYICI YENIDEN KULLANIMI:
//   Her PDF icin yeni Chromium acmak ~700 ms ve ~120 MB bedel. Tek ornek
//   tutulur, her uretimden sonra bosta kalma sayaci sifirlanir ve
//   PDF_IDLE_TIMEOUT_MS (varsayilan 5 dk) sonra tarayici kapanir — bulten
//   isi gece bir kez kosup 20 PDF uretiyorsa tek Chromium yeter, gun boyu
//   bellekte de durmaz.
//   Zamanlayici `unref()` edilir: acik bir timer yuzunden `npm run
//   send-digest` surecinin cikamamasi (asilmasi) bir kez yasandi.
// ---------------------------------------------------------------------
import { existsSync } from 'node:fs';
import { query } from '../lib/db.js';
import { toDateOnly, toIso } from '../lib/serialize.js';
import { findArticleRowsByIds, serializeArticleRows } from './articleService.js';
import { SECTION_ORDER, serializeReportRow } from './reportService.js';
import { renderTemplate, normalizeTemplateType } from '../templates/index.js';
import { REGION_LABELS, trDate } from '../templates/theme.js';

/** Bosta bekleme suresi — bu kadar sure PDF uretilmezse tarayici kapanir. */
export const IDLE_TIMEOUT_MS = Math.max(
  10_000,
  Number(process.env.PDF_IDLE_TIMEOUT_MS || 5 * 60 * 1000),
);

/** Tek PDF uretimi icin ust sinir; asilirsa sayfa kapatilir. */
export const RENDER_TIMEOUT_MS = Math.max(
  5_000,
  Number(process.env.PDF_RENDER_TIMEOUT_MS || 45_000),
);

/**
 * Sistemde aranacak Chromium yollari.
 * Sirasi onemli: acikca verilen env once, sonra Debian/Ubuntu adlari.
 */
const CHROMIUM_CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/snap/bin/chromium',
];

let cachedPath;          // undefined = henuz bakilmadi, null = yok
let browserPromise = null;
let idleTimer = null;

/** Chromium ikilisinin yolu; bulunamazsa null. Sonuc onbelleklenir. */
export function chromiumPath() {
  const explicit = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH;
  if (explicit) return existsSync(explicit) ? explicit : null;
  if (cachedPath !== undefined) return cachedPath;
  cachedPath = CHROMIUM_CANDIDATES.find((p) => existsSync(p)) || null;
  return cachedPath;
}

/**
 * PDF uretimi kullanilabilir mi? TEK DOGRULUK NOKTASI (llm.js:isAvailable).
 *
 * DIKKAT — SENKRON ve DISKE BAKAR: paketin gercekten import edilebilecegini
 * garanti ETMEZ (bunu ancak dinamik import ogrenebilir). Yanlis pozitif
 * ihtimali bilincli kabul edildi: bu fonksiyon bir "on eleme"dir, uretim
 * yolunda paket yuklenemezse `{ok:false}` doner ve uc 503 verir. Tersi
 * (her isAvailable cagrisini async yapmak) llm.js sozlesmesini bozardi.
 */
export function isAvailable() {
  if (String(process.env.PDF_ENABLED ?? 'true').toLowerCase() === 'false') return false;
  return chromiumPath() !== null;
}

/** Tani bilgisi — admin panelinin "PDF durumu" gostergesi icin. */
export function pdfStatus() {
  return {
    available: isAvailable(),
    chromium_path: chromiumPath(),
    enabled: String(process.env.PDF_ENABLED ?? 'true').toLowerCase() !== 'false',
    browser_open: browserPromise !== null,
    idle_timeout_ms: IDLE_TIMEOUT_MS,
  };
}

/** Puppeteer'i tembel yukler. `puppeteer` varsa onu, yoksa `puppeteer-core`. */
async function loadPuppeteer() {
  for (const name of ['puppeteer', 'puppeteer-core']) {
    try {
      const mod = await import(name);
      const pp = mod.default ?? mod;
      if (pp && typeof pp.launch === 'function') return pp;
    } catch {
      // Sirada bir sonraki paket; ikisi de yoksa asagida null doner.
    }
  }
  return null;
}

/**
 * Chromium baslatma argumanlari.
 * --no-sandbox ZORUNLU: konteyner `node` kullanicisiyla ve ek yetenek
 * (SYS_ADMIN) olmadan kosuyor, kullanici ad alani (user namespace)
 * acilamiyor. Yalnizca bizim urettigimiz yerel HTML render edildigi icin
 * kum havuzunu kapatmanin saldiri yuzeyi yok — dis URL yuklenmiyor.
 * --disable-dev-shm-usage: Docker'in 64 MB /dev/shm siniri buyuk sayfalarda
 * Chromium'u sessizce oldurmesin.
 */
function launchArgs() {
  return [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-zygote',
    '--font-render-hinting=none',
    '--hide-scrollbars',
    '--disable-extensions',
    '--disable-background-networking',
  ];
}

function clearIdleTimer() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
}

function armIdleTimer() {
  clearIdleTimer();
  idleTimer = setTimeout(() => { closeBrowser('bosta kalma'); }, IDLE_TIMEOUT_MS);
  // Surecin cikmasini ENGELLEMESIN (CLI isleri bitince kapanabilmeli).
  if (typeof idleTimer.unref === 'function') idleTimer.unref();
}

/** Acik tarayiciyi kapatir. Hata yutulur — kapatma asla cagirani dusurmez. */
export async function closeBrowser(reason = 'istek') {
  clearIdleTimer();
  const pending = browserPromise;
  browserPromise = null;
  if (!pending) return false;
  try {
    const browser = await pending;
    if (browser) {
      await browser.close();
      console.log(`[pdf] Chromium kapatildi (${reason})`);
    }
  } catch (err) {
    console.warn('[pdf] Chromium kapatilamadi:', err.message);
  }
  return true;
}

/** Paylasilan tarayici ornegi; elde edilemezse null. ASLA throw etmez. */
async function getBrowser() {
  if (!isAvailable()) return null;

  if (browserPromise) {
    try {
      const existing = await browserPromise;
      // puppeteer >= 22 `connected` alanini, eskiler isConnected() veriyor.
      const alive = existing
        && (existing.connected ?? (typeof existing.isConnected === 'function' ? existing.isConnected() : true));
      if (alive) return existing;
    } catch { /* asagida yeniden denenir */ }
    browserPromise = null;
  }

  browserPromise = (async () => {
    const pp = await loadPuppeteer();
    if (!pp) {
      console.warn('[pdf] puppeteer/puppeteer-core yuklenemedi; PDF uretimi devre disi');
      return null;
    }
    const executablePath = chromiumPath();
    return pp.launch({
      headless: true,
      executablePath: executablePath || undefined,
      args: launchArgs(),
      // Chromium'un baslamasi yavas makinede 10 sn'yi asabiliyor.
      timeout: 60_000,
    });
  })().catch((err) => {
    console.warn('[pdf] Chromium baslatilamadi:', err.message);
    return null;
  });

  const browser = await browserPromise;
  if (!browser) { browserPromise = null; return null; }
  return browser;
}

/**
 * HTML'i PDF'e cevirir.
 *
 * ASLA THROW ETMEZ. Basarida `{ok:true, buffer, bytes, pages}`, aksi halde
 * `{ok:false, error}` doner. (Spesifikasyonda "Buffer doner" yaziyordu;
 * zarfa alindi cunku ayni fonksiyonun hem istisna atmamasi hem de hatayi
 * bildirmesi gerekiyor — cagirani `result.ok` kontrol eder.)
 *
 * @param {object} opts
 * @param {string} opts.html
 * @param {'A4'|'A3'|'Letter'} [opts.format='A4']
 * @param {object} [opts.margin]   {top,right,bottom,left} CSS birimleri
 * @param {boolean} [opts.footer=true]  sayfa numarasi + uretim damgasi
 * @param {string} [opts.footerNote]    alt bilgide solda duracak metin
 */
export async function renderPdf({
  html,
  format = 'A4',
  margin,
  landscape = false,
  footer = true,
  footerNote = 'İSO · İSOV Dış Kaynak İzleme',
  generatedAt = new Date(),
} = {}) {
  if (!html || typeof html !== 'string') {
    return { ok: false, error: 'PDF için HTML içeriği verilmedi.' };
  }
  if (!isAvailable()) {
    return {
      ok: false,
      error: 'Sunucuda Chromium bulunamadı; PDF üretimi devre dışı.',
      reason: 'chromium-yok',
    };
  }

  const browser = await getBrowser();
  if (!browser) {
    return {
      ok: false,
      error: 'Chromium başlatılamadı; PDF üretimi şu anda kullanılamıyor.',
      reason: 'chromium-baslatilamadi',
    };
  }

  let page = null;
  try {
    page = await browser.newPage();
    // Cikti kagit icin: ekran medya sorgulari degil `print` kurallari gecerli
    // olmasin istiyoruz — sablonlar dogrudan kagit icin yazildi, bu yuzden
    // 'screen' emule ediliyor ve @media print sasirtmasi yasanmiyor.
    await page.emulateMediaType('screen');
    await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS });
    // Yerel fontlarin yerine oturmasi icin: harici istek yok, bu yuzden
    // `document.fonts.ready` aninda cozulur ama beklemek ucuz sigorta.
    await page.evaluate(() => document.fonts?.ready).catch(() => {});

    const buffer = await page.pdf({
      format,
      landscape,
      printBackground: true,
      preferCSSPageSize: false,
      margin: margin || { top: '14mm', right: '13mm', bottom: '16mm', left: '13mm' },
      displayHeaderFooter: footer,
      headerTemplate: '<div></div>',
      footerTemplate: footer ? footerTemplate({ footerNote, generatedAt }) : '<div></div>',
      timeout: RENDER_TIMEOUT_MS,
    });

    const out = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    return { ok: true, buffer: out, bytes: out.length, pages: countPdfPages(out) };
  } catch (err) {
    console.warn('[pdf] uretim basarisiz:', err.message);
    // Tarayici bozulmus olabilir; bir sonraki istek temiz ornek alsin.
    if (/Target closed|Session closed|Protocol error|browser has disconnected/i.test(err.message)) {
      await closeBrowser('hata sonrasi');
    }
    return { ok: false, error: `PDF üretilemedi: ${err.message}`, reason: 'uretim-hatasi' };
  } finally {
    if (page) { try { await page.close(); } catch { /* yoksay */ } }
    armIdleTimer();
  }
}

/**
 * Alt bilgi: SOLDA uretim damgasi, SAGDA sayfa numarasi.
 * Chromium `pageNumber` / `totalPages` yer tutucularini kendisi doldurur —
 * toplam sayfa sayisini sayfa icinden bilmenin baska yolu yok.
 */
function footerTemplate({ footerNote, generatedAt }) {
  const stamp = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(generatedAt instanceof Date ? generatedAt : new Date()).replace(',', '');

  return `<div style="width:100%;padding:0 13mm;font-family:'Liberation Sans','DejaVu Sans',Arial,sans-serif;
    font-size:6.5pt;letter-spacing:0.06em;color:#8B8B8B;display:flex;justify-content:space-between;
    border-top:0.4pt solid #E2E2E0;padding-top:2mm">
    <span>${escapeForTemplate(footerNote)} &middot; ${stamp} tarihinde üretildi</span>
    <span>SAYFA <span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`;
}

function escapeForTemplate(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * PDF sayfa sayisi — harici kutuphane olmadan.
 * `/Type /Page` nesnelerini sayar (`/Type /Pages` agac dugumlerini HARIC
 * tutar, yoksa her belge bir fazla sayilirdi). Chromium ciktisi sikistirilmis
 * nesne akisi kullanmadigi icin bu sayim guvenilir; yine de bulunamazsa
 * `/Count N` degerine duser.
 */
export function countPdfPages(buffer) {
  try {
    const text = buffer.toString('latin1');
    const matches = text.match(/\/Type\s*\/Page(?![sA-Za-z])/g);
    if (matches && matches.length > 0) return matches.length;
    const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
    return counts.length ? Math.max(...counts) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// RAPOR -> PDF
//
// Icerik kaynagi reportService: rapor satiri + report_items + article
// serializer. PDF icin YENI bir secim/siralama mantigi YAZILMIYOR — rapor
// neyi sectiyse PDF onu basar, yoksa panel ile PDF ayrisirdi.
// ---------------------------------------------------------------------

/**
 * Rapor verisini sablon modeline cevirir.
 * @returns {Promise<object|null>} rapor yoksa null
 */
export async function loadReportModel(reportId, { tip } = {}) {
  const id = Number.parseInt(reportId, 10);
  if (!Number.isFinite(id) || id <= 0) return null;

  const rows = await query(
    `SELECT id, title, period_start, period_end, period_type,
            executive_summary, stats, created_at
       FROM reports WHERE id = ? LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;

  const report = serializeReportRow(row);

  const itemRows = await query(
    `SELECT article_id, rank_order, section FROM report_items
      WHERE report_id = ? ORDER BY rank_order ASC`,
    [id],
  );

  // Onem skoru GIZLI metrik: reveal=false (serializer null yazar).
  const articleRows = await findArticleRowsByIds(itemRows.map((r) => r.article_id));
  const serialized = await serializeArticleRows(articleRows, { reveal: false });
  const byId = new Map(serialized.map((a) => [a.id, a]));

  const ordered = itemRows
    .map((r) => ({ section: r.section, article: byId.get(Number(r.article_id)) }))
    .filter((x) => x.article);

  const sections = SECTION_ORDER
    .map((key) => ({
      key,
      label: REGION_LABELS[key] || key,
      items: ordered.filter((x) => x.section === key).map((x) => x.article),
    }))
    .filter((s) => s.items.length > 0);

  return buildModel({
    kind: normalizeTemplateType(tip || report.period_type),
    title: report.title,
    periodStart: report.period_start,
    periodEnd: report.period_end,
    periodType: report.period_type,
    executiveSummary: report.executive_summary,
    stats: report.stats,
    articles: ordered.map((x) => x.article),
    sections,
    reportId: report.id,
  });
}

/**
 * Sablon modelini tamamlar: gunluk seriyi haberlerin tarihinden TURETIR
 * (yeni sorgu yok — rapor kalemleri zaten elimizde).
 */
export function buildModel(input = {}) {
  const articles = input.articles || [];
  const sections = input.sections
    || groupByRegion(articles);

  return {
    kind: normalizeTemplateType(input.kind),
    title: input.title,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    periodType: input.periodType,
    executiveSummary: input.executiveSummary,
    stats: input.stats || {},
    articles,
    sections,
    daily: input.daily || dailySeries(articles),
    generatedAt: input.generatedAt || new Date(),
    brand: input.brand || 'İSO · İSOV',
    reportId: input.reportId ?? null,
  };
}

/** Bolgeye gore gruplama — CONTRACT SECTION_ORDER sirasinda. */
export function groupByRegion(articles = []) {
  return SECTION_ORDER
    .map((key) => ({
      key,
      label: REGION_LABELS[key] || key,
      items: articles.filter((a) => (a.region || 'DIGER') === key),
    }))
    .filter((s) => s.items.length > 0);
}

/** published_at damgalarindan gun bazli seri (grafik icin). */
export function dailySeries(articles = []) {
  const counts = new Map();
  for (const a of articles) {
    const day = toDateOnly(a.published_at);
    if (!day) continue;
    counts.set(day, (counts.get(day) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([day, count]) => ({ key: day, label: trDate(day).slice(0, 5), count }));
}

/**
 * Rapor PDF'i uretir.
 * @param {number} reportId
 * @param {object} [opts]
 * @param {'gunluk'|'haftalik'} [opts.tip]  sablon; yoksa rapor tipinden
 * @returns {Promise<{ok:boolean, buffer?:Buffer, bytes?:number, pages?:number, filename?:string, error?:string}>}
 */
export async function renderReportPdf(reportId, { tip, footerNote } = {}) {
  let model;
  try {
    model = await loadReportModel(reportId, { tip });
  } catch (err) {
    console.warn('[pdf] rapor okunamadi:', err.message);
    return { ok: false, error: `Rapor okunamadı: ${err.message}`, reason: 'veri-hatasi' };
  }
  if (!model) return { ok: false, error: 'Rapor bulunamadı.', reason: 'bulunamadi' };

  const html = renderTemplate(model.kind, model);
  const result = await renderPdf({
    html,
    format: 'A4',
    footerNote: footerNote || 'İSO · İSOV Dış Kaynak İzleme',
    generatedAt: model.generatedAt,
  });
  if (!result.ok) return result;

  return {
    ...result,
    filename: reportFilename(model),
    kind: model.kind,
    item_count: model.articles.length,
  };
}

/**
 * Bulten PDF'i — rapor kaydi OLMADAN, serbest haber listesinden.
 * digestService kullanicilarin kisisel bultenini bununla uretir.
 */
export async function renderDigestPdf({
  tip = 'gunluk', title, executiveSummary, articles = [], stats = {},
  periodStart, periodEnd, footerNote, sections,
} = {}) {
  const model = buildModel({
    kind: tip, title, executiveSummary, articles, stats, periodStart, periodEnd, sections,
  });
  const html = renderTemplate(model.kind, model);
  const result = await renderPdf({
    html, format: 'A4', footerNote, generatedAt: model.generatedAt,
  });
  if (!result.ok) return result;
  return { ...result, filename: digestFilename(model), kind: model.kind };
}

/** Dosya adi: ASCII, tarihli, cakismasiz. */
function slugAscii(value, max = 60) {
  const map = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', İ: 'i', I: 'i' };
  return String(value || '')
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüİI]/g, (m) => map[m] ?? m)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max) || 'bulten';
}

export function reportFilename(model) {
  const parts = ['isov', model.kind];
  if (model.periodStart) parts.push(String(model.periodStart).slice(0, 10));
  if (model.periodEnd && model.periodEnd !== model.periodStart) parts.push(String(model.periodEnd).slice(0, 10));
  if (model.reportId) parts.push(`rapor-${model.reportId}`);
  return `${slugAscii(parts.join('-'), 90)}.pdf`;
}

export function digestFilename(model) {
  const day = String(model.periodEnd || new Date().toISOString()).slice(0, 10);
  return `${slugAscii(`isov-${model.kind}-bulten-${day}`, 90)}.pdf`;
}

/** Rapor kimliginden PDF ciktisinin ISO damgasi (HTTP Last-Modified icin). */
export function isoStamp(value) {
  return toIso(value) || new Date().toISOString();
}

export default {
  isAvailable, pdfStatus, chromiumPath, renderPdf, renderReportPdf, renderDigestPdf,
  loadReportModel, buildModel, closeBrowser, countPdfPages, dailySeries,
  IDLE_TIMEOUT_MS,
};
