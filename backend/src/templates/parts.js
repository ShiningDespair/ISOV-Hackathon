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
  bandClass, esc, trDate, trNumber, clip,
} from './theme.js';

/** Kaynak · bolge · tarih satiri. Bos parcalar sessizce atlanir. */
function metaLine(article) {
  const bits = [];
  if (article.source?.name) bits.push(article.source.name);
  if (article.region) bits.push(REGION_LABELS[article.region] || article.region);
  if (article.published_at) bits.push(trDate(article.published_at));
  return bits.map(esc).join(' &middot; ');
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
export function masthead({ kicker, title, dateRange, lede, brand = 'İSO · İSOV' }) {
  return `<header class="masthead">
  <div class="masthead-top">
    <span class="wordmark">${esc(brand)}</span>
    <span class="kicker kicker-accent">${esc(kicker)}</span>
    <span class="kicker">${esc(dateRange)}</span>
  </div>
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
  toBuckets, categoryLabel, colophon,
};
