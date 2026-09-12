/**
 * ETİKETLER — bulut + gruplandırılmış liste.
 * Etiket boyutu kullanım sayısına göre ölçeklenir; tıklayınca
 * filtrelenmiş ana sayfaya gidilir.
 */

import Link from "next/link";
import type { Metadata } from "next";

import { getTags } from "@/lib/api";
import { formatNumber, humanize } from "@/lib/format";
import type { Tag } from "@/lib/types";

import { NewspaperMasthead } from "@/components/Masthead";
import { DataUnavailable, EmptyState, SectionRule } from "@/components/States";
import { NewspaperView, PanelView } from "@/components/ViewSlot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Etiketler",
  description: "Bültende kullanılan etiketler ve kullanım sayıları.",
};

/** Etiketin kullanım sayısını normalize eder. */
function countOf(tag: Tag): number {
  return Number(tag.usage_count ?? tag.article_count ?? 0) || 0;
}

/** Kullanım sayısına göre yazı boyutu (rem) — etiket bulutu ölçeği. */
function sizeFor(count: number, max: number): number {
  if (max <= 0) return 1;
  const ratio = count / max;
  return 0.95 + ratio * 1.5; // 0.95rem .. 2.45rem
}

export default async function TagsPage() {
  const res = await getTags();

  if (!res.ok) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6">
        <DataUnavailable message={res.error} />
      </div>
    );
  }

  const tags = [...res.data].sort((a, b) => countOf(b) - countOf(a));
  const max = tags.length > 0 ? countOf(tags[0]!) : 0;
  const totalUsage = tags.reduce((sum, t) => sum + countOf(t), 0);

  // Türe göre grupla (konu / sektör / kurum vb.)
  const byKind = new Map<string, Tag[]>();
  for (const tag of tags) {
    const kind = tag.kind?.trim() || "konu";
    const list = byKind.get(kind) ?? [];
    list.push(tag);
    byKind.set(kind, list);
  }

  const alphabetical = [...tags].sort((a, b) =>
    (a.label || a.slug).localeCompare(b.label || b.slug, "tr"),
  );

  if (tags.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6">
        <EmptyState
          title="Henüz etiket yok"
          hint="Toplama çalıştırıldığında etiketler burada listelenecek."
        />
      </div>
    );
  }

  const cloud = (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2.5">
      {tags.map((tag) => {
        const count = countOf(tag);
        return (
          <Link
            key={tag.slug}
            href={`/?tag=${encodeURIComponent(tag.slug)}`}
            className="u-headline leading-none hover:text-accent"
            style={{ fontSize: `${sizeFor(count, max).toFixed(2)}rem` }}
            title={`${count} haberde kullanıldı`}
          >
            {tag.label || tag.slug}
            <span className="u-kicker ml-1 align-super text-[0.6rem] text-ink-faint">
              {count}
            </span>
          </Link>
        );
      })}
    </div>
  );

  return (
    <>
      {/* ---------------- PANEL ---------------- */}
      <PanelView>
        <div className="mx-auto w-full max-w-[1440px] px-4 pb-12 sm:px-6">
          <header className="border-b border-ink py-5">
            <p className="u-kicker u-kicker-accent">Dizin</p>
            <h1 className="u-headline u-headline-lg mt-1">Etiketler</h1>
            <p className="u-body u-body-soft mt-2 max-w-2xl text-[0.95rem]">
              Bültendeki {formatNumber(tags.length)} etiket, toplam{" "}
              {formatNumber(totalUsage)} kullanım. Bir etikete tıklayarak
              bülteni filtreleyebilirsiniz.
            </p>
          </header>

          <section className="border-b border-rule py-7">
            <SectionRule title="Etiket Bulutu" right={`${tags.length} etiket`} />
            {cloud}
          </section>

          <div className="grid grid-cols-1 gap-x-10 gap-y-8 pt-7 lg:grid-cols-12">
            <section className="lg:col-span-7">
              <SectionRule title="Alfabetik Dizin" />
              <ul className="divide-y divide-rule border-t border-rule">
                {alphabetical.map((tag) => (
                  <li
                    key={tag.slug}
                    className="flex items-baseline justify-between gap-4 py-2"
                  >
                    <Link
                      href={`/?tag=${encodeURIComponent(tag.slug)}`}
                      className="u-body u-link-underline text-[0.98rem]"
                    >
                      {tag.label || tag.slug}
                      <span className="u-kicker ml-2 text-ink-faint">
                        {tag.slug}
                      </span>
                    </Link>
                    <span className="u-kicker shrink-0 tabular-nums text-ink">
                      {formatNumber(countOf(tag))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <aside className="lg:col-span-5 lg:border-l lg:border-rule lg:pl-8">
              <SectionRule title="Türlere Göre" />
              <div className="space-y-6">
                {[...byKind.entries()].map(([kind, list]) => (
                  <section key={kind}>
                    <h3 className="u-kicker mb-2 border-b border-rule pb-1 text-ink">
                      {humanize(kind)}{" "}
                      <span className="text-ink-faint">({list.length})</span>
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {list.slice(0, 40).map((tag) => (
                        <Link
                          key={tag.slug}
                          href={`/?tag=${encodeURIComponent(tag.slug)}`}
                          className="tag-chip"
                        >
                          {tag.label || tag.slug}
                          <span className="ml-1 text-ink-faint">
                            {countOf(tag)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </PanelView>

      {/* ---------------- GAZETE ---------------- */}
      <NewspaperView>
        <div className="paper-texture min-h-screen w-full">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-8">
            <NewspaperMasthead subtitle="Konu Dizini" />

            <h2 className="u-headline mt-4 text-center text-[clamp(1.5rem,4vw,2.6rem)] font-black uppercase">
              Konu Dizini
            </h2>
            <div className="mx-auto mt-2 mb-5 w-24 border-t border-ink" />

            <div className="mb-7">{cloud}</div>

            <div className="newspaper-columns border-t border-ink pt-4">
              {alphabetical.map((tag) => (
                <p
                  key={tag.slug}
                  className="u-body mb-1 break-inside-avoid text-[0.875rem] leading-snug"
                >
                  <Link href={`/?tag=${encodeURIComponent(tag.slug)}`}>
                    {tag.label || tag.slug}
                  </Link>
                  <span className="u-kicker ml-1.5 text-ink-faint">
                    {formatNumber(countOf(tag))}
                  </span>
                </p>
              ))}
            </div>
          </div>
        </div>
      </NewspaperView>
    </>
  );
}
