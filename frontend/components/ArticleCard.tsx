/**
 * Haber kartları — gazete estetiği: kutu ve gölge YOK.
 * Yalnızca kicker + başlık + özet + ince alt kural çizgisi.
 *
 * PAYLAŞ / GİZLE: kullanıcının açık isteğiydi ("her haberin sağ üstünde iki
 * düğme"). Bileşenler (ArticleActions, ShareMenu, HideDialog) yazılmış ama
 * HİÇBİR SAYFADA kullanılmıyordu — üç persona testi gerçek tarayıcıda
 * ekranda sıfır düğme saydı. Manşet ve standart kartta bant rozetinin
 * satırında, sağa yaslı. CompactArticle (dar liste satırı) ve
 * NewspaperArticle (basılı sayfa) bilinçli olarak eylemsiz: ilkinde yer
 * yok, ikincisi kâğıda basılıyor.
 */

import Link from "next/link";
import { isoDate, formatDate, kicker, regionLabel, truncate, kaynakAdiDili } from "@/lib/format";
import type { Article } from "@/lib/types";
import { paylasilacak } from "@/lib/api-me";
import { BandBadge } from "./BandBadge";
import { ArticleActions, HidableArticle } from "./ArticleActions";

/** Kaynak · bölge · tarih satırı. */
function Kicker({ article }: { article: Article }) {
  return (
    <p className="u-kicker flex flex-wrap items-center gap-x-2 gap-y-1">
      {article.source?.name ? (
        <span className="text-ink" lang={kaynakAdiDili(article.source)}>{article.source.name}</span>
      ) : null}
      <span aria-hidden="true" className="text-ink-faint">
        ·
      </span>
      <span>{regionLabel(article.region)}</span>
      {article.published_at ? (
        <>
          <span aria-hidden="true" className="text-ink-faint">
            ·
          </span>
          <time dateTime={isoDate(article.published_at)}>
            {formatDate(article.published_at)}
          </time>
        </>
      ) : null}
    </p>
  );
}

/** Küme (doğrulayan kaynak) göstergesi. */
function ClusterNote({ article }: { article: Article }) {
  const count = article.cluster?.member_count ?? 0;
  if (!article.cluster || count < 2) return null;
  return (
    <span className="u-kicker text-ink-faint">
      {count} kaynak doğruladı
    </span>
  );
}

/** MANŞET — sol geniş kolon, en yüksek bandın haberi. */
export function LeadArticle({ article }: { article: Article }) {
  return (
    <HidableArticle articleId={article.id}>
    <article className="border-b border-ink pb-6">
      <div className="mb-2 flex items-center gap-2">
        <BandBadge band={article.importance_band} />
        <ClusterNote article={article} />
        <ArticleActions haber={paylasilacak(article)} compact className="ml-auto" />
      </div>

      <Link href={`/haber/${article.id}`} className="group block">
        <h2 className="u-headline u-headline-xl group-hover:text-accent">
          {article.title}
        </h2>
      </Link>

      <div className="mt-3">
        <Kicker article={article} />
      </div>

      {article.summary ? (
        <p className="u-body mt-3 text-[1.125rem] leading-[1.55]">
          {truncate(article.summary, 420)}
        </p>
      ) : null}

      {article.key_points && article.key_points.length > 0 ? (
        <ul className="mt-4 space-y-1.5 border-t border-rule pt-3">
          {article.key_points.slice(0, 3).map((point, i) => (
            <li
              key={i}
              className="u-body flex gap-2 text-[0.98rem] leading-snug"
            >
              <span aria-hidden="true" className="text-accent">
                ▪
              </span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <Link
        href={`/haber/${article.id}`}
        className="u-kicker u-link-underline mt-4 inline-block text-ink"
      >
        Haberin Tamamı →
      </Link>
    </article>
    </HidableArticle>
  );
}

/** İKİNCİL haber — orta kolonlar. */
export function StandardArticle({ article }: { article: Article }) {
  return (
    <HidableArticle articleId={article.id}>
    <article className="border-b border-rule pb-4">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <BandBadge band={article.importance_band} />
        <ClusterNote article={article} />
        <ArticleActions haber={paylasilacak(article)} compact className="ml-auto" />
      </div>

      <Link href={`/haber/${article.id}`} className="group block">
        <h3 className="u-headline u-headline-md group-hover:text-accent">
          {article.title}
        </h3>
      </Link>

      <div className="mt-1.5">
        <Kicker article={article} />
      </div>

      {article.summary ? (
        <p className="u-body u-body-soft mt-2 text-[0.95rem] leading-[1.5]">
          {truncate(article.summary, 190)}
        </p>
      ) : null}
    </article>
    </HidableArticle>
  );
}

/** KOMPAKT liste satırı — sağ kolon / "kısa kısa". */
export function CompactArticle({ article }: { article: Article }) {
  return (
    <article className="border-b border-rule py-2.5">
      <Link href={`/haber/${article.id}`} className="group block">
        <h3 className="u-headline u-headline-sm group-hover:text-accent">
          {article.title}
        </h3>
      </Link>
      <p className="u-kicker mt-1 flex items-center gap-2">
        <span lang={kaynakAdiDili(article.source)}>{article.source?.name ?? "Kaynak belirtilmemiş"}</span>
        <BandBadge band={article.importance_band} />
      </p>
    </article>
  );
}

/** Gazete sütunu içinde akan haber bloğu. */
export function NewspaperArticle({
  article,
  withSummary = true,
}: {
  article: Article;
  withSummary?: boolean;
}) {
  return (
    <article className="newspaper-item">
      <Link href={`/haber/${article.id}`}>
        <h3 className="u-headline text-[1.0625rem] leading-[1.18] font-bold">
          {article.title}
        </h3>
      </Link>
      <p className="u-kicker mt-1 text-[0.625rem]">
        {article.source?.name?.trim() ? (
          <>
            <span lang={kaynakAdiDili(article.source)}>{article.source.name.trim()}</span>
            {" · "}
          </>
        ) : null}
        {kicker({ ...article, source: null })}
      </p>
      {withSummary && article.summary ? (
        <p className="u-body newspaper-justify mt-1.5 text-[0.875rem] leading-[1.45]">
          {truncate(article.summary, 260)}
        </p>
      ) : null}
    </article>
  );
}
