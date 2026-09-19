/**
 * MEVZUAT TAKVİMİ — yürürlük, toplantı ve son başvuru tarihleri.
 *
 * Kaynak: `key_points` içine gömülü, işaretli tarihler (`deadline.ts`).
 * Takvim kalemi olmayan haber buraya YAZILMAZ; tarih tahmin edilmez.
 *
 * SIRALAMA: API sırası korunur. Takvimi tarihe göre dizmek doğal görünür
 * ama backend'in kişisel sıralamasını ezer; bunun yerine her satırda tam
 * tarih ve gün sayısı yazılı.
 */

import Link from "next/link";

import { humanize } from "@/lib/format";
import type { Article } from "@/lib/types";

import { formatHitDate, urgencyOf, type DateHit } from "./deadline";

export interface CalendarItem {
  article: Article;
  hit: DateHit;
}

export function CalendarList({ items }: { items: CalendarItem[] }) {
  if (items.length === 0) return null;

  return (
    <ul className="pano-takvim">
      {items.map(({ article, hit }) => (
        <li key={`${article.id}-${hit.iso}`} className="pano-takvim-oge">
          <time className="pano-takvim-tarih" dateTime={hit.iso}>
            {formatHitDate(hit.iso)}
          </time>
          <div className="pano-takvim-govde">
            <div className="flex flex-wrap items-center gap-2">
              <span className="pano-gerisayim" data-aciliyet={urgencyOf(hit)}>
                {hit.label}
              </span>
              <span className="u-kicker text-ink-faint">
                {hit.kind === "son-tarih" ? "Son başvuru" : "Yürürlük / takvim"}
              </span>
              {article.category ? (
                <span className="u-kicker text-ink-faint">
                  {humanize(article.category)}
                </span>
              ) : null}
            </div>
            <Link href={`/haber/${article.id}`} className="group block">
              <h3 className="u-headline u-headline-sm mt-1 group-hover:text-accent">
                {article.title}
              </h3>
            </Link>
            <p className="pano-is-kanit">{hit.evidence}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
