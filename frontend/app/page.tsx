/**
 * ANA SAYFA — bülten.
 * Panel görünümü: gazete gridi (manşet + ikincil kolonlar + sağ dar kolon).
 * Gazete görünümü: tam genişlik basılı gazete mizanpajı.
 */

import { Suspense } from "react";
import Link from "next/link";

import { getArticles, getStatsOverview, getTags } from "@/lib/api";
import {
  formatNumber,
  regionLabel,
  sortByImportance,
  toBuckets,
} from "@/lib/format";
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
import { BarList } from "@/components/Charts";
import { NewspaperFront } from "@/components/NewspaperFront";
import { DataUnavailable, EmptyState, SectionRule } from "@/components/States";
import { NewspaperView, PanelView } from "@/components/ViewSlot";

// Demo: veri daima taze, derleme sırasında backend'e istek atılmaz.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** searchParams değerini tek bir string'e indirger. */
function one(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value && value.trim() !== "" ? value : undefined;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;

  const state: FilterState = {
    region: one(sp.region),
    band: one(sp.band),
    tag: one(sp.tag),
    q: one(sp.q),
    category: one(sp.category),
    source: one(sp.source),
  };

  // Paralel veri çekimi — hiçbiri fırlatmaz, hata ApiResult içinde döner.
  const [articlesRes, tagsRes, statsRes] = await Promise.all([
    getArticles({ ...state, limit: 40 }),
    getTags(),
    getStatsOverview(),
  ]);

  // Backend tamamen erişilemezse temiz hata durumu göster.
  if (!articlesRes.ok) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6">
        <DataUnavailable message={articlesRes.error} />
      </div>
    );
  }

  const all = sortByImportance(articlesRes.data.data);
  const total = articlesRes.data.total || all.length;
  const lead = all[0];
  const secondary = all.slice(1, 7);
  const rest = all.slice(7);

  const tags = tagsRes.ok ? tagsRes.data : [];
  const topTags = [...tags]
    .sort(
      (a, b) =>
        (b.usage_count ?? b.article_count ?? 0) -
        (a.usage_count ?? a.article_count ?? 0),
    )
    .slice(0, 18);

  const regionBuckets = statsRes.ok
    ? toBuckets(statsRes.data.by_region, regionLabel)
    : [];

  return (
    <>
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
              <RegionTabs state={state} />
              <Suspense fallback={null}>
                <SearchBox className="w-full lg:w-80" />
              </Suspense>
            </div>
            <div className="mt-3 flex flex-col gap-3">
              <BandFilter state={state} />
              <ActiveFilters state={state} />
            </div>
          </section>

          {all.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 gap-x-8 gap-y-8 pt-6 lg:grid-cols-12">
              {/* SOL — manşet */}
              <div className="lg:col-span-5 lg:pr-8 xl:col-span-5">
                {lead ? <LeadArticle article={lead} /> : null}

                {rest.length > 0 ? (
                  <section className="mt-6">
                    <SectionRule
                      title="Bültenin Devamı"
                      right={`${formatNumber(rest.length)} haber`}
                    />
                    <div className="space-y-0">
                      {rest.slice(0, 8).map((a) => (
                        <CompactArticle key={a.id} article={a} />
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

                {rest.length > 8 ? (
                  <section className="mt-7">
                    <SectionRule title="Kısa Kısa" />
                    <div>
                      {rest.slice(8, 20).map((a) => (
                        <CompactArticle key={a.id} article={a} />
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>

              {/* SAĞ — dar kolon: künye, etiketler, bölge dağılımı */}
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

                {regionBuckets.length > 0 ? (
                  <section className="mb-7">
                    <SectionRule title="Bölge Dağılımı" />
                    <BarList data={regionBuckets} />
                  </section>
                ) : null}

                {topTags.length > 0 ? (
                  <section className="mb-7">
                    <SectionRule
                      title="En Çok Etiketler"
                      right={
                        <Link href="/etiketler" className="u-link-underline">
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
    </>
  );
}
