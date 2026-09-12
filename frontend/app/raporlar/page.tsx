/**
 * RAPOR ARŞİVİ — dönemsel bülten raporlarının listesi.
 */

import Link from "next/link";
import type { Metadata } from "next";

import { getReports } from "@/lib/api";
import { formatDate, formatNumber, humanize, isoDate, truncate } from "@/lib/format";
import type { Report } from "@/lib/types";

import { NewspaperMasthead } from "@/components/Masthead";
import { DataUnavailable, EmptyState, SectionRule } from "@/components/States";
import { NewspaperView, PanelView } from "@/components/ViewSlot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Raporlar",
  description: "Dönemsel yönetici özetleri ve bülten raporları.",
};

/** Rapor başlığı yoksa dönemden üret. */
function titleOf(report: Report): string {
  if (report.title?.trim()) return report.title;
  const period = humanize(report.period_type) || "Dönemsel";
  const start = formatDate(report.period_start);
  const end = formatDate(report.period_end);
  return `${period} Bülten Raporu · ${start} – ${end}`;
}

function summaryOf(report: Report): string {
  return report.executive_summary ?? report.summary ?? "";
}

function countOf(report: Report): number {
  if (typeof report.article_count === "number") return report.article_count;
  const fromSections = (report.sections ?? []).reduce(
    (sum, s) => sum + (s.articles?.length ?? s.items?.length ?? 0),
    0,
  );
  return fromSections || (report.articles?.length ?? 0);
}

export default async function ReportsPage() {
  const res = await getReports();

  if (!res.ok) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6">
        <DataUnavailable message={res.error} />
      </div>
    );
  }

  const reports = [...res.data].sort((a, b) => {
    const ta = new Date(a.period_end ?? a.created_at ?? 0).getTime();
    const tb = new Date(b.period_end ?? b.created_at ?? 0).getTime();
    return tb - ta;
  });

  const [latest, ...older] = reports;

  const body =
    reports.length === 0 ? (
      <EmptyState
        title="Henüz rapor üretilmedi"
        hint="Dönemsel rapor üretildiğinde arşivde burada listelenir."
      />
    ) : (
      <div className="grid grid-cols-1 gap-x-10 gap-y-8 pt-6 lg:grid-cols-12">
        {/* Son rapor — öne çıkarılmış */}
        <section className="lg:col-span-7">
          <SectionRule title="Son Rapor" />
          {latest ? (
            <article className="border-b border-ink pb-6">
              <p className="u-kicker">
                {humanize(latest.period_type) || "Dönemsel"} ·{" "}
                <time dateTime={isoDate(latest.period_start)}>
                  {formatDate(latest.period_start)}
                </time>{" "}
                –{" "}
                <time dateTime={isoDate(latest.period_end)}>
                  {formatDate(latest.period_end)}
                </time>
              </p>
              <Link href={`/raporlar/${latest.id}`} className="group block">
                <h2 className="u-headline u-headline-lg mt-1.5 group-hover:text-accent">
                  {titleOf(latest)}
                </h2>
              </Link>
              {summaryOf(latest) ? (
                <p className="u-body mt-3 text-[1.0625rem] leading-[1.55]">
                  {truncate(summaryOf(latest), 460)}
                </p>
              ) : null}
              <p className="u-kicker mt-3 text-ink-faint">
                {formatNumber(countOf(latest))} haber
              </p>
              <Link
                href={`/raporlar/${latest.id}`}
                className="u-kicker u-link-underline mt-3 inline-block"
              >
                Raporu Oku →
              </Link>
            </article>
          ) : null}
        </section>

        {/* Arşiv */}
        <aside className="lg:col-span-5 lg:border-l lg:border-rule lg:pl-8">
          <SectionRule
            title="Arşiv"
            right={`${formatNumber(reports.length)} rapor`}
          />
          <ul className="divide-y divide-rule border-t border-rule">
            {older.map((report) => (
              <li key={report.id} className="py-3">
                <p className="u-kicker">
                  {humanize(report.period_type) || "Dönemsel"} ·{" "}
                  <time dateTime={isoDate(report.period_end)}>
                    {formatDate(report.period_end)}
                  </time>
                </p>
                <Link href={`/raporlar/${report.id}`} className="group block">
                  <h3 className="u-headline u-headline-sm mt-1 group-hover:text-accent">
                    {titleOf(report)}
                  </h3>
                </Link>
                <p className="u-kicker mt-1 text-ink-faint">
                  {formatNumber(countOf(report))} haber
                </p>
              </li>
            ))}
            {older.length === 0 ? (
              <li className="py-3">
                <p className="u-body u-body-soft text-[0.9rem]">
                  Arşivde başka rapor bulunmuyor.
                </p>
              </li>
            ) : null}
          </ul>
        </aside>
      </div>
    );

  return (
    <>
      <PanelView>
        <div className="mx-auto w-full max-w-[1440px] px-4 pb-12 sm:px-6">
          <header className="border-b border-ink py-5">
            <p className="u-kicker u-kicker-accent">Arşiv</p>
            <h1 className="u-headline u-headline-lg mt-1">Raporlar</h1>
            <p className="u-body u-body-soft mt-2 max-w-2xl text-[0.95rem]">
              Dönemsel yönetici özetleri ve bölümlenmiş haber listeleri. Her
              rapor gazete görünümünde basıma hazırdır.
            </p>
          </header>
          {body}
        </div>
      </PanelView>

      <NewspaperView>
        <div className="paper-texture min-h-screen w-full">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-8">
            <NewspaperMasthead subtitle="Rapor Arşivi" />
            <h2 className="u-headline mt-4 text-center text-[clamp(1.5rem,4vw,2.6rem)] font-black uppercase">
              Rapor Arşivi
            </h2>
            <div className="mx-auto mt-2 mb-5 w-24 border-t border-ink" />

            {reports.length === 0 ? (
              <EmptyState title="Henüz rapor üretilmedi" />
            ) : (
              <div className="newspaper-columns border-t border-ink pt-4">
                {reports.map((report) => (
                  <article key={report.id} className="newspaper-item">
                    <p className="u-kicker text-[0.625rem]">
                      {humanize(report.period_type) || "Dönemsel"} ·{" "}
                      {formatDate(report.period_end)}
                    </p>
                    <Link href={`/raporlar/${report.id}`}>
                      <h3 className="u-headline mt-1 text-[1rem] font-bold leading-tight">
                        {titleOf(report)}
                      </h3>
                    </Link>
                    {summaryOf(report) ? (
                      <p className="u-body newspaper-justify mt-1.5 text-[0.85rem] leading-[1.45]">
                        {truncate(summaryOf(report), 220)}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </NewspaperView>
    </>
  );
}
