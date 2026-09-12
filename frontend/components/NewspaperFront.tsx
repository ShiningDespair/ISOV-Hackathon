/**
 * GAZETE GÖRÜNÜMÜ — basılı gazete ön sayfası.
 * Tam ekran genişlik, kağıt dokusu, çok sütunlu akan metin,
 * damla harfle başlayan manşet ve sütun ayraç çizgileri.
 */

import Link from "next/link";
import { NewspaperMasthead } from "./Masthead";
import { NewspaperArticle } from "./ArticleCard";
import { PrintButton } from "./PrintButton";
import { formatDate, isoDate, kicker, regionLabel } from "@/lib/format";
import type { Article, Tag } from "@/lib/types";

export function NewspaperFront({
  lead,
  rest,
  tags = [],
  total,
}: {
  lead?: Article;
  rest: Article[];
  tags?: Tag[];
  total: number;
}) {
  return (
    <div className="paper-texture min-h-screen w-full">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8 sm:py-8">
        <NewspaperMasthead />

        {/* Yazdırma düğmesi — kağıda basılmaz */}
        <div className="no-print mb-5 flex justify-end">
          <PrintButton />
        </div>

        {lead ? (
          <>
            {/* MANŞET — sütunları aşar */}
            <section className="newspaper-span mb-6 border-b-[3px] border-double border-ink pb-5">
              <p className="u-kicker u-kicker-accent text-center">
                Günün Manşeti · {regionLabel(lead.region)}
              </p>

              <Link href={`/haber/${lead.id}`}>
                <h2 className="u-headline mx-auto mt-2 max-w-5xl text-center text-[clamp(1.75rem,5.5vw,4rem)] font-black leading-[0.98] tracking-[-0.02em]">
                  {lead.title}
                </h2>
              </Link>

              <p className="u-kicker mt-3 text-center">
                {lead.source?.name ?? "Kaynak"} ·{" "}
                <time dateTime={isoDate(lead.published_at)}>
                  {formatDate(lead.published_at)}
                </time>
                {lead.cluster && (lead.cluster.member_count ?? 0) > 1
                  ? ` · ${lead.cluster.member_count} kaynak doğruladı`
                  : ""}
              </p>

              <div className="mx-auto mt-4 max-w-4xl border-t border-rule pt-4">
                {lead.summary ? (
                  <p className="u-body drop-cap newspaper-justify text-[1.0625rem] leading-[1.55]">
                    {lead.summary}
                  </p>
                ) : null}

                {lead.key_points && lead.key_points.length > 0 ? (
                  <ul className="mt-4 border-t border-rule pt-3 sm:columns-2 sm:gap-8">
                    {lead.key_points.slice(0, 6).map((p, i) => (
                      <li
                        key={i}
                        className="u-body mb-1.5 flex break-inside-avoid gap-2 text-[0.9rem] leading-snug"
                      >
                        <span aria-hidden="true">—</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          </>
        ) : null}

        {/* Bölüm başlığı */}
        <div className="newspaper-span mb-3 flex items-center gap-3">
          <div className="flex-1 border-t border-ink" />
          <h2 className="newspaper-folio">Bültenin Devamı · {total} Haber</h2>
          <div className="flex-1 border-t border-ink" />
        </div>

        {/* Akan sütunlar */}
        <div className="newspaper-columns">
          {rest.map((article) => (
            <NewspaperArticle key={article.id} article={article} />
          ))}

          {/* Sütun akışının sonunda etiket künyesi */}
          {tags.length > 0 ? (
            <aside className="newspaper-item border-t border-ink pt-2">
              <h3 className="newspaper-folio mb-1.5">Öne Çıkan Başlıklar</h3>
              <p className="u-body text-[0.8125rem] leading-relaxed">
                {tags.slice(0, 24).map((tag, i) => (
                  <span key={tag.slug}>
                    {i > 0 ? " · " : ""}
                    <Link href={`/?tag=${encodeURIComponent(tag.slug)}`}>
                      {tag.label || tag.slug}
                    </Link>
                  </span>
                ))}
              </p>
            </aside>
          ) : null}
        </div>

        {/* Sayfa altı künye */}
        <div className="newspaper-span mt-6 border-t border-ink pt-2">
          <p className="newspaper-folio flex flex-wrap justify-between gap-2">
            <span>İSO · İSOV Dış Kaynak İzleme</span>
            <span>Otomatik Toplanmış ve Tekilleştirilmiş Nüsha</span>
            <span>Sayfa 1</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/** Gazete görünümünde kısa kicker satırı (yeniden kullanım için). */
export function newspaperKicker(article: Article): string {
  return kicker(article);
}
