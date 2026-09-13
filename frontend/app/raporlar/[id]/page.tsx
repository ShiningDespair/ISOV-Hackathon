/**
 * RAPOR DETAYI — yönetici özeti + bölümlenmiş haber listesi.
 * Gazete görünümü basıma hazırdır (@media print A4).
 */

import Link from "next/link";
import type { Metadata } from "next";

import { getReport } from "@/lib/api";
import {
  formatDate,
  formatNumber,
  humanize,
  isoDate,
  regionLabel,
  sortByImportance,
  truncate,
} from "@/lib/format";
import type { Article, Report, ReportItem, ReportSection } from "@/lib/types";

import { StandardArticle, NewspaperArticle } from "@/components/ArticleCard";
import { NewspaperMasthead } from "@/components/Masthead";
import { PrintButton } from "@/components/PrintButton";
import { DataUnavailable, EmptyState, SectionRule } from "@/components/States";
import { NewspaperView, PanelView } from "@/components/ViewSlot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = Promise<{ id: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id } = await params;
  const res = await getReport(id);
  if (!res.ok) return { title: "Rapor" };
  return {
    title: titleOf(res.data),
    description: truncate(
      res.data.executive_summary ?? res.data.summary ?? "",
      160,
    ),
  };
}

function titleOf(report: Report): string {
  if (report.title?.trim()) return report.title;
  const period = humanize(report.period_type) || "Dönemsel";
  return `${period} Bülten Raporu · ${formatDate(report.period_start)} – ${formatDate(report.period_end)}`;
}

/** Bölümleri normalize eder; bölüm yoksa haberleri bölgeye göre grupla. */
/**
 * Rapor kalemlerini tek bicime indirger.
 * Backend {rank_order, section, article} sarmalayicisi donduruyor; duz Article
 * dizisi gelme ihtimaline karsi ikisi de destekleniyor. Siralama backend'in
 * verdigi rank_order'a birakilir - istemci gizli onem skorunu goremedigi icin
 * yeniden siralarsa raporun editoryel sirasini bozar.
 */
function unwrapItems(list: (Article | ReportItem)[]): Article[] {
  return list
    .map((entry) =>
      entry && typeof entry === "object" && "article" in entry
        ? ((entry as ReportItem).article ?? null)
        : (entry as Article),
    )
    .filter((a): a is Article => Boolean(a && a.id));
}

function sectionsOf(report: Report): { title: string; articles: Article[] }[] {
  const raw = report.sections ?? [];

  if (raw.length > 0) {
    return raw
      .map((s: ReportSection) => ({
        // Backend bolum adini `key` alaninda donduruyor. Onceki surum yalnizca
        // title/region/band'e bakiyordu, hicbiri tutmadigi icin BES BOLUMUN DE
        // basligi "Bolum" cikiyordu.
        title:
          s.title?.trim() ||
          (s.key ? regionLabel(s.key) : "") ||
          (s.region ? regionLabel(s.region) : "") ||
          (s.band ? `${s.band} Bandı` : "") ||
          "Bölüm",
        // Kalemler {rank_order, section, article} olarak sarmalanmis geliyor.
        // Onceki surum sarmalayiciyi dogrudan karta veriyordu; kartin
        // bekledigi id/title alanlari olmadigi icin rapor BOMBOS basiliyordu
        // (PDF ciktisinin bos gorunmesinin CSS'ten bagimsiz ikinci sebebi).
        articles: unwrapItems(s.articles ?? s.items ?? []),
      }))
      .filter((s) => s.articles.length > 0);
  }

  const articles = report.articles ?? [];
  if (articles.length === 0) return [];

  // Bölüm gelmediyse bölgeye göre kendimiz grupla.
  const groups = new Map<string, Article[]>();
  for (const article of articles) {
    const key = regionLabel(article.region);
    const list = groups.get(key) ?? [];
    list.push(article);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([title, list]) => ({
    title,
    articles: sortByImportance(list),
  }));
}

export default async function ReportDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const res = await getReport(id);

  if (!res.ok) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6">
        <DataUnavailable message={res.error} />
      </div>
    );
  }

  const report = res.data;
  const sections = sectionsOf(report);
  const totalArticles =
    report.article_count ??
    sections.reduce((sum, s) => sum + s.articles.length, 0);
  const executive = report.executive_summary ?? report.summary ?? "";

  const periodLine = (
    <>
      <time dateTime={isoDate(report.period_start)}>
        {formatDate(report.period_start)}
      </time>
      {" – "}
      <time dateTime={isoDate(report.period_end)}>
        {formatDate(report.period_end)}
      </time>
    </>
  );

  return (
    <>
      {/* ---------------- PANEL ---------------- */}
      <PanelView>
        <div className="mx-auto w-full max-w-[1440px] px-4 pb-12 sm:px-6">
          <nav aria-label="Geri" className="border-b border-rule py-3">
            <Link href="/raporlar" className="u-kicker u-link-underline">
              ← Rapor Arşivi
            </Link>
          </nav>

          <header className="border-b border-ink py-6">
            <p className="u-kicker u-kicker-accent">
              {humanize(report.period_type) || "Dönemsel"} Rapor
            </p>
            <h1 className="u-headline u-headline-xl mt-2">{titleOf(report)}</h1>
            <p className="u-kicker mt-3">
              {periodLine}
              <span aria-hidden="true" className="mx-2 text-ink-faint">·</span>
              {formatNumber(totalArticles)} haber
              {report.created_at || report.generated_at ? (
                <>
                  <span aria-hidden="true" className="mx-2 text-ink-faint">·</span>
                  Üretim: {formatDate(report.generated_at ?? report.created_at)}
                </>
              ) : null}
            </p>
            <div className="mt-4">
              <PrintButton label="Raporu PDF Yap" />
            </div>
          </header>

          {executive ? (
            <section
              aria-label="Yönetici özeti"
              className="my-7 border-y-[3px] border-double border-ink bg-surface px-5 py-5 sm:px-8 sm:py-6"
            >
              <h2 className="u-kicker u-kicker-accent">Yönetici Özeti</h2>
              <div className="u-body mt-3 max-w-4xl space-y-3 text-[1.0625rem] leading-[1.6]">
                {executive
                  .split(/\n{1,}/)
                  .map((p) => p.trim())
                  .filter(Boolean)
                  .map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
              </div>
            </section>
          ) : null}

          {sections.length === 0 ? (
            <EmptyState
              title="Raporda haber bulunmuyor"
              hint="Bu dönem için eşleşen haber kaydı yok."
            />
          ) : (
            <div className="space-y-10">
              {sections.map((section) => (
                <section key={section.title}>
                  <SectionRule
                    title={section.title}
                    right={`${formatNumber(section.articles.length)} haber`}
                  />
                  <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
                    {section.articles.map((article) => (
                      <StandardArticle key={article.id} article={article} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </PanelView>

      {/* ---------------- GAZETE (basıma hazır) ---------------- */}
      <NewspaperView>
        <div className="paper-texture min-h-screen w-full">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-8">
            <NewspaperMasthead
              subtitle={`${humanize(report.period_type) || "Dönemsel"} Rapor`}
              date={report.period_end}
            />

            <div className="no-print mb-5 flex items-center justify-between gap-3">
              <Link href="/raporlar" className="u-kicker u-link-underline">
                ← Rapor Arşivi
              </Link>
              <PrintButton label="Raporu PDF Yap (A4)" />
            </div>

            <h2 className="u-headline mx-auto max-w-4xl text-center text-[clamp(1.5rem,4.5vw,3rem)] font-black leading-tight">
              {titleOf(report)}
            </h2>
            <p className="u-kicker mt-2 border-y border-rule py-1.5 text-center">
              {periodLine}
              {" · "}
              {formatNumber(totalArticles)} haber
            </p>

            {executive ? (
              <section className="mx-auto mt-5 max-w-4xl border-b-[3px] border-double border-ink pb-5">
                <h3 className="newspaper-folio mb-2 text-center">
                  Yönetici Özeti
                </h3>
                <div className="u-body newspaper-justify space-y-2.5 text-[0.95rem] leading-[1.5]">
                  {executive
                    .split(/\n{1,}/)
                    .map((p) => p.trim())
                    .filter(Boolean)
                    .map((p, i) => (
                      <p key={i} className={i === 0 ? "drop-cap" : undefined}>
                        {p}
                      </p>
                    ))}
                </div>
              </section>
            ) : null}

            {sections.map((section) => (
              <section key={section.title} className="mt-6">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex-1 border-t border-ink" />
                  <h3 className="newspaper-folio">
                    {section.title} · {section.articles.length}
                  </h3>
                  <div className="flex-1 border-t border-ink" />
                </div>
                <div className="newspaper-columns">
                  {section.articles.map((article) => (
                    <NewspaperArticle key={article.id} article={article} />
                  ))}
                </div>
              </section>
            ))}

            <div className="mt-6 border-t border-ink pt-2">
              <p className="newspaper-folio flex flex-wrap justify-between gap-2">
                <span>İSO · İSOV Dış Kaynak İzleme</span>
                <span>Rapor #{report.id}</span>
                <span>Basıma Hazır Nüsha</span>
              </p>
            </div>
          </div>
        </div>
      </NewspaperView>
    </>
  );
}
