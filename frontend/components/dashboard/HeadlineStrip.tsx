/**
 * YATAY ÖNEMLİ KONULAR ŞERİDİ — haber sitelerindeki "son dakika" şeridi.
 *
 * OTOMATİK KAYDIRMA YOK. Kendiliğinden akan bir şerit
 *   - ekran okuyucuda içeriği sürekli yeniden duyurur,
 *   - motor beceri kısıtı olan kullanıcıda hedefi kaçırtır,
 *   - `prefers-reduced-motion` sözünü teknik olarak tutsa bile hareketi
 *     tamamen kaldırmak zorunda kalır, yani iki ayrı tasarım demektir.
 * Bunun yerine ELDE kaydırılan, klavyeyle gezilebilen bir şerit var:
 *   - kabın kendisi `tabindex=0` ve adlandırılmış bir bölge, yani ok
 *     tuşlarıyla kaydırılabilir,
 *   - içindeki bağlantılar doğal odak sırasında; Tab ile ilerleyince
 *     tarayıcı öğeyi görünür alana kendisi getirir.
 *
 * Yatay kaydırma YALNIZCA bu kabın içinde olur (`.pano-serit`); sayfa
 * gövdesi 400 piksel genişlikte de yatay kaymaz.
 */

import Link from "next/link";

import { BandBadge } from "@/components/BandBadge";
import { truncate } from "@/lib/format";
import type { Article } from "@/lib/types";

/** Şeritte tek satırda okunabilir kalan başlık uzunluğu. */
const TITLE_MAX = 74;

export function HeadlineStrip({
  articles,
  label = "Öne Çıkanlar",
}: {
  articles: Article[];
  label?: string;
}) {
  if (articles.length === 0) return null;

  return (
    <section className="pano-serit-kap" aria-labelledby="pano-serit-baslik">
      <h2 id="pano-serit-baslik" className="pano-serit-baslik">
        {label}
      </h2>
      <ul
        className="pano-serit"
        tabIndex={0}
        aria-label={`${label} — ${articles.length} başlık, yatay kaydırılabilir liste`}
      >
        {articles.map((article) => (
          <li key={article.id} className="pano-serit-oge">
            <Link href={`/haber/${article.id}`} className="pano-serit-baglanti">
              <BandBadge band={article.importance_band} />
              <span className="pano-serit-metin" title={article.title}>
                {truncate(article.title, TITLE_MAX)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
