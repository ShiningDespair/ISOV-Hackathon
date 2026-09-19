// ---------------------------------------------------------------------
// E-POSTA GOVDESI SABLONU
//
// NEDEN PDF SABLONUNDAN AYRI: e-posta istemcileri (Outlook basta) flexbox,
// SVG ve harici CSS'i ya kismen ya hic desteklemiyor. PDF sablonlari
// Chromium icin yazildi ve oradaki mizanpaj Outlook'ta dagilir. Bu yuzden
// e-posta govdesi:
//   * TABLO tabanli mizanpaj, SATIR ICI (inline) stil
//   * SVG YOK — infografik yerine metin/HTML cubuk
//   * 600 px sabit genislik, tek kolon
// Ayrintili gorsel rapor PDF EKINDE gider; e-posta govdesi "vitrin".
// ---------------------------------------------------------------------
import {
  PALETTE, FONT_SERIF_ATTR as FONT_SERIF, FONT_SANS_ATTR as FONT_SANS,
  REGION_LABELS, BAND_LABELS,
  esc, trDate, trNumber, clip,
} from './theme.js';

const W = 600;

function bandChip(band) {
  const bg = band === 'KRITIK' ? PALETTE.accent : (band === 'YUKSEK' ? PALETTE.ink : 'transparent');
  const fg = (band === 'KRITIK' || band === 'YUKSEK') ? '#FFFFFF' : PALETTE.inkSoft;
  const border = (band === 'KRITIK' || band === 'YUKSEK') ? bg : PALETTE.rule;
  return `<span style="display:inline-block;font-family:${FONT_SANS};font-size:10px;
    font-weight:700;letter-spacing:1.2px;text-transform:uppercase;padding:2px 6px;
    background:${bg};color:${fg};border:1px solid ${border}">${esc(BAND_LABELS[band] || band)}</span>`;
}

function itemRow(article, { index, baseUrl }) {
  const meta = [
    article.source?.name,
    REGION_LABELS[article.region] || article.region,
    trDate(article.published_at),
  ].filter(Boolean).map(esc).join(' &middot; ');

  const dek = clip(article.summary || (article.key_points || [])[0] || '', 220);
  const href = baseUrl ? `${baseUrl.replace(/\/+$/, '')}/haber/${article.id}` : article.url;

  return `<tr><td style="padding:14px 0;border-bottom:1px solid ${PALETTE.rule}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="28" valign="top" style="font-family:${FONT_SANS};font-size:12px;
      color:${PALETTE.inkFaint};padding-top:3px">${String(index).padStart(2, '0')}</td>
    <td valign="top">
      ${bandChip(article.importance_band || 'DUSUK')}
      <div style="margin-top:6px;font-family:${FONT_SERIF};font-size:17px;line-height:1.25;
        font-weight:700;color:${PALETTE.ink}">
        ${href ? `<a href="${esc(href)}" style="color:${PALETTE.ink};text-decoration:none">${esc(article.title || '(başlıksız)')}</a>`
    : esc(article.title || '(başlıksız)')}
      </div>
      <div style="margin-top:5px;font-family:${FONT_SANS};font-size:10.5px;letter-spacing:0.5px;
        text-transform:uppercase;color:${PALETTE.inkSoft}">${meta}</div>
      ${dek ? `<div style="margin-top:7px;font-family:${FONT_SERIF};font-size:14px;line-height:1.5;
        color:#2A2A2A">${esc(dek)}</div>` : ''}
    </td>
  </tr></table>
</td></tr>`;
}

function kpiCell(label, value, accent = false) {
  return `<td width="25%" valign="top" style="padding:0 8px 0 0;border-top:2px solid ${accent ? PALETTE.accent : PALETTE.ink}">
    <div style="font-family:${FONT_SANS};font-size:26px;font-weight:700;line-height:1.05;
      padding-top:6px;color:${accent ? PALETTE.accent : PALETTE.ink}">${esc(value)}</div>
    <div style="font-family:${FONT_SANS};font-size:10px;letter-spacing:0.8px;text-transform:uppercase;
      color:${PALETTE.inkSoft};padding-top:4px">${esc(label)}</div>
  </td>`;
}

/**
 * Bulten e-postasi.
 *
 * @param {object} input
 * @param {object} input.user      {full_name, email}
 * @param {string} input.kind      'gunluk' | 'haftalik'
 * @param {Array}  input.articles
 * @param {object} [input.stats]
 * @param {string} [input.baseUrl] panel adresi (haber baglantilari icin)
 * @param {string} [input.pdfNote] ek hakkinda kisa not
 */
export function renderDigestMail({
  user = {}, kind = 'gunluk', articles = [], stats = {},
  periodStart, periodEnd, baseUrl = process.env.PUBLIC_BASE_URL || '',
  pdfNote = '', unsubscribeUrl = '',
} = {}) {
  const kicker = kind === 'gunluk' ? 'GÜNLÜK BÜLTEN' : 'HAFTALIK BÜLTEN';
  const dateRange = periodStart && periodEnd && String(periodStart) !== String(periodEnd)
    ? `${trDate(periodStart)} – ${trDate(periodEnd)}`
    : trDate(periodEnd || periodStart);

  const byBand = stats.by_band || {};
  const onemli = (Number(byBand.KRITIK) || 0) + (Number(byBand.YUKSEK) || 0);
  const greeting = user.full_name
    ? `Sayın ${esc(user.full_name)},`
    : 'Merhaba,';

  const rows = articles.map((a, i) => itemRow(a, { index: i + 1, baseUrl })).join('\n');

  return `<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(kicker)}</title></head>
<body style="margin:0;padding:0;background:${PALETTE.paper}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
  style="background:${PALETTE.paper}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="${W}" cellpadding="0" cellspacing="0" border="0"
  style="width:${W}px;max-width:100%;background:${PALETTE.surface};padding:28px 26px">

  <tr><td style="border-bottom:1px solid ${PALETTE.rule};padding-bottom:8px">
    <table role="presentation" width="100%"><tr>
      <td style="font-family:${FONT_SANS};font-size:12px;font-weight:700;letter-spacing:3px;
        text-transform:uppercase">İSO &middot; İSOV</td>
      <td align="right" style="font-family:${FONT_SANS};font-size:10px;font-weight:700;
        letter-spacing:1.5px;color:${PALETTE.accent}">${esc(kicker)}</td>
    </tr></table>
  </td></tr>

  <tr><td style="padding-top:14px;font-family:${FONT_SERIF};font-size:26px;font-weight:700;
    line-height:1.15;letter-spacing:-0.4px">Dış Kaynak İzleme Bülteni</td></tr>
  <tr><td style="padding-top:6px;font-family:${FONT_SANS};font-size:11px;letter-spacing:1px;
    text-transform:uppercase;color:${PALETTE.inkSoft}">${esc(dateRange)}</td></tr>

  <tr><td style="padding-top:16px;font-family:${FONT_SERIF};font-size:15px;line-height:1.55">
    ${greeting} bu dönemde sizin profilinize göre seçilen
    <strong>${trNumber(articles.length)}</strong> haber aşağıda.
  </td></tr>

  <tr><td style="padding-top:22px"><table role="presentation" width="100%"><tr>
    ${kpiCell('Seçilen haber', trNumber(articles.length))}
    ${kpiCell('Kritik + Yüksek', trNumber(onemli), onemli > 0)}
    ${kpiCell('Taranan', trNumber(Number(stats.scanned) || Number(stats.unique) || 0))}
    ${kpiCell('Kaynak', trNumber(Number(stats.sources) || 0))}
  </tr></table></td></tr>

  <tr><td style="padding-top:8px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${rows || `<tr><td style="padding:20px 0;font-family:${FONT_SERIF};font-style:italic;
        color:${PALETTE.inkFaint}">Bu dönemde ölçütlerinize uyan haber bulunamadı.</td></tr>`}
    </table>
  </td></tr>

  ${pdfNote ? `<tr><td style="padding-top:18px;font-family:${FONT_SANS};font-size:11px;
    line-height:1.6;color:${PALETTE.inkSoft};background:${PALETTE.paperDeep};padding:12px 14px">
    ${esc(pdfNote)}</td></tr>` : ''}

  <tr><td style="padding-top:22px;border-top:1px solid ${PALETTE.rule};
    font-family:${FONT_SANS};font-size:10px;line-height:1.7;color:${PALETTE.inkFaint}">
    Bu bülten İstanbul Sanayi Odası Vakfı dış kaynak izleme sistemi tarafından
    otomatik hazırlanmıştır. Haber sıralaması profilinize göre kişiselleştirilmiştir;
    kritik haberler her zaman listeye girer.
    ${baseUrl ? `<br><a href="${esc(baseUrl)}" style="color:${PALETTE.inkSoft}">Panele git</a>` : ''}
    ${unsubscribeUrl ? ` &middot; <a href="${esc(unsubscribeUrl)}" style="color:${PALETTE.inkSoft}">Bülten tercihlerini değiştir</a>` : ''}
  </td></tr>

</table></td></tr></table>
</body></html>`;
}

export default { renderDigestMail };
