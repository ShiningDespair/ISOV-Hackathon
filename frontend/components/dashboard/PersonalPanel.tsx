/**
 * BANA ÖZEL AKIŞ — pozisyona göre farklılaşan kişisel panel.
 *
 * Eskiden `/panelim` diye AYRI BİR SAYFAYDI. Kullanıcının isteği üzerine
 * bültenin içine taşındı: `/?akis=ozel`. Sayfa değil bileşen olmasının
 * nedeni bu — aynı `/` sayfası hem genel bülteni hem kişisel paneli
 * basıyor, aradaki geçiş `FeedSwitch` anahtarı.
 *
 * DÖRT DÜZEN, TEK EŞLEME NOKTASI: hangi düzenin gösterileceği
 * `/auth/me` yanıtındaki türetilmiş `layout` alanından gelir. Pozisyon ->
 * düzen eşlemesi BURADA TEKRARLANMAZ; `backend/src/lib/positions.js`
 * POSITION_LAYOUT tek doğruluk kaynağıdır. (`?duzen=` parametresi yalnızca
 * önizleme/doğrulama içindir, profili değiştirmez.)
 *
 * VAKİT BÜTÇESİ BAĞLAYICIDIR: kalem sayısı ve biçim DENSITY'den gelir
 * (2 dk -> 5 kalem tek cümle, 5 dk -> 12 kalem üç madde, 10 dk -> 20 kalem
 * kademeli). Özet düzeni ayrıca 5 kalemle sınırlı kalır, çünkü sözleşmesi
 * "kaydırma gerektirmesin".
 *
 * SIRALAMA İSTEMCİDE DEĞİŞTİRİLMEZ. API'den gelen dizi olduğu gibi basılır;
 * "son başvuru tarihli kalemler önce" gibi bölümleme yalnızca AYIRMA
 * (partition) yapar, her bölümün içinde API sırası korunur.
 *
 * GİZLİ METRİK: `importance_score` hiçbir yerde okunmaz, yalnızca
 * `importance_band` rozet olarak basılır.
 *
 * UÇLAR YOKSA (404/501/401): panel profil olmadan da açılır, `sort`
 * parametresi gönderilmez ve kullanıcıya "kişiselleştirme henüz etkin
 * değil" denir. Uç yokluğu (404/501) ile oturum yokluğu (401/403) AYRI
 * cümlelerle söylenir — `getPanelMe` bu ayrımı taşır. Sayfa ne çöker ne
 * de boş kalır.
 *
 * ÜST BÖLÜM BÜTÇESİ (docs/SADELESTIRME.md §6): ilk haber başlığı ilk
 * ekranda görünmek zorunda. Bu yüzden bu sürümde
 *   - KPI'lar SIKI kipte (tek satırlık şerit, notlar `title` niteliğinde),
 *   - başlık tek satır,
 *   - bilgi notlarının ikinciden sonrası `<details>` içinde katlı,
 *   - GRAFİK YOK. Günlük eğilim kıvılcım çizgisi ve operasyon düzeninin
 *     bölge/kategori çubukları `/istatistik`'e taşındı; burada yerlerine
 *     tek satırlık bir bağlantı duruyor. Grafik, haber başlığını ekranın
 *     dışına iten en pahalı öğeydi ve zaten bir istatistik sayfasının işi.
 *
 * İLK EKRAN (TUR 4, persona testi): akışın EN ÜSTÜNDE, dört görünümde de
 * aynı "Bugün Bilmeniz Gereken 3 Şey" bloğu (`BugununUcu`) durur; panel
 * başlığı, KPI şeridi ve kayan şerit onun ALTINA indi, bilgi notları tek
 * satıra katlandı, filtreler tek bir katlı "Filtrele ve ara"da. Ölçülen
 * hata ve piksel bütçesi: `BugununUcu.tsx` başı ve aşağıdaki render.
 *
 * GÖRÜNÜM YUVALARI: panelin KABUĞU (üç şey, başlık, KPI, şerit, bölümler)
 * yuvaların DIŞINDA bir kez basılır; yalnızca HABER AKIŞI dört yuvaya
 * ayrı ayrı basılır. Yani `akis` içeriği ve yoğunluğu seçer, `view`
 * sunumu seçer.
 */

import Link from "next/link";
import { cookies } from "next/headers";

import { getStatsOverview } from "@/lib/api";
import {
  densityOf,
  getPanelArticles,
  getPanelChanges,
  getPanelMe,
  isPanelLayout,
  normalizeTimeBudget,
  type PanelAuth,
  type PanelChanges,
  type PanelLayout,
  type PanelMe,
  type TimeBudget,
} from "@/lib/api-panel";
import { regionLabel, toBuckets } from "@/lib/format";
import type { Article, StatsOverview } from "@/lib/types";

import { DigestFront } from "@/components/DigestFront";
import type { FilterState } from "@/components/Filters";
import { DataUnavailable } from "@/components/States";
import { VisualFront } from "@/components/VisualFront";
import {
  DigestView,
  NewspaperView,
  PanelView,
  VisualView,
} from "@/components/ViewSlot";
import { ArticleFlow, type FlowStyle } from "@/components/dashboard/ArticleFlow";
import { CalendarList, type CalendarItem } from "@/components/dashboard/CalendarList";
import { ChangeFeed } from "@/components/dashboard/ChangeFeed";
import { HeadlineStrip } from "@/components/dashboard/HeadlineStrip";
import { KpiRow, type Kpi } from "@/components/dashboard/KpiRow";
import { BugununUcu, UCU_ADET } from "@/components/dashboard/BugununUcu";
import {
  LayoutPreview,
  PanoFiltrele,
  PanoHeader,
  PanoNotice,
  PanoNotices,
  PanoSection,
} from "@/components/dashboard/PanoParts";
import { TaskList, type TaskItem } from "@/components/dashboard/TaskList";
import { calendarHitOf, deadlineOf } from "@/components/dashboard/deadline";

/** Profil gelmezse gösterilecek düzen. Eşleme DEĞİL, yalnızca varsayılan. */
const DEFAULT_LAYOUT: PanelLayout = "ozet";

/** Özet düzeninin üst sınırı — tek ekranda bitmesi için. */
const OZET_MAX_ITEMS = 5;

/** Şeritte gösterilecek başlık sayısı. */
const STRIP_MAX = 8;

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Geçerli vakit bütçesi — `?vakit=` varsa o, yoksa profildeki değer,
 * o da yoksa 5 dakika.
 *
 * DIŞA AÇIK olmasının nedeni: sayfanın en altındaki `TimeBudgetSwitch`
 * hangi kademenin etkin olduğunu göstermek zorunda ve o hesabı ikinci kez
 * yazmak iki yerin birbirinden kayması demekti (aynı hata düzen
 * eşlemesinde bir kez yapıldı). Tek fonksiyon, iki çağıran.
 */
export function effectiveTimeBudget(
  params: Record<string, string | string[] | undefined>,
  me: PanelMe | null,
): TimeBudget {
  const override = firstParam(params.vakit);
  if (override !== undefined) return normalizeTimeBudget(override);
  return me?.timeBudget ?? 5;
}

/** Sunucu bileşeninde `Cookie` başlığını elle taşır. */
export async function panelAuthFromCookies(): Promise<PanelAuth> {
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  return cookieHeader ? { cookie: cookieHeader } : {};
}

/** Kova listesinden tek anahtarın sayısını okur; yoksa null (KPI'da "—"). */
function bucketCount(
  buckets: { key: string; count: number }[],
  key: string,
): number | null {
  const found = buckets.find((b) => b.key === key);
  return found ? found.count : null;
}

/** Birden çok sayıyı toplar; hepsi null ise null döner (sıfır uydurmaz). */
function sumOrNull(values: (number | null)[]): number | null {
  const real = values.filter((v): v is number => typeof v === "number");
  return real.length === 0 ? null : real.reduce((a, b) => a + b, 0);
}

/**
 * Kategori bazlı gerçek toplam — listenin `total` alanından okunur.
 * Panelde gösterilen örneklem üzerinden saymak yanıltıcı olurdu; bu
 * yüzden sayım backend'e bırakılıyor (limit=1, yalnızca toplam gerekiyor).
 */
async function countByCategory(
  category: string,
  auth: PanelAuth,
): Promise<number | null> {
  const res = await getPanelArticles({ category, limit: 1 }, auth);
  if (!res.ok) return null;
  return typeof res.data.total === "number" ? res.data.total : null;
}

/** Tekil (tekilleştirilmiş) haber sayısı. */
function uniqueArticleCount(stats: StatsOverview | null): number | null {
  if (!stats) return null;
  const totals = stats.totals ?? null;
  const candidates = [
    totals?.unique_articles,
    stats.unique_articles,
    totals?.articles,
    stats.total_articles,
  ];
  for (const value of candidates) {
    if (typeof value === "number" && !Number.isNaN(value)) return value;
  }
  const regions = toBuckets(stats.by_region, regionLabel);
  return regions.length > 0 ? regions.reduce((s, r) => s + r.count, 0) : null;
}

function sourceCount(stats: StatsOverview | null): number | null {
  const value = stats?.totals?.sources ?? stats?.total_sources;
  return typeof value === "number" ? value : null;
}

/* ------------------------------------------------------------------ */
/* Bileşen                                                             */
/* ------------------------------------------------------------------ */

export async function PersonalPanel({
  params,
  me: meGiven,
  auth: authGiven,
}: {
  /** `/` sayfasının çözülmüş `searchParams`'ı. */
  params: Record<string, string | string[] | undefined>;
  /**
   * `/auth/me` sonucu — `/` sayfası varsayılan akışa karar verirken bunu
   * zaten okumak zorunda. İkinci kez istemek boş bir tur olurdu, bu yüzden
   * çağıran elindekini geçirebilir.
   */
  me?: PanelMe;
  auth?: PanelAuth;
}) {
  const auth = authGiven ?? (await panelAuthFromCookies());

  const [me, statsRes] = await Promise.all([
    meGiven ? Promise.resolve(meGiven) : getPanelMe(auth),
    getStatsOverview(),
  ]);

  const stats: StatsOverview | null = statsRes.ok ? statsRes.data : null;

  // --- Düzen ve vakit bütçesi ------------------------------------
  const layoutOverride = firstParam(params.duzen);
  const previewing = isPanelLayout(layoutOverride);
  const layout: PanelLayout = previewing
    ? (layoutOverride as PanelLayout)
    : (me.layout ?? DEFAULT_LAYOUT);

  const timeBudget: TimeBudget = effectiveTimeBudget(params, me);

  /**
   * Kullanıcının seçtiği FİLTRELER — kişisel sıralamaya UYGULANIR.
   *
   * ÖLÇÜLEN HATA (üç ayrı persona testi): Bana Özel akışında bölge ya da
   * etiket seçmek hiçbir şeyi değiştirmiyordu. URL doğru oluşuyordu
   * (`?akis=ozel&region=AMERIKA`), ama bu bileşen parametreleri hiç
   * okumuyordu ve liste aynı kalıyordu. /istatistik'teki etiket
   * bağlantıları da (`/?tag=cbam`) profili olan kullanıcıda varsayılan
   * akış Bana Özel olduğu için sessizce yok sayılıyordu: CBAM'ı ilgi
   * alanına eklemiş genel müdür CBAM etiketine basıp alakasız 5 haber
   * görüyordu. Backend `sort=kisisel` ile filtreleri birlikte zaten
   * destekliyor (ölçüldü: tag=cbam → 3, region=AMERIKA → 10); eksik olan
   * yalnızca buradaki aktarımdı.
   *
   * Şerit ("En Önemli Konular") bilinçli olarak filtrelenmez: korpus
   * genelindeki kritik gündem, seçilen dilimden bağımsız.
   */
  const filtreler: FilterState = {};
  for (const key of ["region", "band", "tag", "q", "category", "source"] as const) {
    const v = firstParam(params[key]);
    if (v && v.trim() !== "") filtreler[key] = v.trim();
  }
  const filtreSayisi = Object.keys(filtreler).length;

  /**
   * Gorsel ve kart gorunumlerine gecen GEZINTI durumu.
   *
   * Bu iki bilesen kendi bolge ciplerini basiyor ve baglantilari
   * `Filters.withParam` ile uretiyor; o da yalnizca kendisine VERILEN
   * alanlari yeni URL'ye tasiyor. `akis` burada durmazsa kisisel akista
   * bolge cipine basan kullanici genel bultene dusuyor. Filtre DEGIL,
   * bu yuzden API sorgusuna girmiyor - yalnizca baglanti uretimine.
   */
  const gezintiDurumu: FilterState = {
    akis: "ozel",
    ...(firstParam(params.vakit) !== undefined
      ? { vakit: String(timeBudget) }
      : {}),
    ...filtreler,
  };

  const density = densityOf(timeBudget);
  const itemCount =
    layout === "ozet" ? Math.min(density.items, OZET_MAX_ITEMS) : density.items;

  // --- Haberler ---------------------------------------------------
  const wantsPersonal = me.status === "etkin";
  let listRes = await getPanelArticles(
    { ...filtreler, limit: itemCount, sort: wantsPersonal ? "kisisel" : undefined },
    auth,
  );
  let personalized = wantsPersonal && listRes.ok;
  let fallbackNote: string | null = null;

  if (!listRes.ok && wantsPersonal) {
    // Kişisel sıralama reddedildi (ör. oturum düştü) — genel sıralamaya düş.
    listRes = await getPanelArticles({ ...filtreler, limit: itemCount }, auth);
    personalized = false;
    fallbackNote =
      "Kişisel sıralama uygulanamadı, genel önem sıralaması gösteriliyor.";
  }

  const articles: Article[] = listRes.ok ? listRes.data.data : [];

  // --- "Bugün Bilmeniz Gereken 3 Şey" ------------------------------
  // API'nin kişisel sırasının İLK ÜÇÜ — dilimleme, sıralama değil.
  const ustUc: Article[] = listRes.ok ? articles.slice(0, UCU_ADET) : [];
  const ustIds = new Set(ustUc.map((a) => a.id));

  // Şerit ayrı bir sorgudan beslenir: en önemli konular = KRİTİK bant.
  // API sırası korunur; 6 başlık dolmazsa ana listeden tamamlanır.
  // Üç şeyde duran haberler şeride ALINMAZ (`seen` onlarla başlar):
  // ölçüldü, Emre'nin panelinde OVP haberi hem 1. kalemde hem şeridin
  // başındaydı — ilk iki ekranda aynı başlık iki kez.
  const stripRes = await getPanelArticles(
    { band: "KRITIK", limit: STRIP_MAX },
    auth,
  );
  const strip: Article[] = [];
  const seen = new Set<number>(ustIds);
  for (const a of stripRes.ok ? stripRes.data.data : []) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    strip.push(a);
  }
  for (const a of articles) {
    if (strip.length >= STRIP_MAX) break;
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    strip.push(a);
  }

  // --- Tarih çıkarımı (aksiyon ve takip) --------------------------
  const now = new Date();
  const tasks: TaskItem[] = [];
  const calendar: CalendarItem[] = [];
  const dated = new Set<number>();

  if (layout === "aksiyon") {
    for (const article of articles) {
      const hit = deadlineOf(article, now);
      if (hit) {
        tasks.push({ article, hit });
        dated.add(article.id);
      }
    }
  } else if (layout === "takip") {
    for (const article of articles) {
      const hit = calendarHitOf(article, now);
      if (hit) {
        calendar.push({ article, hit });
        dated.add(article.id);
      }
    }
  }

  // Üç şey aşağıda (yapılacaklar, takvim, akış) TEKRAR BASILMAZ; ama
  // KPI sayıları (`tasks`, `calendar`) tüm liste üzerinden kalır, çünkü
  // "Son Tarihli Kalem: 3" sayısı haberin hangi bölümde durduğundan
  // bağımsız bir gerçek.
  const tasksShown = tasks.filter((t) => !ustIds.has(t.article.id));
  const calendarShown = calendar.filter((c) => !ustIds.has(c.article.id));

  // Ayırma: üç şey en üstte, tarihli kalemler kendi bölümünde, kalanlar
  // akışta. Her bölümün İÇİNDE API sırası korunuyor.
  const flowArticles = articles.filter(
    (a) => !dated.has(a.id) && !ustIds.has(a.id),
  );

  // Kart görünümünün sıra numarası API dizisindeki YER (1 tabanlı) — akış
  // üç şeyden ve tarihli kalemlerden sonra başladığı için "01" yanlış olurdu.
  const apiSirasi: Record<number, number> = {};
  articles.forEach((a, i) => {
    apiSirasi[a.id] = i + 1;
  });

  // --- Değişiklik akışı (yalnızca takip düzeni ister) -------------
  const changes: PanelChanges =
    layout === "takip"
      ? await getPanelChanges(auth, 8)
      : { available: false, items: [], note: null };

  // --- İstatistik kovaları ---------------------------------------
  // Yalnızca KPI'lar için gereken kovalar okunuyor. Bölge/kategori
  // dağılımı ARTIK BURADA HESAPLANMIYOR: çubuk grafikler `/istatistik`'e
  // taşındı (bkz. dosya başı, üst bölüm bütçesi).
  const bands = toBuckets(stats?.by_band);

  const hasArticles = articles.length > 0;
  const unique = uniqueArticleCount(stats);
  const kritik = bucketCount(bands, "KRITIK");

  // --- KPI'lar: her düzende FARKLI küme --------------------------
  let kpis: Kpi[] = [];

  if (layout === "ozet") {
    // EN SADE: üç gösterge. Sayı yoksa "—".
    kpis = [
      {
        label: "Gündemdeki Haber",
        value: unique,
        note: "Tekilleştirme sonrası tekil kayıt",
      },
      {
        label: "Kritik Başlık",
        value: kritik,
        note: "En yüksek önem bandı",
      },
      {
        label: "İzlenen Kaynak",
        value: sourceCount(stats),
        note: "Taranan açık kaynak",
      },
    ];
  } else if (layout === "aksiyon") {
    const yakin = tasks.filter(
      (t) => t.hit.days >= 0 && t.hit.days <= 7,
    ).length;
    const acik = tasks.filter((t) => t.hit.days >= 0).length;
    const [tesvik, finansman, arge] = await Promise.all([
      countByCategory("tesvik", auth),
      countByCategory("finansman", auth),
      countByCategory("ar-ge", auth),
    ]);
    kpis = [
      {
        // Haber listesi hiç gelmediyse "0" yazmak veri varmış gibi
        // görünür; o durumda "—" doğrusu.
        label: "Son Tarihli Kalem",
        value: hasArticles ? tasks.length : null,
        note: "Panelinizde tarih çıkarılabilen kalem",
      },
      {
        label: "Süresi Açık",
        value: hasArticles ? acik : null,
        note: "Son başvuru tarihi gelmemiş kalem",
      },
      {
        label: "Bu Hafta Biten",
        value: hasArticles ? yakin : null,
        note: "Yedi gün içinde kapanan başvuru",
      },
      {
        label: "Teşvik ve Finansman",
        value: sumOrNull([tesvik, finansman, arge]),
        note: "Teşvik, finansman ve Ar-Ge kategorisi toplamı",
      },
    ];
  } else if (layout === "operasyon") {
    const [tedarik, lojistik, enerji, emtia, sanayi] = await Promise.all([
      countByCategory("tedarik-zinciri", auth),
      countByCategory("lojistik", auth),
      countByCategory("enerji", auth),
      countByCategory("emtia", auth),
      countByCategory("sanayi", auth),
    ]);
    kpis = [
      {
        label: "Tedarik ve Lojistik",
        value: sumOrNull([tedarik, lojistik]),
        note: "Tedarik zinciri ve lojistik kategorisi",
      },
      {
        label: "Enerji ve Emtia",
        value: sumOrNull([enerji, emtia]),
        note: "Maliyet kalemlerini besleyen kategoriler",
      },
      {
        label: "Sanayi Üretimi",
        value: sanayi,
        note: "Üretim ve kapasite haberleri",
      },
      {
        label: "Gündemdeki Haber",
        value: unique,
        note: "Tekilleştirme sonrası tekil kayıt",
      },
    ];
  } else {
    const [mevzuat, vergi] = await Promise.all([
      countByCategory("mevzuat", auth),
      countByCategory("vergi", auth),
    ]);
    kpis = [
      {
        label: "Mevzuat Kalemi",
        value: mevzuat,
        note: "Mevzuat kategorisindeki haber",
      },
      {
        label: "Vergi Kalemi",
        value: vergi,
        note: "Vergi kategorisindeki haber",
      },
      {
        label: "Takvimdeki Tarih",
        value: hasArticles ? calendar.length : null,
        note: "Panelinizde tarih çıkarılabilen kalem",
      },
      {
        label: "Değişiklik",
        // Uç yayında değilse SIFIR yazılmaz, "—" görünür.
        value: changes.available ? changes.items.length : null,
        note: changes.available
          ? "Son ziyaretten beri kayda geçen değişiklik"
          : "Değişiklik ucu henüz yayında değil",
      },
    ];
  }

  const flowStyle: FlowStyle =
    layout === "ozet" ? "tek-cumle" : (density.style as FlowStyle);

  const notices: string[] = [];
  if (me.note) notices.push(me.note);
  if (fallbackNote) notices.push(fallbackNote);
  if (layout === "ozet" && density.items > OZET_MAX_ITEMS) {
    notices.push(
      `Özet düzeni tek ekranda bitsin diye ${OZET_MAX_ITEMS} kalemle sınırlı. ${timeBudget} dakikalık bütçenin kalan ${density.items - OZET_MAX_ITEMS} kalemi, sayfa altındaki "Genel" akışta duruyor.`,
    );
  }
  if (previewing) {
    notices.push(
      "Bu bir düzen önizlemesi. Gerçek düzen profilinizdeki pozisyondan türetilir; önizleme profilinizi değiştirmez.",
    );
  }

  // Başlık, `full` sayısını DENSITY'den okur — elle yazılan "ilk 10" bir
  // kez yanlış kaldı (kademe 20 kaleme inince metin güncellenmemişti).
  const flowTitle =
    flowStyle === "tek-cumle"
      ? "Haber Akışı — Tek Cümle"
      : flowStyle === "kademeli"
        ? `Haber Akışı — İlk ${density.full} Tam Özet`
        : `Haber Akışı — ${density.bullets} Madde`;

  const listBroken = !listRes.ok;
  // `listRes` bir `let` olduğu için daraltma (narrowing) aşağıda kayboluyor;
  // hata metni burada sabitleniyor.
  const listError = listRes.ok ? null : listRes.error;

  const flowRight =
    flowArticles.length > 0 ? `${flowArticles.length} kalem` : undefined;

  /**
   * Akışın gövdesi — dört yuvanın panel/gazete ikilisinde AYNI öğe basılır.
   * Kâğıtta ayrı bir mizanpaj yapılmıyor: vakit bütçesi yoğunluğu zaten
   * kâğıda uygun hale getiriyor, ikinci bir mizanpaj kapsamı şişirirdi.
   */
  const flowBody = listBroken ? (
    <DataUnavailable
      message={listError ?? "Veri kaynağına ulaşılamadı."}
      hint="Göstergeler ve şerit varsa gösterilmeye devam ediyor. Haber akışı, toplama servisi yanıt verdiğinde dolacak."
    />
  ) : flowArticles.length > 0 ? (
    <ArticleFlow
      articles={flowArticles}
      style={flowStyle}
      full={density.full}
      bullets={density.bullets || 3}
    />
  ) : (
    <PanoNotice>
      Bu düzende akışa düşen kalem kalmadı; hepsi yukarıdaki bölümlerde
      listelendi.
    </PanoNotice>
  );

  // Görsel/Kart görünümleri boş diziyle çağrılırsa "haber bulunamadı"
  // boş durumunu basıyor — üç haber hemen yukarıdayken yanlış bir cümle.
  // Akışa kalem düşmediyse dört görünümde de aynı dürüst not basılır.
  const akisBos = !listBroken && flowArticles.length === 0;

  return (
    <div className="pano-page akis-ozel">
      {/* ---- İLK EKRAN BÜTÇESİ (mobil 390×844) ----
          Ölçülen hata: Bana Özel'de ilk gerçek haber y=813–872'deydi, yani
          ilk ekranda SIFIR haber. Şimdiki sıra ve ölçülen yükseklikler
          (yerel kopya, emre.tunc; masthead + akış anahtarı 0–251):
            1. Bugün Bilmeniz Gereken 3 Şey ... 251–919 → başlıklar
               y = 292 / 500 / 703, ilk ekranda 3 başlık
            2. Filtrele ve ara (kapalı) ....... ~56 px   (ilk ekranın altı)
            3. Notlar (tek satır, katlı) ...... ~44 px   (not varsa)
            4. Panel başlığı .................. ~82 px
            5. KPI şeridi (sıkı) .............. ~70 px
            6. Kayan şerit .................... ~70 px
            7. Yapılacaklar / takvim, görünüm akışı
          Kalem başına bütçe ve en kötü durum `BugununUcu.tsx` başında.
          1'den sonrası ilk ekranda OLMAK ZORUNDA DEĞİL; hedef "kaydırmadan
          en az 3 gerçek haber başlığı, ilki y < 400". */}
      {listBroken ? null : (
        <BugununUcu
          articles={ustUc}
          profil={{
            interestTagSlugs: me.interestTagSlugs,
            regionFocus: me.regionFocus,
          }}
          personalized={personalized}
        />
      )}

      {/* Tek filtre yeri — dört görünümde de aynı, katlı. Görsel ve Kart
          görünümlerinin kendi şeritleri kişisel akışta kapalı
          (`filtreSeridi={false}`). Etkin filtre çipleri katlanmaz. */}
      <PanoFiltrele
        state={gezintiDurumu}
        etkinSayi={filtreSayisi}
      />

      <PanoNotices notices={notices} warnFirst={Boolean(me.note)} tekSatir />

      <PanoHeader
        layout={layout}
        positionLabel={me.positionLabel}
        fullName={me.fullName}
        timeBudget={timeBudget}
        itemCount={articles.length}
        personalized={personalized}
      />

      {/* -------- Göstergeler: SIKI kip, tek satır --------
          Üç şeyin ALTINDA: sayı, haberin kendisinden önce gelmemeli. */}
      <section className="pano-bolum akis-bolum-sik" data-pano-bolum="kpi">
        <KpiRow items={kpis} sik />
      </section>

      {/* -------- Önemli konular şeridi --------
          Korpus genelindeki KRİTİK gündem. Eskiden ilk ekrandaki TEK haber
          metniydi ve "…" ile kesikti; artık ilk ekranı üç şey dolduruyor,
          şerit onların altında. */}
      {strip.length > 0 ? (
        <HeadlineStrip articles={strip} label="En Önemli Konular" />
      ) : null}

      {/* -------- Aksiyon: yapılacaklar -------- */}
      {layout === "aksiyon" ? (
        <PanoSection
          id="yapilacaklar"
          title="Yapılacaklar — Son Başvuru Tarihli Kalemler"
          right={tasksShown.length > 0 ? `${tasksShown.length} kalem` : undefined}
        >
          {tasksShown.length > 0 ? (
            <TaskList items={tasksShown} />
          ) : tasks.length > 0 ? (
            <PanoNotice>
              Son başvuru tarihli kalemlerin hepsi yukarıdaki &quot;Bugün
              Bilmeniz Gereken&quot; bloğunda.
            </PanoNotice>
          ) : (
            <PanoNotice>
              Panelinizdeki kalemlerde son başvuru tarihi çıkarılamadı. Tarih
              uydurulmaz; bu kalemler aşağıdaki haber akışında duruyor.
            </PanoNotice>
          )}
        </PanoSection>
      ) : null}

      {/* -------- Takip: mevzuat takvimi -------- */}
      {layout === "takip" ? (
        <PanoSection
          id="takvim"
          title="Mevzuat Takvimi"
          right={calendarShown.length > 0 ? `${calendarShown.length} tarih` : undefined}
        >
          {calendarShown.length > 0 ? (
            <CalendarList items={calendarShown} />
          ) : calendar.length > 0 ? (
            <PanoNotice>
              Takvim tarihli kalemlerin hepsi yukarıdaki &quot;Bugün Bilmeniz
              Gereken&quot; bloğunda.
            </PanoNotice>
          ) : (
            <PanoNotice>
              Panelinizdeki kalemlerde takvim tarihi çıkarılamadı. Tarih
              uydurulmaz; kalemler haber akışında duruyor.
            </PanoNotice>
          )}
        </PanoSection>
      ) : null}

      {/* -------- Haber akışı: dört görünüm yuvası --------
          Kabuk yukarıda bir kez basıldı; burada YALNIZCA akış dört kez
          basılıyor. Bölüm `id`'leri yuva başına farklı, çünkü dördü de
          aynı anda DOM'da ve `id` tekil olmak zorunda. */}
      <PanelView>
        <PanoSection id="akis-panel" title={flowTitle} right={flowRight}>
          {flowBody}
        </PanoSection>
      </PanelView>

      <NewspaperView>
        <PanoSection id="akis-gazete" title={flowTitle} right={flowRight}>
          {flowBody}
        </PanoSection>
      </NewspaperView>

      {/* Görsel ve kart görünümleri kendi mizanpajlarını basar; yalnızca
          kişisel listeyle çağrılıyorlar.
          `total` olarak korpus toplamı DEĞİL gösterilen kalem sayısı
          geçiliyor: kişisel panel bilinçli olarak kısa bir liste, "1.243
          haber" yazmak yanlış olurdu.
          `state` GEZİNTİ parametrelerini (akis/vakit) ve filtreleri
          taşıyor. İki bileşenin kendi filtre şeritleri ve Kart'ın
          "Bugünün Özeti" başlık bloğu kişisel akışta KAPALI
          (`filtreSeridi={false}`, `baslikBlogu={false}`): tek filtre
          yeri kabuktaki "Filtrele ve ara", sayfanın başı "Bugün Bilmeniz
          Gereken 3 Şey". Görsel'in ilk bölümü "Günün Manşeti" değil
          "Akışın Devamı" — manşet sayılacak üç haber zaten yukarıda.
          `baslikDuzeyi={2}` ve `sayiSeridi={false}`: kabuk zaten sayfanın
          tek `h1`ini ve sıkı KPI şeridini basıyor. */}
      <VisualView>
        {akisBos || listBroken ? (
          <PanoSection id="akis-gorsel" title={flowTitle}>
            {flowBody}
          </PanoSection>
        ) : (
          <VisualFront
            articles={flowArticles}
            total={flowArticles.length}
            state={gezintiDurumu}
            baslikDuzeyi={2}
            filtreSeridi={false}
            mansetBasligi="Akışın Devamı"
          />
        )}
      </VisualView>

      <DigestView>
        {akisBos || listBroken ? (
          <PanoSection id="akis-kart" title={flowTitle}>
            {flowBody}
          </PanoSection>
        ) : (
          <DigestFront
            articles={flowArticles}
            total={flowArticles.length}
            state={gezintiDurumu}
            sayiSeridi={false}
            baslikBlogu={false}
            filtreSeridi={false}
            siraNo={apiSirasi}
          />
        )}
      </DigestView>

      {/* -------- Takip: değişiklik akışı (akıştan SONRA) --------
          Değişiklik akışı bir denetim kaydı, günün haberi değil. Haberin
          önünde durunca kullanıcı başlığa ulaşmak için kaydırmak
          zorundaydı. */}
      {layout === "takip" ? (
        <PanoSection
          id="degisiklik"
          title="Değişiklik Akışı"
          right={changes.available ? `${changes.items.length} kayıt` : undefined}
        >
          <ChangeFeed changes={changes} />
        </PanoSection>
      ) : null}

      {/* -------- Operasyon: dağılım grafikleri /istatistik'te -------- */}
      {layout === "operasyon" ? (
        <PanoSection id="dagilim" title="Bölge ve Kategori Dağılımı">
          <p className="u-body u-body-soft text-[0.9rem] leading-snug">
            Çubuk grafikler istatistik sayfasına taşındı; panel haberle
            başlasın diye burada yalnızca bağlantı duruyor.{" "}
            <Link href="/istatistik" className="u-link-underline">
              İstatistik →
            </Link>
          </p>
        </PanoSection>
      ) : null}

      <footer className="pano-alt">
        <Link
          href="/?akis=genel"
          className="u-kicker u-link-underline text-ink"
        >
          Genel Bülten →
        </Link>
        <LayoutPreview active={layout} timeBudget={timeBudget} />
      </footer>
    </div>
  );
}
