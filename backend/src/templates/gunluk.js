// ---------------------------------------------------------------------
// GUNLUK BULTEN SABLONU — 1-2 sayfa, EN FAZLA 8 HABER, ustte 4 KPI
//
// Tasarim karari: gunluk bulten bir "vitrin", arsiv degil. Bu yuzden
//   * 8 haber siniri KOD DUZEYINDE (MAX_ITEMS) — cagiran daha fazla
//     gonderse de kirpilir, sablon iki sayfayi asmaz.
//   * Tek infografik seridi: band yigini + bolge cubuklari. Daha fazla
//     grafik bir gunun 8 haberi icin gurultu olur (haftalikta bol bol var).
//   * Yonetici ozeti 300 karaktere kirpiliyor; PDF'in ilk ekrani sayi ve
//     baslik gostermeli, paragraf degil.
// ---------------------------------------------------------------------
import { htmlDocument, trDate, trNumber, clip, REGION_LABELS } from './theme.js';
import { barList, stackedBand } from './charts.js';
import { masthead, kpiRow, newsList, panel, toBuckets, colophon, dataLineText } from './parts.js';

/** Gunluk sablonun sert ust siniri. */
export const MAX_ITEMS = 8;

export function renderGunluk(model = {}) {
  const stats = model.stats || {};
  const articles = (model.articles || []).slice(0, MAX_ITEMS);

  const dateRange = model.periodStart && model.periodEnd && model.periodStart !== model.periodEnd
    ? `${trDate(model.periodStart)} – ${trDate(model.periodEnd)}`
    : trDate(model.periodEnd || model.periodStart || model.generatedAt);

  const byBand = stats.by_band || {};
  const onemli = (Number(byBand.KRITIK) || 0) + (Number(byBand.YUKSEK) || 0);
  const scanned = Number(stats.scanned) || 0;
  const unique = Number(stats.unique) || articles.length;

  const kpis = [
    { label: 'Taranan haber', value: trNumber(scanned || unique) },
    { label: 'Tekilleştirilmiş', value: trNumber(unique) },
    { label: 'Kritik + Yüksek', value: trNumber(onemli), accent: onemli > 0 },
    { label: 'Kaynak', value: trNumber(Number(stats.sources) || 0) },
  ];

  const regionBuckets = toBuckets(stats.by_region, REGION_LABELS);

  const body = `
${masthead({
    kicker: 'GÜNLÜK BÜLTEN',
    title: model.title || 'İSO/İSOV Günlük Bülten',
    dateRange: dateRange ? `Dönem ${dateRange}` : '',
    dataLine: dataLineText(articles, model.stats?.generated_at || model.generatedAt),
    lede: clip(model.executiveSummary || '', 300),
    brand: model.brand,
  })}

${kpiRow(kpis)}

<section class="grid2" style="margin-bottom:6mm">
  ${panel('Önem bandı dağılımı', stackedBand(byBand),
    'Bant yüzdelik tabanlıdır: eşikler korpusun gerçek dağılımına göre kalibre edilir.')}
  ${panel('Bölge dağılımı', barList(regionBuckets, { maxRows: 5 }))}
</section>

<section class="section" style="margin-top:2mm">
  <div class="section-head">
    <h2>Günün öne çıkanları</h2>
    <span class="count">EN ÖNEMLİ ${trNumber(articles.length)}</span>
  </div>
  ${newsList(articles, { startRank: 1, summaryMax: 200 })}
</section>

${colophon('Haberler önem skoruna göre sıralanmıştır. Tam metin için panele bakın; '
  + 'bu bülten kasıtlı olarak kısa tutulmuştur.')}
`;

  return htmlDocument({
    title: model.title || 'İSO/İSOV Günlük Bülten',
    body,
    // Gunluk sablonda haber kalemleri biraz daha sikistirilir: 8 kalem +
    // KPI + iki grafik tek/iki sayfaya sigsin.
    extraCss: `
    .item { padding-bottom: 2.8mm; margin-bottom: 2.8mm; }
    .item h3 { font-size: 11.5pt; }
    .item .dek { font-size: 9.2pt; }
    `,
  });
}

export default { renderGunluk, MAX_ITEMS };
