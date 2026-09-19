// ---------------------------------------------------------------------
// PDF SABLON TEMASI — palet, tipografi, ortak CSS ve bicimleyiciler
//
// NEDEN AYRI DOSYA: iki sablon (gunluk / haftalik) ayni paleti ve ayni
// bicimleyicileri kullaniyor. Palet degerleri frontend/app/globals.css
// @theme blogundan BIREBIR kopyalandi (kagit #F7F7F5, murekkep #121212,
// kural #E2E2E0, vurgu #8B0000) — iki calisma zamani, tek gorsel dil.
//
// FONT SOZLESMESI: konteynerde Google Fonts YOK ve ag erisimine guvenmiyoruz
// (PDF uretimi cevrimdisi de calismali). Bu yuzden yalnizca imajda kurulu
// olan aileler kullanilir:
//   serif -> Liberation Serif (Times metrik esdegeri) / DejaVu Serif
//   sans  -> Liberation Sans  (Arial metrik esdegeri) / DejaVu Sans
// Iki aile de Turkce'nin tamamini (ç ğ ı İ ö ş ü) kapsar. Dockerfile
// `fonts-liberation` + `fonts-dejavu-core` paketlerini bu yuzden kuruyor;
// bu paketler olmadan Chromium son cikis olarak bitmap font kullanir ve
// Turkce harfler kutuya doner.
// ---------------------------------------------------------------------

/** Gazete paleti — globals.css @theme ile ayni degerler. */
export const PALETTE = Object.freeze({
  paper: '#F7F7F5',
  surface: '#FFFFFF',
  paperDeep: '#EFEEEA',
  ink: '#121212',
  inkSoft: '#5A5A5A',
  inkFaint: '#8B8B8B',
  rule: '#E2E2E0',
  ruleStrong: '#121212',
  accent: '#8B0000',
});

export const FONT_SERIF = '"Liberation Serif", "DejaVu Serif", Georgia, "Times New Roman", "Nimbus Roman", serif';
export const FONT_SANS = '"Liberation Sans", "DejaVu Sans", "Helvetica Neue", Helvetica, Arial, sans-serif';

/**
 * SATIR ICI (inline) `style="..."` ICIN TEK TIRNAKLI SURUMLER.
 *
 * TUZAK — BIR KEZ YASANDI: yukaridaki yiginlar CIFT TIRNAK iceriyor ve
 * `style="font-family:\"Liberation Sans\",..."` yazildiginda ilk cift
 * tirnak HTML ozniteligini ERKEN KAPATIYOR. Sonucu sessiz: font ailesi
 * uygulanmiyor (serif'e duser) VE ayni style icindeki sonraki butun
 * bildirimler (text-transform, letter-spacing...) tamamen kayboluyor.
 * Hata tarayicida gorunur bir uyari uretmiyor; yalnizca cikti yanlis.
 *
 * KURAL: `<style>` blogunda FONT_SERIF / FONT_SANS, `style="..."`
 * ozniteliginde FONT_SERIF_ATTR / FONT_SANS_ATTR kullanilir.
 */
export const FONT_SERIF_ATTR = FONT_SERIF.replace(/"/g, "'");
export const FONT_SANS_ATTR = FONT_SANS.replace(/"/g, "'");

export const REGION_LABELS = Object.freeze({
  KURESEL: 'Küresel',
  TURKIYE: 'Türkiye',
  AMERIKA: 'Amerika',
  AVRUPA: 'Avrupa',
  ASYA: 'Asya',
  DIGER: 'Diğer',
});

export const BAND_LABELS = Object.freeze({
  KRITIK: 'Kritik',
  YUKSEK: 'Yüksek',
  ORTA: 'Orta',
  DUSUK: 'Düşük',
});

/** Band rozetinin gorsel karsiligi — yalnizca murekkep + tek vurgu. */
export function bandClass(band) {
  switch (band) {
    case 'KRITIK': return 'badge badge-kritik';
    case 'YUKSEK': return 'badge badge-yuksek';
    case 'ORTA': return 'badge badge-orta';
    default: return 'badge badge-dusuk';
  }
}

// --- kacis ve bicimleme ----------------------------------------------

/**
 * HTML kacisi. Sablonlar veritabanindan gelen basliklari dogrudan
 * gomuyor; kacis OLMADAN tek bir `<` karakteri sayfayi bozardi.
 */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 'YYYY-MM-DD' veya Date -> '14.09.2026'. */
export function trDate(value) {
  if (!value) return '';
  const s = typeof value === 'string' ? value.slice(0, 10) : null;
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}.${m}.${y}`;
  }
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(dt);
}

/** Tarih + saat, TRT. Ureti damgasi icin. */
export function trDateTime(value) {
  const dt = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(dt.getTime())) return '';
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(dt).replace(',', '');
}

/** Binlik ayraci nokta (TR). */
export function trNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('tr-TR').format(n);
}

/** Yuzde — ondalik ayraci virgul. */
export function trPercent(ratio, digits = 1) {
  const n = Number(ratio);
  if (!Number.isFinite(n)) return '%0';
  return `%${(n * 100).toFixed(digits).replace('.', ',')}`;
}

/**
 * Metni kelime sinirindan keser. PDF "yaziya bogulmasin" istegi geregi
 * sablonlarda TAM GOVDE hicbir yerde basilmaz; ozet bu fonksiyondan gecer.
 */
export function clip(text, max = 260) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trim()}…`;
}

// --- ortak CSS -------------------------------------------------------
//
// SAYFA KENARLARI CSS'te DEGIL: Chromium'a `margin` secenegi ile veriliyor
// (pdfService). @page margin ile puppeteer margin'i birlikte kullanmak
// ikisini toplar ve mizanpaj icerik alanini iki kez daraltir.
//
// Sayfa numarasi ve uretim damgasi da CSS'te DEGIL: Chromium'un
// footerTemplate'i kullaniliyor — tek dogru toplam sayfa sayisini
// (totalPages) yalnizca o biliyor.

export function baseCss() {
  return `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: ${PALETTE.surface};
    color: ${PALETTE.ink};
    font-family: ${FONT_SERIF};
    font-size: 10.5pt;
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }
  /* Renkli dolgular yazdirmada da korunsun (rozet, cubuk, halka). */
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  h1, h2, h3, h4 { margin: 0; font-weight: 700; letter-spacing: -0.012em; line-height: 1.12; }

  .kicker {
    font-family: ${FONT_SANS};
    font-weight: 700;
    font-size: 6.8pt;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: ${PALETTE.inkSoft};
  }
  .kicker-accent { color: ${PALETTE.accent}; }
  .soft { color: ${PALETTE.inkSoft}; }
  .faint { color: ${PALETTE.inkFaint}; }
  .num { font-variant-numeric: tabular-nums; }

  /* --- kunye (masthead) --- */
  .masthead { border-bottom: 2pt solid ${PALETTE.ink}; padding-bottom: 4mm; margin-bottom: 5mm; }
  .masthead-top {
    display: flex; justify-content: space-between; align-items: baseline;
    border-bottom: 0.4pt solid ${PALETTE.rule};
    padding-bottom: 2mm; margin-bottom: 3.5mm;
  }
  .masthead h1 { font-size: 23pt; font-weight: 900; letter-spacing: -0.03em; }
  .masthead .lede {
    margin-top: 3mm; font-size: 10pt; line-height: 1.5; color: ${PALETTE.inkSoft};
    max-width: 150mm;
  }
  .wordmark {
    font-family: ${FONT_SANS}; font-weight: 700; font-size: 9pt;
    letter-spacing: 0.22em; text-transform: uppercase;
  }

  /* --- KPI seridi: BUYUK SAYILAR, ince kural, bol beyaz alan --- */
  .kpis { display: flex; gap: 6mm; margin: 0 0 5.5mm; }
  .kpi { flex: 1 1 0; border-top: 1.4pt solid ${PALETTE.ink}; padding-top: 2mm; }
  .kpi .v {
    font-size: 27pt; font-weight: 900; line-height: 0.95; letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
  }
  .kpi .n { margin-top: 1.5mm; font-size: 7.5pt; color: ${PALETTE.inkSoft}; line-height: 1.3; }
  .kpi.accent { border-top-color: ${PALETTE.accent}; }
  .kpi.accent .v { color: ${PALETTE.accent}; }

  /* --- bolum basligi --- */
  .section { margin-top: 7mm; }
  .section-head {
    display: flex; align-items: baseline; justify-content: space-between;
    border-bottom: 1pt solid ${PALETTE.ink};
    padding-bottom: 1.5mm; margin-bottom: 3.5mm;
    break-after: avoid; page-break-after: avoid;
  }
  .section-head h2 { font-size: 13pt; }
  .section-head .count { font-family: ${FONT_SANS}; font-size: 7pt; letter-spacing: 0.12em; color: ${PALETTE.inkFaint}; }

  /* --- haber kalemi: band rozeti + baslik + meta + KISA ozet --- */
  .items { display: block; }

  /* GAZETE KOLONLARI — TEK AKIS.
     Bolum basliklari column-span:all ile iki kolonu birlikte keser;
     kalemler kesintisiz akar. Bolum basina ayri multicol kabi acmak
     her bolumde yarim kolon bosluk biraktigi icin (olculdu: 6 sayfa
     yerine 4) TEK kap kullaniliyor. */
  .dump {
    column-count: 2;
    column-gap: 7mm;
    column-rule: 0.4pt solid ${PALETTE.rule};
  }
  .dump .section-head {
    column-span: all;
    margin-top: 5mm;
    margin-bottom: 3mm;
  }
  .dump .section-head:first-child { margin-top: 0; }
  .dump .item h3 { font-size: 10.8pt; line-height: 1.16; }
  .dump .item .dek { font-size: 8.6pt; line-height: 1.38; }
  .dump .item .meta { font-size: 6.4pt; }
  .dump .item { padding-bottom: 2.6mm; margin-bottom: 2.6mm; }

  /* GAZETE KOLONLARI — haftalik sablonun haber dokumu.
     column-rule ince kural cizgisi; kalemler kolon/sayfa sinirinda
     BOLUNMEZ (break-inside: avoid, .item uzerinde). Chromium multicol'u
     sayfalar arasinda dogru parcaliyor, ek sayfa sonu kurali gerekmiyor. */
  .items-2col {
    column-count: 2;
    column-gap: 7mm;
    column-rule: 0.4pt solid ${PALETTE.rule};
  }
  .items-2col .item h3 { font-size: 10.8pt; line-height: 1.16; }
  .items-2col .item .dek { font-size: 8.6pt; line-height: 1.38; }
  .items-2col .item .meta { font-size: 6.4pt; }
  .items-2col .item { padding-bottom: 2.6mm; margin-bottom: 2.6mm; }
  .item {
    break-inside: avoid; page-break-inside: avoid;
    padding: 0 0 3.2mm;
    margin-bottom: 3.2mm;
    border-bottom: 0.4pt solid ${PALETTE.rule};
  }
  .item:last-child { border-bottom: 0; margin-bottom: 0; }
  .item-top { display: flex; align-items: center; gap: 2.5mm; margin-bottom: 1.4mm; }
  .item h3 { font-size: 12pt; line-height: 1.18; }
  .item .meta {
    font-family: ${FONT_SANS}; font-size: 7pt; letter-spacing: 0.06em;
    color: ${PALETTE.inkSoft}; margin-top: 1.2mm;
    text-transform: uppercase;
  }
  .item .dek { margin-top: 1.6mm; font-size: 9.4pt; line-height: 1.42; color: #2A2A2A; }
  .item .rank {
    font-family: ${FONT_SANS}; font-size: 8pt; font-weight: 700;
    color: ${PALETTE.inkFaint}; font-variant-numeric: tabular-nums;
    min-width: 6mm;
  }

  .badge {
    display: inline-block;
    font-family: ${FONT_SANS}; font-size: 6.2pt; font-weight: 700;
    letter-spacing: 0.12em; text-transform: uppercase;
    padding: 0.7mm 1.6mm 0.5mm; line-height: 1;
    white-space: nowrap;
  }
  .badge-kritik { background: ${PALETTE.accent}; color: #FFF; }
  .badge-yuksek { background: ${PALETTE.ink}; color: #FFF; }
  .badge-orta   { background: transparent; color: ${PALETTE.ink};      box-shadow: inset 0 0 0 0.5pt ${PALETTE.ink}; }
  .badge-dusuk  { background: transparent; color: ${PALETTE.inkFaint}; box-shadow: inset 0 0 0 0.5pt ${PALETTE.rule}; }

  /* --- infografik izgarasi --- */
  .grid2 { display: flex; gap: 8mm; }
  .grid2 > * { flex: 1 1 0; min-width: 0; }
  .grid3 { display: flex; gap: 6mm; }
  .grid3 > * { flex: 1 1 0; min-width: 0; }
  .panel { break-inside: avoid; page-break-inside: avoid; }
  .panel-head {
    font-family: ${FONT_SANS}; font-weight: 700; font-size: 7pt;
    letter-spacing: 0.13em; text-transform: uppercase;
    border-top: 1.4pt solid ${PALETTE.ink}; padding-top: 1.8mm; margin-bottom: 2.5mm;
  }
  .panel-note { margin-top: 2mm; font-size: 8pt; color: ${PALETTE.inkFaint}; line-height: 1.35; }

  .page-break { break-after: page; page-break-after: always; }
  .rule-thin { border: 0; border-top: 0.4pt solid ${PALETTE.rule}; margin: 5mm 0; }
  .empty { font-size: 9.5pt; color: ${PALETTE.inkFaint}; font-style: italic; }
  `;
}

/**
 * Tam HTML belgesi sarmalayicisi.
 * Sablonlar yalnizca govde uretir; <head> ve CSS tek yerde.
 */
export function htmlDocument({ title, body, extraCss = '' }) {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>${baseCss()}${extraCss}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export default {
  PALETTE, FONT_SERIF, FONT_SANS, REGION_LABELS, BAND_LABELS,
  bandClass, esc, trDate, trDateTime, trNumber, trPercent, clip,
  baseCss, htmlDocument,
};
