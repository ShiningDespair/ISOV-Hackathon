/**
 * DEĞİŞİKLİK AKIŞI — `/me/changes` ya da `/changes` verisi.
 *
 * Uç yayında değilse bölüm KAYBOLMAZ, "henüz yayında değil" notuyla
 * görünür kalır. Değişiklik olayı UYDURULMAZ: elimizde kümenin büyüdüğüne
 * ya da bandın yükseldiğine dair bir kayıt yoksa öyle bir satır basılmaz.
 */

import Link from "next/link";

import { relativeTime } from "@/lib/format";
import { CHANGE_LABELS, type PanelChanges } from "@/lib/api-panel";

export function ChangeFeed({ changes }: { changes: PanelChanges }) {
  if (!changes.available || changes.items.length === 0) {
    return (
      <p className="pano-bilgi" role="status">
        {changes.note ?? "Son ziyaretinizden beri kayda geçmiş değişiklik yok."}
      </p>
    );
  }

  return (
    <ul className="pano-degisiklik">
      {changes.items.map((change) => (
        <li key={change.id} className="pano-degisiklik-oge">
          <span className="pano-degisiklik-tur">
            {CHANGE_LABELS[change.type] ?? change.type}
          </span>
          <div className="min-w-0">
            {change.articleId && change.title ? (
              <Link
                href={`/haber/${change.articleId}`}
                className="group block"
              >
                <span className="u-headline u-headline-sm group-hover:text-accent">
                  {change.title}
                </span>
              </Link>
            ) : (
              <span className="u-headline u-headline-sm">
                {change.title ?? "Başlık bilgisi gelmedi"}
              </span>
            )}
            <p className="u-kicker mt-1 text-ink-faint">
              {change.at ? relativeTime(change.at) : "Zaman bilgisi yok"}
              {change.note ? ` · ${change.note}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
