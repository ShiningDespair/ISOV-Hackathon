/**
 * İSTATİSTİK — /stats/overview verisinin sade paneli.
 * Grafikler saf CSS/SVG'dir; harici grafik kütüphanesi kullanılmaz.
 */

import type { Metadata } from "next";

import { getStatsOverview } from "@/lib/api";
import {
  bandLabel,
  formatDateShort,
  formatNumber,
  humanize,
  regionLabel,
  toBuckets,
} from "@/lib/format";

import {
  BarList,
  DailyBars,
  RatioBar,
  Sparkline,
  StatFigure,
} from "@/components/Charts";
import { NewspaperMasthead } from "@/components/Masthead";
import { DataUnavailable, SectionRule } from "@/components/States";
import { NewspaperView, PanelView } from "@/components/ViewSlot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "İstatistik",
  description: "Bölge ve önem bandı dağılımları, günlük seri, tekilleştirme oranı.",
};

/** Tekilleştirme oranını 0..1 aralığına normalize eder. */
function normalizeRatio(stats: {
  dedup_ratio?: number | null;
  duplicates_removed?: number | null;
  total_articles?: number | null;
  unique_articles?: number | null;
}): number | null {
  if (typeof stats.dedup_ratio === "number" && !Number.isNaN(stats.dedup_ratio)) {
    return stats.dedup_ratio > 1 ? stats.dedup_ratio / 100 : stats.dedup_ratio;
  }
  const total = Number(stats.total_articles ?? 0);
  const dupes = Number(stats.duplicates_removed ?? 0);
  if (total > 0 && dupes > 0) return dupes / total;
  const unique = Number(stats.unique_articles ?? 0);
  if (total > 0 && unique > 0 && unique <= total) return 1 - unique / total;
  return null;
}

export default async function StatsPage() {
  const res = await getStatsOverview();

  if (!res.ok) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6">
        <DataUnavailable message={res.error} />
      </div>
    );
  }

  const stats = res.data;

  const regions = toBuckets(stats.by_region, regionLabel);
  const bands = toBuckets(stats.by_band, bandLabel);
  const categories = toBuckets(stats.by_category, humanize);
  const daily = toBuckets(
    stats.daily ?? stats.daily_series,
    (key) => formatDateShort(key),
  );

  const ratio = normalizeRatio(stats);
  const dailyValues = daily.map((d) => d.count);
  const totalFromRegions = regions.reduce((sum, r) => sum + r.count, 0);
  const totalArticles = stats.total_articles ?? totalFromRegions;

  const figures = (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
      <StatFigure
        label="Toplam Haber"
        value={formatNumber(totalArticles)}
        note="Tekilleştirilmiş kayıt sayısı"
      />
      <StatFigure
        label="Kaynak"
        value={formatNumber(stats.total_sources)}
        note="İzlenen açık kaynak"
      />
      <StatFigure
        label="Küme"
        value={formatNumber(stats.total_clusters)}
        note="Birleştirilmiş haber kümesi"
      />
      <StatFigure
        label="Etiket"
        value={formatNumber(stats.total_tags)}
        note="Konu ve sektör etiketi"
      />
    </div>
  );

  return (
    <>
      {/* ---------------- PANEL ---------------- */}
      <PanelView>
        <div className="mx-auto w-full max-w-[1440px] px-4 pb-12 sm:px-6">
          <header className="border-b border-ink py-5">
            <p className="u-kicker u-kicker-accent">Ölçüm</p>
            <h1 className="u-headline u-headline-lg mt-1">İstatistik</h1>
            <p className="u-body u-body-soft mt-2 max-w-2xl text-[0.95rem]">
              Toplama, tekilleştirme ve sınıflandırma sürecinin sayısal
              görünümü. Ham önem skoru gizli metriktir ve gösterilmez.
            </p>
          </header>

          <section className="border-b border-rule py-7">{figures}</section>

          <div className="grid grid-cols-1 gap-x-10 gap-y-9 pt-7 lg:grid-cols-12">
            {/* Günlük seri */}
            <section className="lg:col-span-8">
              <SectionRule
                title="Günlük Haber Serisi"
                right={daily.length > 0 ? `${daily.length} gün` : undefined}
              />
              <DailyBars data={daily} />

              {dailyValues.length > 1 ? (
                <div className="mt-5 flex items-center gap-4 border-t border-rule pt-3">
                  <span className="u-kicker text-ink-faint">Eğilim</span>
                  <Sparkline
                    values={dailyValues}
                    label="Günlük haber sayısı eğilimi"
                  />
                </div>
              ) : null}

              {categories.length > 0 ? (
                <section className="mt-9">
                  <SectionRule title="Kategori Dağılımı" />
                  <BarList data={categories} />
                </section>
              ) : null}
            </section>

            {/* Dağılımlar */}
            <aside className="lg:col-span-4 lg:border-l lg:border-rule lg:pl-8">
              <section className="mb-9">
                <SectionRule title="Önem Bandı Dağılımı" />
                <BarList data={bands} accentKeys={["KRITIK"]} />
              </section>

              <section className="mb-9">
                <SectionRule title="Bölge Dağılımı" />
                <BarList data={regions} />
              </section>

              <section>
                <SectionRule title="Tekilleştirme" />
                {ratio !== null ? (
                  <>
                    <RatioBar ratio={ratio} label="Tekilleştirme Oranı" />
                    <p className="u-body u-body-soft mt-3 text-[0.875rem] leading-snug">
                      Toplanan içeriğin bu oranı, aynı olayı bildiren mükerrer
                      yayın olarak tespit edilip tek kümede birleştirildi.
                    </p>
                  </>
                ) : (
                  <p className="u-body u-body-soft text-[0.9rem]">
                    Tekilleştirme oranı henüz hesaplanmadı.
                  </p>
                )}

                {stats.last_collected_at ? (
                  <p className="u-kicker mt-4 border-t border-rule pt-2 text-ink-faint">
                    Son toplama: {formatDateShort(stats.last_collected_at)}
                  </p>
                ) : null}
              </section>
            </aside>
          </div>
        </div>
      </PanelView>

      {/* ---------------- GAZETE ---------------- */}
      <NewspaperView>
        <div className="paper-texture min-h-screen w-full">
          <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-8">
            <NewspaperMasthead subtitle="Sayılarla Bülten" />

            <h2 className="u-headline mt-4 text-center text-[clamp(1.5rem,4vw,2.6rem)] font-black uppercase">
              Sayılarla Bülten
            </h2>
            <div className="mx-auto mt-2 mb-6 w-24 border-t border-ink" />

            <div className="mb-7">{figures}</div>

            <div className="border-t border-ink pt-5">
              <h3 className="newspaper-folio mb-2">Günlük Haber Serisi</h3>
              <DailyBars data={daily} height={100} />
            </div>

            <div className="mt-7 grid grid-cols-1 gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
              <section>
                <h3 className="newspaper-folio mb-2 border-b border-ink pb-1">
                  Önem Bandı
                </h3>
                <BarList data={bands} accentKeys={["KRITIK"]} />
              </section>
              <section>
                <h3 className="newspaper-folio mb-2 border-b border-ink pb-1">
                  Bölge
                </h3>
                <BarList data={regions} />
              </section>
              <section>
                <h3 className="newspaper-folio mb-2 border-b border-ink pb-1">
                  Tekilleştirme
                </h3>
                {ratio !== null ? (
                  <RatioBar ratio={ratio} label="Oran" />
                ) : (
                  <p className="u-body text-[0.875rem]">Henüz hesaplanmadı.</p>
                )}
                {categories.length > 0 ? (
                  <div className="mt-5">
                    <h3 className="newspaper-folio mb-2 border-b border-ink pb-1">
                      Kategori
                    </h3>
                    <BarList data={categories} />
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        </div>
      </NewspaperView>
    </>
  );
}
