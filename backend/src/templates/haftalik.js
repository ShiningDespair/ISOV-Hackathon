// ---------------------------------------------------------------------
// HAFTALIK BULTEN SABLONU — 3-5 sayfa
//
// SAYFA 1 TEK SAYFAYA SIGMAK ZORUNDA: ilk surumde 285 mm cikti ve sayfa
// ici yuksekligi 267 mm oldugu icin son ucte tasip 2. sayfaya 18 mm'lik
// bir kirinti birakti (toplam 6 sayfa). Kunye punto, ozet kirpma siniri,
// bolum araliklari ve halka/sutun boyutlari bu yuzden olculup kisildi.
// Buradaki sayilari buyutmek grafik sayfasini yine ikiye boler.
//
// SAYFA 1: INFOGRAFIK SAYFASI (kullanici istegi: "yaziya bogulmamali,
//   eglenceli bir tasarim, infografikler ekleyebiliriz")
//   * kunye + 4 KPI (buyuk sayilar)
//   * bolge dagilimi cubuklari, band yigini
//   * gunluk haber serisi (sutun)
//   * tekillestirme orani halkasi + kume halkasi
//   * en cok kategori siralamasi
//   Sonra ZORUNLU sayfa sonu (.page-break) — grafik sayfasi haber
//   listesiyle karismasin, ilk sayfa tek basina "kapak" olsun.
//
// SAYFA 2+: BOLGEYE GORE BOLUMLER (CONTRACT SECTION_ORDER sirasi)
//   Her bolum kendi basligi altinda; bolum icinde onem sirasi korunur.
//
// SAYFA SAYISI NEDEN 3-5 — OLCULDU, TAHMIN DEGIL:
//   Kalem yuksekligi tek kolonda 33,9 mm (40 kalem, canli rapor #1'de
//   tarayicida olculdu). Sayfa ici yuksekligi 267 mm; yani tek kolonda
//   40 kalem = 5,1 sayfa haber + 1 grafik sayfasi + bolum basliklari = 9
//   sayfa cikti. Bu hedefin iki kati.
//   COZUM: haber dokumu IKI KOLON (parts.js newsList columns:2) ve ozet
//   siniri 150 karakter. Ayni 40 kalem 4 sayfaya iniyor.
//   `limit` ile 12-20 kaleme dusulen raporlarda 3 sayfa, 200 kalemlik ust
//   sinirda daha uzun olur — sablon iki ucta da bozulmaz cunku sayfa
//   sonlari sabit CSS kuraliyla degil icerik akisiyla veriliyor.
// ---------------------------------------------------------------------
import { htmlDocument, trDate, trNumber, trPercent, clip, REGION_LABELS } from './theme.js';
import { barList, dailyBars, donut, topTags, stackedBand } from './charts.js';
import {
  masthead, kpiRow, newsList, panel, sectionHead, toBuckets, categoryLabel, colophon,
} from './parts.js';

export function renderHaftalik(model = {}) {
  const stats = model.stats || {};
  const articles = model.articles || [];
  const sections = (model.sections || []).filter((s) => s.items?.length);

  const dateRange = `${trDate(model.periodStart)} – ${trDate(model.periodEnd)}`;
  const byBand = stats.by_band || {};
  const onemli = (Number(byBand.KRITIK) || 0) + (Number(byBand.YUKSEK) || 0);
  const scanned = Number(stats.scanned) || 0;
  const unique = Number(stats.unique) || articles.length;
  const dedupRatio = Number.isFinite(Number(stats.dedup_ratio))
    ? Number(stats.dedup_ratio)
    : (scanned > 0 ? (Number(stats.duplicates) || 0) / scanned : 0);
  const clusters = Number(stats.clusters) || 0;
  // "Kume orani" (kume/tekil) ANLAMSIZDI: neredeyse her tekil haber kendi
  // kumesi oldugu icin daima ~%100 cikiyordu (olculdu: 73/72). Yerine
  // gercekten degisken ve karar verdiren bir oran: donemin haberlerinin
  // kaci kritik veya yuksek bandda.
  const onemliRatio = unique > 0 ? Math.min(1, onemli / unique) : 0;

  const kpis = [
    { label: 'Taranan haber', value: trNumber(scanned || unique) },
    { label: 'Tekilleştirilmiş', value: trNumber(unique) },
    { label: 'Kritik + Yüksek', value: trNumber(onemli), accent: onemli > 0 },
    { label: 'İzlenen kaynak', value: trNumber(Number(stats.sources) || 0) },
  ];

  const regionBuckets = toBuckets(stats.by_region, REGION_LABELS);
  const categoryBuckets = (stats.top_categories || [])
    .map((c) => ({ key: c.key, label: categoryLabel(c.key), count: Number(c.count) || 0 }))
    .filter((c) => c.count > 0);
  const daily = model.daily || [];

  // --- SAYFA 1: grafikler ------------------------------------------------
  const page1 = `
${masthead({
    kicker: 'HAFTALIK BÜLTEN',
    title: model.title || 'İSO/İSOV Haftalık Bülten',
    dateRange,
    lede: clip(model.executiveSummary || '', 360),
    brand: model.brand,
  })}

${kpiRow(kpis)}

<section class="grid2" style="margin-bottom:5mm">
  ${panel('Bölge dağılımı', barList(regionBuckets, { maxRows: 6 }),
    'Haberler yayın coğrafyasına göre; bülten bölümleri de bu sırayı izler.')}
  ${panel('En çok işlenen konular', topTags(categoryBuckets, { maxRows: 6 }))}
</section>

<section style="margin-bottom:5mm">
  ${panel('Önem bandı dağılımı', stackedBand(byBand, { heightMm: 7 }),
    'Kritik ve yüksek bantlar birlikte gündemin omurgasını verir.')}
</section>

<section class="grid2" style="margin-bottom:4mm">
  ${panel('Günlük haber akışı', dailyBars(daily, { heightMm: 23 }),
    'Dönem içinde yayımlanan haber sayısı, gün gün.')}
  <div class="panel">
    <div class="panel-head">Tekilleştirme</div>
    <div style="display:flex;gap:6mm;align-items:flex-start">
      ${donut(dedupRatio, {
        label: 'Elenen tekrar',
        sublabel: `${trNumber(Number(stats.duplicates) || 0)} kayıt`,
        sizeMm: 21,
        accent: true,
      })}
      ${donut(onemliRatio, {
        label: 'Kritik + Yüksek',
        sublabel: `${trNumber(unique)} tekil haberin ${trNumber(onemli)} tanesi`,
        sizeMm: 21,
      })}
    </div>
    <p class="panel-note">Aynı olayı yazan haberler tek kümede toplanır
      (${trNumber(clusters)} küme). Elenen tekrar oranı ne kadar yüksekse
      o kadar çok kaynak aynı olayı yazmış demektir.</p>
  </div>
</section>

${colophon(`Bültene ${trNumber(articles.length)} haber seçildi. `
  + `Tekilleştirme oranı ${trPercent(dedupRatio)}. `
  + 'Önem skoru gizli bir metriktir; bültende yalnızca bant ve sıralama kullanılır.')}
`;

  // --- SAYFA 2+: bolgeye gore bolumler -----------------------------------
  //
  // TEK MULTICOL AKISI, bolum basina AYRI kolon blogu DEGIL.
  // Olculdu: her bolum kendi iki kolonlu blogunu actiginda Chromium her
  // blogun kolonlarini ayri ayri dengeliyor ve 6 bolgede 6 kez yarim
  // kolon bosluk kaliyor -> 6 sayfa. Basliklar `column-span: all` ile
  // TEK akisin icine girince ayni 40 kalem 4 sayfaya iniyor.
  // Bu yuzden basliklar ve kalemler KARDES: `.section-head` multicol
  // kabinin DOGRUDAN cocugu olmak zorunda, yoksa column-span calismaz.
  let rank = 1;
  const flow = sections.map((s) => {
    const head = sectionHead(s.label || REGION_LABELS[s.key] || s.key, s.items.length);
    const items = newsList(s.items, { startRank: rank, summaryMax: 150 });
    rank += s.items.length;
    // newsList'in sarmalayici <div class="items"> katmani burada
    // ISTENMIYOR: kalemler dogrudan kolon akisina girmeli.
    return head + items.replace(/^<div class="items">/, '').replace(/<\/div>$/, '');
  }).join('\n');
  const sectionHtml = `<div class="dump">${flow}</div>`;

  const body = `
<div class="page-break">${page1}</div>
<div>
  <div class="masthead-top" style="margin-bottom:5mm">
    <span class="wordmark">${'İSO · İSOV'}</span>
    <span class="kicker kicker-accent">HABER DÖKÜMÜ</span>
    <span class="kicker">${dateRange}</span>
  </div>
  ${sectionHtml || '<p class="empty">Bu dönemde bültene girecek haber bulunamadı.</p>'}
</div>
`;

  return htmlDocument({
    title: model.title || 'İSO/İSOV Haftalık Bülten',
    body,
  });
}

export default { renderHaftalik };
