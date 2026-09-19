// ---------------------------------------------------------------------
// PDF INFOGRAFIKLERI — SAF SVG, HARICI KUTUPHANE YOK
//
// Mantik frontend/components/Charts.tsx'ten odunc alindi (ayni gorsel dil,
// ayni olcekleme kurallari) ama JSX degil string uretir: burada React yok,
// Chromium'a dogrudan HTML veriliyor.
//
// NEDEN KUTUPHANE YOK:
//   * Chart.js/D3 gibi bir paket PDF icin tarayicida JS calistirmayi ve
//     "cizim bitti mi?" sorusunu cozmeyi gerektirir; statik SVG'de boyle
//     bir yaris durumu YOK — sayfa yuklenince cizim hazirdir.
//   * CDN'e cikmak PDF uretimini aga bagimli yapardi.
//
// Tum cizimler yalnizca murekkep (#121212), soluk murekkep ve tek vurgu
// rengi (#8B0000) kullanir; gazete estetiginden kopmaz.
// ---------------------------------------------------------------------
import { PALETTE, FONT_SANS, FONT_SANS_ATTR, esc, trNumber, trPercent } from './theme.js';

/** SVG sayi bicimi: ondalik nokta (SVG koordinati), locale DEGIL. */
const n = (v) => Number(v).toFixed(2);

/**
 * Yatay cubuk listesi — bolge / band / kategori dagilimlari.
 * `accentKeys` icindeki anahtarlar bordo dolgu alir (or. KRITIK).
 *
 * @param {{key:string,label:string,count:number}[]} data
 */
export function barList(data = [], { accentKeys = [], emptyLabel = 'Veri yok', maxRows = 8 } = {}) {
  const rows = data.filter((d) => d && Number.isFinite(Number(d.count))).slice(0, maxRows);
  if (rows.length === 0) return `<p class="empty">${esc(emptyLabel)}</p>`;

  const max = Math.max(...rows.map((d) => Number(d.count)), 1);
  const total = rows.reduce((s, d) => s + Number(d.count), 0);

  const rowH = 9.4;      // viewBox birimi (~8 mm, kutu genisligi 88 mm iken)
  const labelW = 26;     // mm
  const valueW = 17;     // mm
  const width = 100;     // yuzde tabanli viewBox: 100 birim = kutunun tamami
  const height = rows.length * rowH;
  const barX = labelW;
  const barW = width - labelW - valueW;

  const parts = rows.map((d, i) => {
    const count = Number(d.count);
    const y = i * rowH;
    const w = Math.max((count / max) * barW, count > 0 ? 0.6 : 0);
    const share = total > 0 ? count / total : 0;
    const accent = accentKeys.includes(d.key);
    return `
    <g>
      <text x="0" y="${n(y + 4.6)}" class="c-lbl">${esc(d.label)}</text>
      <rect x="${n(barX)}" y="${n(y + 2.1)}" width="${n(barW)}" height="2.6" fill="${PALETTE.paperDeep}"/>
      <rect x="${n(barX)}" y="${n(y + 2.1)}" width="${n(w)}" height="2.6" fill="${accent ? PALETTE.accent : PALETTE.ink}"/>
      <text x="${width}" y="${n(y + 4.6)}" text-anchor="end" class="c-val">${esc(trNumber(count))} · ${esc(trPercent(share, 0))}</text>
    </g>`;
  }).join('');

  // YUKSEKLIK ACIKCA VERILMEZ: `height="Xmm"` + `meet` ikilisi, kutu
  // genisligi viewBox'tan dar oldugunda cizimi kucultup ALTTA BOS SERIT
  // birakiyordu (olculdu: haftalik sayfa 1'de ~25 mm bosluk). viewBox
  // orani yuklenince tarayici yuksekligi genislikten TURETIYOR ve bosluk
  // kalmiyor; 1 viewBox birimi = kutu genisligi / 100.
  return `<svg viewBox="0 0 ${width} ${n(height)}" width="100%"
   style="display:block;height:auto" preserveAspectRatio="xMinYMin meet" role="img"
   aria-label="Dağılım grafiği, ${rows.length} kategori">
  <style>
    .c-lbl { font-family: ${FONT_SANS}; font-size: 2.55px; font-weight: 700;
             letter-spacing: 0.08px; fill: ${PALETTE.ink}; }
    .c-val { font-family: ${FONT_SANS}; font-size: 2.4px; fill: ${PALETTE.inkFaint}; }
  </style>
  ${parts}
</svg>`;
}

/**
 * Gunluk haber serisi — sutun grafik.
 * Charts.tsx DailyBars ile ayni olcekleme: max'a gore normalize, taban
 * kural cizgisi, ilk/son gun etiketi altta.
 */
export function dailyBars(data = [], { heightMm = 26, emptyLabel = 'Günlük seri verisi yok.' } = {}) {
  const rows = data.filter(Boolean);
  if (rows.length === 0) return `<p class="empty">${esc(emptyLabel)}</p>`;

  const width = 100;
  const pad = { top: 3, bottom: 6 };
  const height = heightMm;
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(...rows.map((d) => Number(d.count) || 0), 1);
  const slot = width / rows.length;
  const barW = Math.max(0.5, Math.min(slot * 0.62, 4));

  const bars = rows.map((d, i) => {
    const c = Number(d.count) || 0;
    const h = (c / max) * plotH;
    const x = i * slot + (slot - barW) / 2;
    const y = pad.top + plotH - h;
    return `<rect x="${n(x)}" y="${n(y)}" width="${n(barW)}" height="${n(Math.max(h, c > 0 ? 0.35 : 0))}" fill="${PALETTE.ink}"/>`;
  }).join('');

  const first = rows[0]?.label ?? '';
  const last = rows[rows.length - 1]?.label ?? '';

  return `<svg viewBox="0 0 ${width} ${n(height)}" width="100%" height="${n(height)}mm"
   preserveAspectRatio="none" role="img"
   aria-label="Günlük haber sayısı, ${rows.length} gün, en yüksek ${max}">
  <style>
    .d-lbl { font-family: ${FONT_SANS}; font-size: 2.3px; fill: ${PALETTE.inkFaint}; }
  </style>
  ${bars}
  <line x1="0" y1="${n(pad.top + plotH)}" x2="${width}" y2="${n(pad.top + plotH)}"
        stroke="${PALETTE.ink}" stroke-width="0.25"/>
  <text x="0" y="${n(height - 1)}" class="d-lbl">${esc(first)}</text>
  <text x="${width / 2}" y="${n(height - 1)}" text-anchor="middle" class="d-lbl">en yüksek ${esc(trNumber(max))}</text>
  <text x="${width}" y="${n(height - 1)}" text-anchor="end" class="d-lbl">${esc(last)}</text>
</svg>`;
}

/**
 * Halka (donut) — tek oranli gostergeler, or. tekillestirme orani.
 * Cember cevresi strokeDasharray ile boyanir; tek path, tek stroke.
 */
export function donut(ratio, { label = '', sublabel = '', sizeMm = 30, accent = false } = {}) {
  const r = Math.max(0, Math.min(1, Number(ratio) || 0));
  const box = 100;
  const radius = 38;
  const cx = box / 2;
  const cy = box / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * r;

  return `<div style="width:${sizeMm}mm">
  <svg viewBox="0 0 ${box} ${box}" width="100%" height="${sizeMm}mm" role="img"
     aria-label="${esc(label)}: ${esc(trPercent(r))}">
    <style>
      .k-v { font-family: ${FONT_SANS}; font-size: 17px; font-weight: 700;
             fill: ${accent ? PALETTE.accent : PALETTE.ink}; }
    </style>
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${PALETTE.paperDeep}" stroke-width="9"/>
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none"
            stroke="${accent ? PALETTE.accent : PALETTE.ink}" stroke-width="9"
            stroke-dasharray="${n(filled)} ${n(circumference - filled)}"
            stroke-linecap="butt"
            transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy + 6}" text-anchor="middle" class="k-v">${esc(trPercent(r, r < 0.1 ? 1 : 0))}</text>
  </svg>
  ${label ? `<p class="kicker" style="text-align:center;margin:1.5mm 0 0">${esc(label)}</p>` : ''}
  ${sublabel ? `<p class="panel-note" style="text-align:center;margin-top:0.8mm">${esc(sublabel)}</p>` : ''}
</div>`;
}

/**
 * En cok etiket / kategori — sayi + ince cubuk, kelime bulutu DEGIL.
 * Kelime bulutu gorsel olarak eglenceli ama karsilastirilamaz; ayni
 * yerde sayilabilir bir siralama daha cok bilgi tasiyor.
 */
export function topTags(data = [], { maxRows = 10, emptyLabel = 'Etiket verisi yok' } = {}) {
  const rows = data.filter(Boolean).slice(0, maxRows);
  if (rows.length === 0) return `<p class="empty">${esc(emptyLabel)}</p>`;
  const max = Math.max(...rows.map((d) => Number(d.count) || 0), 1);

  const lis = rows.map((d, i) => {
    const c = Number(d.count) || 0;
    const pct = Math.max((c / max) * 100, 2);
    return `<li style="display:flex;align-items:center;gap:2mm;padding:0.9mm 0;
      border-bottom:0.3pt solid ${PALETTE.rule}">
      <span style="font-family:${FONT_SANS_ATTR};font-size:6.5pt;color:${PALETTE.inkFaint};width:4mm">${i + 1}</span>
      <span style="flex:0 0 32mm;font-family:${FONT_SANS_ATTR};font-size:7.4pt;font-weight:600">${esc(d.label)}</span>
      <span style="flex:1 1 auto;height:1.7mm;background:${PALETTE.paperDeep};display:block">
        <span style="display:block;height:100%;width:${pct.toFixed(1)}%;background:${PALETTE.ink}"></span>
      </span>
      <span class="num" style="font-family:${FONT_SANS_ATTR};font-size:7pt;width:8mm;text-align:right">${esc(trNumber(c))}</span>
    </li>`;
  }).join('');

  return `<ul style="list-style:none;margin:0;padding:0">${lis}</ul>`;
}

/**
 * Yatay yigilmis serit — band dagilimini TEK satirda gosterir.
 * KRITIK bordo, diger bandlar koyudan aciga murekkep tonu.
 */
export function stackedBand(byBand = {}, { heightMm = 7 } = {}) {
  const order = [
    ['KRITIK', 'Kritik', PALETTE.accent],
    ['YUKSEK', 'Yüksek', PALETTE.ink],
    ['ORTA', 'Orta', PALETTE.inkSoft],
    ['DUSUK', 'Düşük', PALETTE.rule],
  ];
  const total = order.reduce((s, [k]) => s + (Number(byBand[k]) || 0), 0);
  if (total === 0) return '<p class="empty">Band dağılımı yok</p>';

  const segs = order.map(([k, , color]) => {
    const c = Number(byBand[k]) || 0;
    if (c === 0) return '';
    const pct = (c / total) * 100;
    return `<span style="display:block;height:100%;width:${pct.toFixed(2)}%;background:${color}"></span>`;
  }).join('');

  const legend = order.map(([k, label, color]) => {
    const c = Number(byBand[k]) || 0;
    return `<span style="display:inline-flex;align-items:center;gap:1.2mm;margin-right:4mm">
      <span style="width:2.2mm;height:2.2mm;background:${color};display:inline-block"></span>
      <span class="kicker" style="font-size:6.4pt">${esc(label)} ${esc(trNumber(c))}</span>
    </span>`;
  }).join('');

  return `<div>
    <div style="display:flex;height:${heightMm}mm;width:100%;overflow:hidden">${segs}</div>
    <div style="margin-top:1.8mm">${legend}</div>
  </div>`;
}

export default { barList, dailyBars, donut, topTags, stackedBand };
