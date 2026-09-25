// ---------------------------------------------------------------------
// PDF SABLON PARCALARI — iki sablonun paylastigi bilesenler
//
// Kunye, KPI seridi ve haber kalemi. Tek evde durmalari sart: gunluk ile
// haftalik ayni gorsel dili konusmali, yoksa iki ayri urun gibi gorunur.
//
// HABER KALEMI SOZLESMESI (kullanici istegi): "yaziya bogulmamali".
//   * TAM GOVDE (articles.body) HICBIR SABLONA GIRMEZ — sorgu bile cekmez.
//   * Ozet `clip()` ile kirpilir (gunluk 200, haftalik 170 karakter).
//   * Her kalem: band rozeti + baslik + kaynak·bolge·tarih + kisa ozet.
// ---------------------------------------------------------------------
import {
  PALETTE, FONT_SANS_ATTR, REGION_LABELS, BAND_LABELS,
  bandClass, esc, trDate, trDateTime, trNumber, clip,
} from './theme.js';

/**
 * Kaynak adinin `lang` niteligi: kaynak Ingilizce (ya da baska bir Latin
 * dili) yayinliyorsa VE adinda Turkceye ozgu harf yoksa.
 *
 * NEDEN: `.meta` satiri `text-transform: uppercase` ve belge `lang="tr"`;
 * Chromium Turkce kuralla buyuttugu icin rapor #1'de Ingilizce kaynak adlari
 * "CYPRUS MAİL", "FEDERAL REGİSTER", "OİLPRİCE.COM" diye basildi (persona
 * testi, basin muduru). Yalniz `lang="en"` YETMEDI — olculdu: `sources.language`
 * kaynagin YAYIN dilidir, adin dili degil. "Uluslararası Enerji Ajansı (IEA)"
 * ve "Avrupa Komisyonu Basın Odası" en-kaynak ama Turkce adli; en kuralla
 * "ENERJI", "KOMISYONU" olurdu. "Cyprus Mail (Reuters servisi)" ve "Federal
 * Register (ABD Resmi Gazetesi)" ise karisik: en kuralla "SERVISI", "RESMI".
 * Bu yuzden ad metinSEL olarak buyutulmez (bkz. metaLine, text-transform:
 * none) — kaynak adi kaynagin yazdigi gibi basilir; `lang` yalnizca ekran
 * okuyucu telaffuzu ve heceleme icin, Turkce harf iceren adlara verilmez.
 */
function langAttr(code, name = '') {
  const lang = String(code || '').trim().toLowerCase();
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(lang) || lang === 'tr' || lang.startsWith('tr-')) return '';
  if (/[çğıöşüÇĞİÖŞÜ]/.test(String(name))) return '';
  return ` lang="${esc(lang)}"`;
}

/** Kaynak · bolge · tarih satiri. Bos parcalar sessizce atlanir. */
function metaLine(article) {
  const bits = [];
  if (article.source?.name) {
    const name = article.source.name;
    bits.push(`<span${langAttr(article.source.language, name)} style="text-transform:none">${esc(name)}</span>`);
  }
  if (article.region) bits.push(esc(REGION_LABELS[article.region] || article.region));
  if (article.published_at) bits.push(esc(trDate(article.published_at)));
  return bits.join(' &middot; ');
}

/**
 * Tek haber kalemi.
 * @param {object} article  serializeArticle() cikti sekli
 * @param {object} [opts]
 * @param {number} [opts.rank]       sira numarasi (yoksa basilmaz)
 * @param {number} [opts.summaryMax] ozet karakter siniri
 */
export function newsItem(article, { rank = null, summaryMax = 200 } = {}) {
  const band = article.importance_band || 'DUSUK';
  const dek = clip(article.summary || (article.key_points || [])[0] || '', summaryMax);

  return `<article class="item">
  <div class="item-top">
    ${rank !== null ? `<span class="rank">${esc(String(rank).padStart(2, '0'))}</span>` : ''}
    <span class="${bandClass(band)}">${esc(BAND_LABELS[band] || band)}</span>
  </div>
  <h3>${esc(article.title || '(başlıksız)')}</h3>
  <p class="meta">${metaLine(article)}</p>
  ${dek ? `<p class="dek">${esc(dek)}</p>` : ''}
</article>`;
}

/**
 * Haber listesi. Bos listede "yaziya bogulmayan" bir bos durum basar.
 *
 * `columns: 2` gazete mizanpaji verir (CSS multicol). Olculdu: 40 kalemlik
 * rapor tek kolonda 8 sayfaya tasiyor, iki kolonda 4 sayfaya sigiyor —
 * haftalik sablonun 3-5 sayfa hedefi ancak boyle tutuyor. Yan fayda:
 * basili gazete gorunumune (frontend .newspaper-columns) yakinsiyor.
 */
export function newsList(articles = [], opts = {}) {
  if (!articles.length) {
    return '<p class="empty">Bu bölümde gösterilecek haber yok.</p>';
  }
  const startRank = Number.isFinite(opts.startRank) ? opts.startRank : null;
  const cls = Number(opts.columns) === 2 ? 'items items-2col' : 'items';
  return `<div class="${cls}">${articles.map((a, i) => newsItem(a, {
    ...opts,
    rank: startRank === null ? null : startRank + i,
  })).join('\n')}</div>`;
}

/**
 * Kunye. `kicker` sablon adini (GÜNLÜK BÜLTEN / HAFTALIK BÜLTEN) tasir.
 */
export function masthead({
  kicker, title, dateRange, lede, brand = 'İSO · İSOV', dataLine = '',
}) {
  return `<header class="masthead">
  <div class="masthead-top">
    <span class="wordmark">${esc(brand)}</span>
    <span class="kicker kicker-accent">${esc(kicker)}</span>
    <span class="kicker">${esc(dateRange)}</span>
  </div>
  ${dataLine ? `<p class="kicker masthead-data" style="margin:-1.5mm 0 2.5mm">${esc(dataLine)}</p>` : ''}
  <h1>${esc(title)}</h1>
  ${lede ? `<p class="lede">${esc(lede)}</p>` : ''}
</header>`;
}

/**
 * KPI seridi — BUYUK SAYILAR. En fazla 4 kutu; 5. kutu her birini
 * okunamayacak kadar daraltiyor (A4 genisliginde olculdu).
 */
export function kpiRow(items = []) {
  const cells = items.slice(0, 4).map((k) => `
  <div class="kpi${k.accent ? ' accent' : ''}">
    <div class="v">${esc(k.value)}</div>
    <div class="n">${esc(k.label)}</div>
  </div>`).join('');
  return `<section class="kpis">${cells}</section>`;
}

/**
 * Kunyenin "verinin gercek tarihi" satiri:
 *   "Veri: <en eski> – <en yeni yayin tarihi> · Oluşturulma: <tarih saat>"
 *
 * NEDEN: rapor #1 basliginda yalnizca DONEM (08.09 – 14.09) yaziyordu;
 * dondeki haberlerin en yenisi 12.09 idi ve PDF 25.09'da basilinca okur
 * dönemi "bu haftanin verisi" sandi (persona testi, basin muduru: "sayfanin
 * tepesinde verinin gercekten ne zaman cekildigi yazsin"). Uc tarih PDF'teki
 * kalemlerin `published_at` degerlerinden TURETILIR, hic uydurulmaz: tarihli
 * kalem yoksa "Veri" parcasi hic basilmaz. `createdAt` raporun uretildigi an
 * (stats.generated_at); yoksa PDF'in basildigi an.
 */
export function dataLineText(articles = [], createdAt = null) {
  const times = (articles || [])
    .map((a) => (a?.published_at ? new Date(a.published_at).getTime() : NaN))
    .filter((t) => Number.isFinite(t));
  const parts = [];
  if (times.length) {
    const lo = trDate(new Date(Math.min(...times)));
    const hi = trDate(new Date(Math.max(...times)));
    parts.push(lo === hi ? `Veri: ${lo} tarihli haberler` : `Veri: ${lo} – ${hi} yayın tarihli haberler`);
  }
  const created = createdAt ? trDateTime(createdAt) : '';
  if (created) parts.push(`Oluşturulma: ${created}`);
  return parts.join(' · ');
}

/** Bolum basligi + sayac. */
export function sectionHead(label, count) {
  return `<div class="section-head">
  <h2>${esc(label)}</h2>
  <span class="count">${esc(trNumber(count))} HABER</span>
</div>`;
}

/** Panel sarmalayici (infografik kutusu). */
export function panel(title, body, note = '') {
  return `<div class="panel">
  <div class="panel-head">${esc(title)}</div>
  ${body}
  ${note ? `<p class="panel-note">${esc(note)}</p>` : ''}
</div>`;
}

/**
 * Stats JSON'undaki dagilim nesnesini grafik verisine cevirir.
 * `labels` verilirse anahtarlar okunur etikete donusur.
 */
export function toBuckets(obj = {}, labels = null, { sort = true } = {}) {
  const rows = Object.entries(obj || {})
    .map(([key, count]) => ({
      key,
      label: labels ? (labels[key] || key) : key,
      count: Number(count) || 0,
    }))
    .filter((r) => r.count > 0);
  if (sort) rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'tr'));
  return rows;
}

export const REGION_BUCKET_LABELS = REGION_LABELS;

/** Kategori slug'larini okunur etikete cevirir (bilinmeyen slug oldugu gibi). */
export const CATEGORY_LABELS = Object.freeze({
  mevzuat: 'Mevzuat',
  tesvik: 'Teşvik',
  ihracat: 'İhracat',
  enerji: 'Enerji',
  vergi: 'Vergi',
  istihdam: 'İstihdam',
  surdurulebilirlik: 'Sürdürülebilirlik',
  finans: 'Finans',
  gundem: 'Gündem',
  sanayi: 'Sanayi',
  teknoloji: 'Teknoloji',
  ticaret: 'Ticaret',
});

export function categoryLabel(slug) {
  if (!slug) return 'Diğer';
  if (CATEGORY_LABELS[slug]) return CATEGORY_LABELS[slug];
  return String(slug).charAt(0).toLocaleUpperCase('tr') + String(slug).slice(1);
}

/** Alt not seridi — sayfa sonunda kaynak/uretim bilgisi. */
export function colophon(text) {
  return `<p style="margin-top:6mm;padding-top:2mm;border-top:0.4pt solid ${PALETTE.rule};
    font-family:${FONT_SANS_ATTR};font-size:6.6pt;letter-spacing:0.06em;color:${PALETTE.inkFaint}">
    ${esc(text)}</p>`;
}

export default {
  newsItem, newsList, masthead, kpiRow, sectionHead, panel,
  toBuckets, categoryLabel, colophon, dataLineText,
};
