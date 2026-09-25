/**
 * KART GÖRÜNÜMÜ — "az metin, yalnızca konu özetleri".
 *
 * Tasarım gerekçesi (kullanıcı isteği): çok fazla yazı bazı kullanıcılara
 * korkutucu geliyor. Bu yüzden mizanpaj metni azaltmaya göre kurulmuştur:
 *   1) üstte tek satırlık sayısal özet şeridi — okumadan önce "bugün ne var"
 *      sorusunun cevabı sayıyla verilir,
 *   2) tek dokunuşluk bölge şeridi (büyük hedefler, 44px),
 *   3) kart ızgarası: mobil 1, tablet 2, geniş ekran 3 kolon; her kartta
 *      başlık + TEK cümle, gerisi rozet.
 *
 * Sıralama backend'den geldiği gibi korunur (gizli önem skoru sırası);
 * burada yeniden sıralama YAPILMAZ.
 */

import Link from "next/link";

import { REGIONS } from "@/lib/types";
import type { Article } from "@/lib/types";
import { formatNumber, normalizeBand, normalizeRegion, regionLabel } from "@/lib/format";

import { withParam, type FilterState } from "./Filters";
import { DigestCard } from "./DigestCard";
import { EmptyState } from "./States";

/** Şeritteki tek sayı kutusu. */
function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="kart-stat">
      <span className="kart-stat-label u-kicker">{label}</span>
      <span
        className="kart-stat-value"
        data-accent={accent ? "true" : "false"}
      >
        {formatNumber(value)}
      </span>
    </div>
  );
}

export function DigestFront({
  articles,
  total,
  state,
  sayiSeridi = true,
  baslikBlogu = true,
  filtreSeridi = true,
  siraNo,
}: {
  articles: Article[];
  total: number;
  state: FilterState;
  /**
   * Sayisal ozet seridi basilsin mi.
   *
   * Neden kapatilabilir: Bana Ozel akisinda kabuk zaten pozisyona gore
   * SIKI bir KPI seridi basiyor. Ikisi birlikte ust uste iki sayi seridi
   * demek; kullanicinin bu turdaki asil sikayeti "KPI'lar cok yer
   * kapliyor, haber gormek icin kaydirmak gerekiyor"di. Genel akista
   * kabuk serit basmadigi icin varsayilan ACIK kalir.
   */
  sayiSeridi?: boolean;
  /**
   * "Kart Görünümü / Bugünün Özeti" başlığı ve açıklaması basılsın mı.
   * VARSAYILAN AÇIK (genel akış aynen kalır).
   *
   * Neden kapatılabilir (persona testi, mobil 390×844): Bana Özel'de
   * ilk kart y=813–872'deydi, ekran 844. Bu başlık bloğu (~110 px) ve
   * altındaki 7 bölge çipi (~100 px, 44 px'lik iki satır) haberi ekranın
   * dışına iten iki büyük kalemdi. Kişisel akışta sayfanın başlığı kabuğun
   * "Bugün Bilmeniz Gereken 3 Şey" bloğu.
   */
  baslikBlogu?: boolean;
  /**
   * Bölge çip şeridi basılsın mı. VARSAYILAN AÇIK. Kişisel akışta kabuk
   * tek, katlanmış bir "Filtrele" basıyor (bölge, bant, arama).
   */
  filtreSeridi?: boolean;
  /**
   * Kartın sıra numarası (haber id → API sırasındaki yeri, 1 tabanlı).
   * VERİLMEZSE eski davranış: dizideki yeri ("01", "02"…).
   *
   * Neden: Bana Özel'de ilk üç haber kabuktaki "Bugün Bilmeniz Gereken 3
   * Şey"de, aksiyon/takip düzeninde tarihli kalemler de kendi
   * bölümünde. Buradaki ilk kart API sırasının 4.'sü (ya da daha
   * gerisi); "01" yazmak sırayı yalanlardı. Numara API'den gelen dizideki
   * yerdir — yeniden sıralama yok, yalnızca doğru etiket.
   */
  siraNo?: Record<number, number>;
}) {
  const shown = articles.length;

  // Sayılar yalnızca `importance_band` üzerinden hesaplanır; ham skora
  // (importance_score) hiçbir yerde dokunulmaz.
  const criticalCount = articles.filter(
    (a) => normalizeBand(a.importance_band) === "KRITIK",
  ).length;

  const regionCount = new Set(articles.map((a) => normalizeRegion(a.region)))
    .size;

  const verifiedCount = articles.filter(
    (a) => (a.cluster?.member_count ?? 0) > 1,
  ).length;

  const regionItems = [
    { key: undefined as string | undefined, label: "Tümü" },
    ...REGIONS.map((r) => ({ key: r as string, label: regionLabel(r) })),
  ];

  return (
    <div className="kart-shell mx-auto w-full max-w-[1440px] px-4 pb-14 sm:px-6">
      {baslikBlogu ? (
      <header className="kart-head">
        <p className="u-kicker u-kicker-accent">Kart Görünümü</p>
        <h2 className="u-headline kart-page-title">Bugünün Özeti</h2>
        <p className="u-body u-body-soft kart-lede">
          Her kartta tek cümle var; ayrıntı için kartı açmanız yeterli.
          {total > shown
            ? ` Önem sırasına göre ilk ${formatNumber(shown)} haber listeleniyor.`
            : ""}
        </p>
      </header>
      ) : null}

      {/* Sayısal özet şeridi — okuma yükünü sayıya devreder.
          Bana Özel akışında `sayiSeridi={false}` ile kapatılır; orada
          kabuğun sıkı KPI şeridi aynı işi pozisyona göre yapıyor. */}
      {sayiSeridi ? (
        <section aria-label="Bugünün sayıları" className="kart-summary">
          <Stat label="Haber" value={shown} />
          <Stat label="Kritik" value={criticalCount} accent />
          <Stat label="Bölge" value={regionCount} />
          <Stat label="Doğrulanmış" value={verifiedCount} />
        </section>
      ) : null}

      {/* Tek filtre: bölge. Bu görünümün amacı sadeleştirmek olduğu için
          band, etiket ve arama şeritleri bilinçli olarak yok. */}
      {filtreSeridi ? (
      <nav aria-label="Bölge filtresi" className="kart-filter">
        {regionItems.map((item) => {
          const active = (state.region ?? undefined) === item.key;
          return (
            <Link
              key={item.label}
              href={withParam(state, "region", item.key)}
              aria-current={active ? "true" : undefined}
              data-active={active ? "true" : "false"}
              className="kart-filter-chip"
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      ) : null}

      {shown === 0 ? (
        <EmptyState />
      ) : (
        <div className="kart-grid">
          {articles.map((article, index) => (
            <DigestCard
              key={article.id}
              article={article}
              order={siraNo?.[article.id] ?? index + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
