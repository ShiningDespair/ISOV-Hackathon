/**
 * HABER AKIŞI — vakit bütçesinin dayattığı biçimde.
 *
 * Biçim `lib/api-panel.ts` DENSITY'den gelir, burada karar verilmez:
 *   tek-cumle (2 dk) : başlık + tek cümle (<=150 karakter)
 *   madde     (5 dk) : başlık + ilk üç anahtar madde
 *   kademeli  (10 dk): ilk `full` kalem tam özet, sonrası üç madde
 *
 * SIRALAMA: `articles` dizisi API'den geldiği sırayla basılır. Burada
 * hiçbir `sort` çağrısı YOK — kişisel skor ve `is_pinned` backend'de
 * uygulanıyor, istemcide ikinci bir sıralama manşeti bozar.
 *
 * Metin ÜRETİLMEZ: tek cümle `leadSentence` ile özetin/ilk maddenin ilk
 * cümlesinden kesilir, maddeler `key_points`'tan olduğu gibi alınır.
 */

import Link from "next/link";

import { StandardArticle } from "@/components/ArticleCard";
import { BandBadge } from "@/components/BandBadge";
import { leadSentence } from "@/components/DigestCard";
import { formatDate, isoDate, regionLabel } from "@/lib/format";
import type { Article } from "@/lib/types";

export type FlowStyle = "tek-cumle" | "madde" | "kademeli";

/** Kaynak · bölge · tarih — kart bileşeniyle aynı sırada. */
function FlowKicker({ article }: { article: Article }) {
  const parts: string[] = [];
  if (article.source?.name) parts.push(article.source.name);
  parts.push(regionLabel(article.region));

  return (
    <p className="u-kicker mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      {parts.map((part, i) => (
        <span key={i} className={i === 0 ? "text-ink" : undefined}>
          {part}
        </span>
      ))}
      {article.published_at ? (
        <time dateTime={isoDate(article.published_at)}>
          {formatDate(article.published_at)}
        </time>
      ) : null}
    </p>
  );
}

/** Tek cümlelik kalem — 2 dakikalık bütçe. */
function SentenceItem({ article }: { article: Article }) {
  const sentence = leadSentence(article);
  return (
    <article className="pano-akis-oge">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <BandBadge band={article.importance_band} />
      </div>
      <Link href={`/haber/${article.id}`} className="group block">
        <h3 className="u-headline u-headline-sm group-hover:text-accent">
          {article.title}
        </h3>
      </Link>
      {sentence ? (
        <p className="u-body u-body-soft mt-2 text-[0.95rem] leading-[1.5]">
          {sentence}
        </p>
      ) : null}
      <FlowKicker article={article} />
    </article>
  );
}

/** Üç maddelik kalem — 5 dakikalık bütçe ve 15 dakikanın kuyruğu. */
function BulletItem({
  article,
  bullets,
}: {
  article: Article;
  bullets: number;
}) {
  const points = (article.key_points ?? []).filter(
    (p) => typeof p === "string" && p.trim() !== "",
  );

  return (
    <article className="pano-akis-oge">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <BandBadge band={article.importance_band} />
      </div>
      <Link href={`/haber/${article.id}`} className="group block">
        <h3 className="u-headline u-headline-md group-hover:text-accent">
          {article.title}
        </h3>
      </Link>
      <FlowKicker article={article} />

      {points.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {points.slice(0, bullets).map((point, i) => (
            <li key={i} className="u-body flex gap-2 text-[0.9375rem] leading-snug">
              <span aria-hidden="true" className="text-accent">
                ▪
              </span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      ) : (
        // Madde yoksa uydurulmaz; özetin ilk cümlesine düşülür.
        (() => {
          const sentence = leadSentence(article);
          return sentence ? (
            <p className="u-body u-body-soft mt-2 text-[0.9375rem] leading-[1.5]">
              {sentence}
            </p>
          ) : null;
        })()
      )}
    </article>
  );
}

export function ArticleFlow({
  articles,
  style,
  full = 0,
  bullets = 3,
}: {
  articles: Article[];
  style: FlowStyle;
  /** Kademeli biçimde tam özet basılacak kalem sayısı. */
  full?: number;
  bullets?: number;
}) {
  if (articles.length === 0) return null;

  return (
    <div className="pano-akis">
      {articles.map((article, index) => {
        if (style === "tek-cumle") {
          return <SentenceItem key={article.id} article={article} />;
        }
        if (style === "kademeli" && index < full) {
          // Tam özet için mevcut kart varyantı yeniden kullanılıyor.
          return (
            <div key={article.id} className="pano-akis-tam">
              <StandardArticle article={article} />
            </div>
          );
        }
        return (
          <BulletItem key={article.id} article={article} bullets={bullets} />
        );
      })}
    </div>
  );
}
