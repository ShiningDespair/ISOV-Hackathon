/**
 * YAPILACAKLAR — son başvuru tarihli kalemler, geri sayımlı.
 *
 * Bu bölüm KASITLI olarak "haber" gibi görünmüyor: kalemler numaralı bir
 * iş listesi biçiminde, geri sayım çipi başta, tarih ve dayandığı anahtar
 * madde hemen altında. Amaç, teşvik/finansman ve dış ticaret pozisyonunda
 * çalışan kişinin başvuru penceresini haber akışının içinde kaybetmemesi.
 *
 * SIRALAMA: kalemler API sırasını KORUR, tarihe göre yeniden sıralanmaz.
 * "En yakın tarih üste" cazip görünüyor ama bu, backend'in kişisel skor +
 * `is_pinned` sıralamasını istemcide ezmek olurdu. Aciliyet bilgisi
 * sıralama yerine çipin kendisiyle verilir.
 *
 * Tarih UYDURULMAZ: yalnızca `deadline.ts` işaretli bir tarih bulabildiği
 * kalemler buraya girer, kalanlar normal haber akışında kalır.
 */

import Link from "next/link";

import { BandBadge } from "@/components/BandBadge";
import { humanize } from "@/lib/format";
import type { Article } from "@/lib/types";

import { formatHitDate, urgencyOf, type DateHit } from "./deadline";

export interface TaskItem {
  article: Article;
  hit: DateHit;
}

export function TaskList({ items }: { items: TaskItem[] }) {
  if (items.length === 0) return null;

  return (
    <ol className="pano-is-liste">
      {items.map(({ article, hit }, index) => (
        <li key={article.id} className="pano-is">
          <div className="pano-is-ust">
            <span className="pano-is-sira" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span
              className="pano-gerisayim"
              data-aciliyet={urgencyOf(hit)}
              title={`Son tarih: ${formatHitDate(hit.iso)}`}
            >
              {hit.label}
            </span>
            <time className="pano-is-tarih" dateTime={hit.iso}>
              {formatHitDate(hit.iso)}
            </time>
            <BandBadge band={article.importance_band} />
            {article.category ? (
              <span className="u-kicker text-ink-faint">
                {humanize(article.category)}
              </span>
            ) : null}
          </div>

          <Link href={`/haber/${article.id}`} className="group block">
            <h3 className="u-headline u-headline-md mt-1.5 group-hover:text-accent">
              {article.title}
            </h3>
          </Link>

          <p className="pano-is-kanit">
            <span className="u-kicker text-ink-faint">Dayanak</span> {hit.evidence}
          </p>

          {article.source?.name ? (
            <p className="u-kicker mt-1.5">{article.source.name}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
