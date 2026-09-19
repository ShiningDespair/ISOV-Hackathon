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
}: {
  articles: Article[];
  total: number;
  state: FilterState;
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

      {/* Sayısal özet şeridi — okuma yükünü sayıya devreder. */}
      <section aria-label="Bugünün sayıları" className="kart-summary">
        <Stat label="Haber" value={shown} />
        <Stat label="Kritik" value={criticalCount} accent />
        <Stat label="Bölge" value={regionCount} />
        <Stat label="Doğrulanmış" value={verifiedCount} />
      </section>

      {/* Tek filtre: bölge. Bu görünümün amacı sadeleştirmek olduğu için
          band, etiket ve arama şeritleri bilinçli olarak yok. */}
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

      {shown === 0 ? (
        <EmptyState />
      ) : (
        <div className="kart-grid">
          {articles.map((article, index) => (
            <DigestCard
              key={article.id}
              article={article}
              order={index + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
