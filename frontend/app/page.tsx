/**
 * ANA SAYFA — bülten. TEK sayfa, İKİ akış, DÖRT görünüm.
 *
 * AKIŞ (`?akis=`) İÇERİĞİ ve YOĞUNLUĞU seçer:
 *   ozel  — kişisel panel (eski `/panelim`): pozisyondan türeyen düzen,
 *           vakit bütçesine göre kalem sayısı. `PersonalPanel` basar.
 *   genel — herkes için aynı bülten, genel önem sıralaması.
 *
 * GÖRÜNÜM (`?view` / görünüm anahtarı) SUNUMU seçer ve her iki akışta da
 * çalışır: panel gridi, basılı gazete, görsel bülten, kart özeti.
 * Görünürlüğü `globals.css` içindeki `html[data-view] [data-view-slot]`
 * kuralları belirler; dördü de DOM'a basılır, böylece ilk boyamada doğru
 * mizanpaj görünür ve hidrasyon sıçraması olmaz.
 *
 * Bu ikisinin BAĞIMSIZ olması bilinçli: "üst yönetici -> görsel, normal
 * kullanıcı -> kart" varsayılanı (docs/SADELESTIRME.md §3) kişisel akışta
 * da geçerli olsun diye.
 *
 * ÜST BÖLÜM BÜTÇESİ (§6): ilk haber başlığı ilk ekranda görünmek zorunda.
 * Bu yüzden akış anahtarı tek satır, KPI'lar sıkı şerit ve grafikler
 * `/istatistik`'te.
 */

import { Suspense } from "react";
import Link from "next/link";

import { getArticles, getTags } from "@/lib/api";
import {
  densityOf,
  getPanelMe,
  type PanelMe,
  type TimeBudget,
} from "@/lib/api-panel";
import { formatNumber } from "@/lib/format";
import type { Article } from "@/lib/types";

import {
  ActiveFilters,
  BandFilter,
  RegionTabs,
  SearchBox,
  type FilterState,
} from "@/components/Filters";
import {
  CompactArticle,
  LeadArticle,
  StandardArticle,
} from "@/components/ArticleCard";
import {
  FeedSwitch,
  normalizeFeedMode,
  type FeedMode,
} from "@/components/FeedSwitch";
import { TimeBudgetSwitch } from "@/components/TimeBudgetSwitch";
import { NewspaperFront } from "@/components/NewspaperFront";
import { VisualFront } from "@/components/VisualFront";
import { DataUnavailable, EmptyState, SectionRule } from "@/components/States";
import { NewspaperView, PanelView, VisualView } from "@/components/ViewSlot";
import { DigestView } from "@/components/ViewSlot";
import { DigestFront } from "@/components/DigestFront";
import {
  PersonalPanel,
  effectiveTimeBudget,
  panelAuthFromCookies,
} from "@/components/dashboard/PersonalPanel";

// Demo: veri daima taze, derleme sırasında backend'e istek atılmaz.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** searchParams değerini tek bir string'e indirger. */
function one(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value && value.trim() !== "" ? value : undefined;
}

/** Sağ kolondaki etiket bulutunda gösterilecek etiket sayısı. */
const TAG_CLOUD_MAX = 10;

/**
 * Genel akışta vakit bütçesinin liste uzunluğuna ÇARPANI.
 *
 * Neden 3 ve neden bir çarpan: genel bülten bir gazete sayfası, kişisel
 * panel bir okuma listesi. Gazetede manşet + iki kolon + "Bültenin Devamı"
 * var; 5 dakikalık bütçenin 12 kalemini birebir uygularsak manşetten sonra
 * 11 haber kalıyor, üç kolonlu mizanpaj boşalıyor ve sayfa gazete gibi
 * görünmeyi bırakıyor. Üç katı (36 kalem) kolonları dolduruyor ama 60'lık
 * eski listeden belirgin biçimde kısa. Alt sınır 20: 2 dakikalık bütçede
 * bile mizanpaj çökmesin.
 */
const GENEL_CARPAN = 3;
const GENEL_MIN = 20;

/** `?vakit=` verilmemişse genel akışın eski (regresyonsuz) uzunluğu. */
const GENEL_VARSAYILAN_LIMIT = 60;

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;

  // --- Hangi akış? -------------------------------------------------
  // `?akis=` açıkça verilmişse o kazanır. Verilmemişse varsayılan
  // PROFİLDEN gelir: kişiselleştirme etkin VE sunucu bir `layout`
  // döndürdüyse kullanıcının doğru yeri kişisel panel; aksi halde (oturum
  // yok, uç yok, düzen gelmedi) genel bülten. Oturumu olmayan ziyaretçiye
  // "kişiselleştirme uygulanmıyor" notlu bir panel açmak, sayfayı bir
  // özür metniyle karşılamak olurdu.
  const akisParam = normalizeFeedMode(one(sp.akis));

  // `genel` açıkça istendiyse profili hiç sormuyoruz — gereksiz bir tur.
  const profilGerekli = akisParam !== "genel";
  const auth = profilGerekli ? await panelAuthFromCookies() : {};
  const me: PanelMe | null = profilGerekli ? await getPanelMe(auth) : null;

  const akis: FeedMode =
    akisParam ??
    (me && me.status === "etkin" && me.layout !== null ? "ozel" : "genel");

  // Oturum yokken "Bana Özel" seçilirse YÖNLENDİRME YAPILMAZ: panel kendi
  // dürüst notunu ("oturum açılmadığı için kişiselleştirme uygulanmıyor")
  // gösterir. Anahtarın altına yalnızca küçük bir giriş bağlantısı düşer.
  const girisGoster = me?.status === "oturum-yok";

  const anahtar = (
    <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6">
      <FeedSwitch params={sp} active={akis} showLogin={girisGoster} />
    </div>
  );

  /* ================================================================
     BANA ÖZEL AKIŞ
     Kabuk (başlık, sıkı KPI şeridi, şerit, bölümler) bir kez; haber akışı
     dört görünüm yuvasına. Hepsi `PersonalPanel` içinde.
     ================================================================ */
  if (akis === "ozel") {
    const vakit = effectiveTimeBudget(sp, me);
    return (
      <>
        {anahtar}
        {/* Sayfanın TEK `h1`i — görünüm yuvalarının DIŞINDA, yani dört
            görünümde de aynı. `PanoHeader` bu yüzden `h2` basıyor: iki
            `h1` ana yer işareti sırasını bozar.
            `VisualFront` de kendi ekran-okuyucu başlığını basıyordu;
            artık `baslikDuzeyi` prop'u alıyor ve kişisel akışta `h2`
            basıyor. Genel akışta 1 kalıyor, çünkü orada panel yuvası
            `display:none` olduğu için içindeki `h1` yardımcı teknolojiye
            hiç ulaşmıyor — sayfa başsız kalmasın. */}
        <h1 className="sr-only-custom">
          İSO · İSOV Dış Kaynak İzleme Bülteni — Bana Özel
        </h1>
        <PersonalPanel params={sp} me={me ?? undefined} auth={auth} />
        <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6">
          <TimeBudgetSwitch params={sp} active={vakit} feed="ozel" />
        </div>
      </>
    );
  }

  /* ================================================================
     GENEL AKIŞ — bugünkü bülten davranışı korunur.
     ================================================================ */
  const state: FilterState = {
    region: one(sp.region),
    band: one(sp.band),
    tag: one(sp.tag),
    q: one(sp.q),
    category: one(sp.category),
    source: one(sp.source),
  };

  // Vakit bütçesi genel akışta da BİR ŞEY YAPAR: liste uzunluğunu sınırlar.
  // Ama yalnızca kullanıcı bir kademe seçtiyse — `?vakit=` yoksa eski 60'lık
  // liste aynen basılır (regresyon olmasın).
  const vakitParam = one(sp.vakit);
  const genelVakit: TimeBudget | null =
    vakitParam !== undefined ? effectiveTimeBudget(sp, me) : null;
  const limit =
    genelVakit === null
      ? GENEL_VARSAYILAN_LIMIT
      : Math.max(GENEL_MIN, densityOf(genelVakit).items * GENEL_CARPAN);

  /**
   * Filtre baglantilarina gecen durum = filtreler + GEZINTI parametreleri.
   *
   * `Filters.withParam` yalnizca kendisine VERILEN alanlari yeni URL'ye
   * tasiyor. `akis`/`vakit` burada durmazsa bolge cipine basan kullanici
   * secimini kaybediyor - acikca "genel" demis biri varsayilana, 2 dakika
   * secmis biri 60'lik listeye donuyordu.
   *
   * API sorgusu TEMIZ `state` ile yapiliyor (yukarida): bunlar birer
   * arayuz parametresi, `/articles` bunlari tanimiyor.
   *
   * Varsayilan durumda alan HIC EKLENMIYOR, boylece adres cubugu sade
   * kaliyor ve bugunku baglantilar birebir ayni uretiliyor (regresyon yok).
   */
  const gezinti: FilterState = {
    ...state,
    ...(akisParam ? { akis: akisParam } : {}),
    ...(vakitParam !== undefined ? { vakit: vakitParam } : {}),
  };

  // Paralel veri çekimi — hiçbiri fırlatmaz, hata ApiResult içinde döner.
  //
  // `/stats/overview` ARTIK ÇEKİLMİYOR: tek tüketicisi sağ kolondaki
  // "Bölge Dağılımı" çubuk grafiğiydi ve o grafik `/istatistik`'e taşındı
  // (§6). Künye sayıları listenin kendisinden hesaplanıyor. Kullanılmayan
  // bir istek, sunucu render süresine boşuna binen bir ağ turudur.
  const [articlesRes, tagsRes] = await Promise.all([
    getArticles({ ...state, limit }),
    getTags(),
  ]);

  const vakitAnahtari = (
    <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6">
      <TimeBudgetSwitch params={sp} active={genelVakit} feed="genel" />
    </div>
  );

  // Backend tamamen erişilemezse temiz hata durumu göster.
  if (!articlesRes.ok) {
    return (
      <>
        {anahtar}
        <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6">
          <DataUnavailable message={articlesRes.error} />
        </div>
        {vakitAnahtari}
      </>
    );
  }

  // Backend zaten gizli onem skoruna gore siralayip donuyor (importance_score
  // DESC, published_at DESC). Burada YENIDEN SIRALAMIYORUZ: istemci skoru
  // goremedigi icin elindeki en ince olcut band; band+tarihe gore sirlamak
  // skor siralamasini yok ediyordu. Somut sonuc: manset, en yuksek skorlu
  // haber (AB'nin Turkiye mensei celige anti-damping kaydi, 84,9) yerine
  // ayni bandin en yeni tarihlisi (Butce Cagrisi, 78,2) oluyordu - yani
  // gizli metrigin tum amaci kayboluyordu. API sirasi korunur.
  const all = articlesRes.data.data;
  const total = articlesRes.data.total || all.length;

  // --- KOLON DENGELEME ------------------------------------------------
  // Kesismeyen bolumleme: her haber TEK bir bolumde gorunur. Ama sol ve orta
  // kolonun DOLULUGU sabit dilimlerle degil, haber sayisindan hesaplanir.
  //
  // Sabit 6/12 bolmesi solu ortanin iki kati uzunlukta birakiyordu: sol kolon
  // manset + 12 tam kart tasirken orta yalnizca 6 kart tasiyordu, sayfa tek
  // tarafa yigilmis gorunuyordu.
  //
  // Denge hesabi: bir kart dar kolonda daha cok satira sarar, yani yuksekligi
  // kabaca kolon genisligiyle ters orantilidir. Sol 5, orta 4 birim genis.
  //   sol yukseklik  = (MANSET_AGIRLIGI + nSol) / 5
  //   orta yukseklik = nOrta / 4
  // Ikisini esitleyip nSol + nOrta = T koyunca:
  //   nSol = (5T - 4 * MANSET_AGIRLIGI) / 9
  const LEAD_WEIGHT = 2.6;   // manset karti ~2.6 standart kart yuksekliginde
  const LEFT_UNITS = 5;
  const MID_UNITS = 4;
  const MAIN_POOL_MAX = 18;  // ana govdede tam kart olarak gosterilecek ust sinir

  const rest = all.slice(1);
  const mainCount = Math.min(rest.length, MAIN_POOL_MAX);
  const leftCount = Math.max(
    0,
    Math.min(
      mainCount,
      Math.round((LEFT_UNITS * mainCount - MID_UNITS * LEAD_WEIGHT) / (LEFT_UNITS + MID_UNITS)),
    ),
  );
  const midCount = mainCount - leftCount;

  const lead = all[0];                                  // SOL  — manset
  const secondary = rest.slice(0, midCount);            // ORTA — One Cikanlar
  const brief = rest.slice(midCount, mainCount);        // SOL  — mansetin altinda Gundem
  const continuation = rest.slice(mainCount);           // SAG  — Bultenin Devami

  const tags = tagsRes.ok ? tagsRes.data : [];
  // Etiket bulutu 18'den 10'a indi: sağ kolonda künye, etiketler, raporlar
  // ve "Bültenin Devamı" üst üste duruyor ve 18 çip "Bültenin Devamı"nı
  // ekranın çok aşağısında başlatıyordu. Tamamı `/istatistik#etiketler`de.
  const topTags = [...tags]
    .sort(
      (a, b) =>
        (b.usage_count ?? b.article_count ?? 0) -
        (a.usage_count ?? a.article_count ?? 0),
    )
    .slice(0, TAG_CLOUD_MAX);

  return (
    <>
      {anahtar}

      {/* ---------------- PANEL GÖRÜNÜMÜ ---------------- */}
      <PanelView>
        <div className="mx-auto w-full max-w-[1440px] px-4 pb-10 sm:px-6">
          <h1 className="sr-only-custom">
            İSO · İSOV Dış Kaynak İzleme Bülteni
          </h1>

          {/* Filtre şeridi */}
          <section
            aria-label="Bülten filtreleri"
            className="border-b border-ink py-3"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <RegionTabs state={gezinti} />
              <Suspense fallback={null}>
                <SearchBox className="w-full lg:w-80" />
              </Suspense>
            </div>
            <div className="mt-3 flex flex-col gap-3">
              <BandFilter state={gezinti} />
              <ActiveFilters state={gezinti} />
            </div>
          </section>

          {all.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 gap-x-8 gap-y-8 pt-6 lg:grid-cols-12">
              {/* SOL — manşet */}
              <div className="lg:col-span-5 lg:pr-8 xl:col-span-5">
                {lead ? <LeadArticle article={lead} /> : null}

                {/* Mansetin altindaki blok. Onceden CompactArticle ile "Kisa Kisa"
                    olarak basiliyordu: yalnizca baslik + kaynak adi vardi, ozet
                    ve tarih yoktu. Okuyucu bu haberlerin ne oldugunu anlamak
                    icin tiklamak zorunda kaliyordu. Artik One Cikanlar ile ayni
                    StandardArticle formatinda: band rozeti, baslik, kaynak -
                    bolge - tarih satiri ve ozet. Bolum adi da buna gore
                    degisti - kartlar artik "kisa" degil. */}
                {brief.length > 0 ? (
                  <section className="mt-6">
                    <SectionRule
                      title="Gündem"
                      right={`${formatNumber(brief.length)} haber`}
                    />
                    <div className="grid grid-cols-1 gap-5">
                      {brief.map((a) => (
                        <StandardArticle key={a.id} article={a} />
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>

              {/* ORTA — ikincil haberler, dikey ayraçlı */}
              <div className="lg:col-span-4 lg:border-l lg:border-rule lg:pl-8">
                <SectionRule title="Öne Çıkanlar" />
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-1">
                  {secondary.map((a) => (
                    <StandardArticle key={a.id} article={a} />
                  ))}
                </div>

              </div>

              {/* SAĞ — dar kolon: künye, etiketler, raporlar, devamı.
                  "Bölge Dağılımı" çubuk grafiği buradan KALDIRILDI: beş
                  modül üst üste kalabalıktı ve "Bültenin Devamı" ekranın
                  çok aşağısında başlıyordu. Grafik `/istatistik`'e ait. */}
              <aside className="lg:col-span-3 lg:border-l lg:border-rule lg:pl-8">
                <SectionRule title="Bülten Künyesi" />
                <dl className="mb-7 space-y-2">
                  <div className="flex items-baseline justify-between border-b border-rule pb-1.5">
                    <dt className="u-kicker">Toplam Haber</dt>
                    <dd className="u-headline text-lg font-bold tabular-nums">
                      {formatNumber(total)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between border-b border-rule pb-1.5">
                    <dt className="u-kicker">Kritik Band</dt>
                    <dd className="u-headline text-lg font-bold tabular-nums text-accent">
                      {formatNumber(
                        all.filter((a) => a.importance_band === "KRITIK").length,
                      )}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between border-b border-rule pb-1.5">
                    <dt className="u-kicker">Doğrulanmış Küme</dt>
                    <dd className="u-headline text-lg font-bold tabular-nums">
                      {formatNumber(
                        all.filter((a) => (a.cluster?.member_count ?? 0) > 1)
                          .length,
                      )}
                    </dd>
                  </div>
                </dl>

                {topTags.length > 0 ? (
                  <section className="mb-7">
                    <SectionRule
                      title="En Çok Etiketler"
                      right={
                        <Link
                          href="/istatistik#etiketler"
                          className="u-link-underline"
                        >
                          Tümü
                        </Link>
                      }
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {topTags.map((tag) => (
                        <Link
                          key={tag.slug}
                          href={`/?tag=${encodeURIComponent(tag.slug)}`}
                          className="tag-chip"
                          data-active={state.tag === tag.slug ? "true" : "false"}
                        >
                          {tag.label || tag.slug}
                          {tag.usage_count || tag.article_count ? (
                            <span className="ml-1 text-ink-faint">
                              {tag.usage_count ?? tag.article_count}
                            </span>
                          ) : null}
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section>
                  <SectionRule title="Raporlar" />
                  <p className="u-body u-body-soft text-[0.9rem] leading-snug">
                    Dönemsel yönetici özetleri ve basıma hazır bülten nüshaları
                    rapor bölümünde.
                  </p>
                  <Link
                    href="/raporlar"
                    className="u-kicker u-link-underline mt-2 inline-block"
                  >
                    Rapor Arşivi →
                  </Link>
                </section>

                {/* Bültenin devamı: kalan haberlerin TAMAMI burada listelenir.
                    Onceki surum baslikta "33 haber" yazip yalnizca 8'ini
                    basiyordu; asagi kaydiran kullaniciya soz verilen basliklar
                    hic gelmiyordu. Artik sayac ile basilan liste birebir ayni. */}
                {continuation.length > 0 ? (
                  <section className="mt-7">
                    <SectionRule
                      title="Bültenin Devamı"
                      right={`${formatNumber(continuation.length)} haber`}
                    />
                    <div className="space-y-0">
                      {continuation.map((a) => (
                        <CompactArticle key={a.id} article={a} />
                      ))}
                    </div>
                  </section>
                ) : null}
              </aside>
            </div>
          )}
        </div>
      </PanelView>

      {/* ---------------- GAZETE GÖRÜNÜMÜ ---------------- */}
      <NewspaperView>
        {all.length === 0 ? (
          <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6">
            <EmptyState />
          </div>
        ) : (
          <NewspaperFront
            lead={lead as Article | undefined}
            rest={all.slice(1)}
            tags={topTags}
            total={total}
          />
        )}
      </NewspaperView>

      {/* ---------------- GÖRSEL GÖRÜNÜMÜ ---------------- */}
      {/* Aynı veri, aynı sıra (backend'in gizli skor sıralaması korunur);
          tek fark haber görsellerinin mizanpaja katılması. */}
      <VisualView>
        <VisualFront articles={all} total={total} state={gezinti} />
      </VisualView>

      {/* ---------------- KART GÖRÜNÜMÜ ---------------- */}
      {/* Az metin, yalnızca konu özetleri. Aynı veri, API sırası korunur. */}
      <DigestView>
        <DigestFront articles={all} total={total} state={gezinti} />
      </DigestView>

      {/* Vakit bütçesi EN ALTTA — kullanıcının isteği birebir böyle.
          Yuvaların dışında, yani her görünümde aynı yerde. */}
      {vakitAnahtari}
    </>
  );
}
