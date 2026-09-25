/**
 * MEVZUAT TAKVİMİ — yürürlük, toplantı ve son başvuru tarihleri.
 *
 * Kaynak: `key_points` içine gömülü, işaretli tarihler (`deadline.ts`).
 * Takvim kalemi olmayan haber buraya YAZILMAZ; tarih tahmin edilmez.
 *
 * SIRALAMA: API sırası korunur. Takvimi tarihe göre dizmek doğal görünür
 * ama backend'in kişisel sıralamasını ezer; bunun yerine her satırda tam
 * tarih ve gün sayısı yazılı.
 *
 * BÖLÜMLEME: süresi dolan son başvurular listenin SONUNA iner (her bölüm
 * kendi içinde API sırasında). Ölçülen hata (Selin P0-1): "SÜRE DOLDU"
 * damgalı KOSGEB (15 Eylül) ve TOBB Türkiye 100 (18 Eylül) takvimin
 * üstündeydi. Türü de artık tarihin cümleciğinden ("Ön kayıt", "Son
 * başvuru"…); eskiden her son tarih "Son başvuru" yazılıyordu.
 */

import Link from "next/link";

import { humanize } from "@/lib/format";
import type { Article } from "@/lib/types";

import { expiredLabel, formatHitDate, urgencyOf, type DateHit } from "./deadline";

export interface CalendarItem {
  article: Article;
  hit: DateHit;
}

export function CalendarList({ items }: { items: CalendarItem[] }) {
  if (items.length === 0) return null;

  const gecti = (h: DateHit) => h.kind === "son-tarih" && h.days < 0;
  const sirali = [
    ...items.filter((i) => !gecti(i.hit)),
    ...items.filter((i) => gecti(i.hit)),
  ];

  return (
    <ul className="pano-takvim">
      {sirali.map(({ article, hit }) => (
        <li
          key={`${article.id}-${hit.iso}`}
          className="pano-takvim-oge"
          data-tarih-gecti={gecti(hit) ? "true" : "false"}
        >
          <time className="pano-takvim-tarih" dateTime={hit.iso}>
            {formatHitDate(hit.iso)}
          </time>
          <div className="pano-takvim-govde">
            <div className="flex flex-wrap items-center gap-2">
              <span className="pano-gerisayim" data-aciliyet={urgencyOf(hit)}>
                {gecti(hit) ? expiredLabel(hit.days) : hit.label}
              </span>
              <span className="u-kicker text-ink-faint">
                {hit.kind === "son-tarih" ? hit.step : "Yürürlük / takvim"}
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
