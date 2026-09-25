/**
 * KART GÖRÜNÜMÜ — tek haber kartı.
 *
 * Bu görünümün amacı metin korkusunu azaltmak: kartta uzun paragraf YOKTUR.
 * Başlık en fazla üç satır, gövde ise TEK cümledir. Okuma yükünün bir kısmı
 * rozetlere (bölge, kategori, kaç kaynak doğruladı) devredilir.
 *
 * DİKKAT: Ham `importance_score` gizli metriktir; burada yalnızca
 * `importance_band` kullanılır.
 */

import Link from "next/link";

import {
  formatDateShort,
  humanize,
  isoDate,
  normalizeBand,
  regionLabel,
  truncate,
} from "@/lib/format";
import type { Article } from "@/lib/types";

import { BandBadge } from "./BandBadge";
import { ArticleActions, HidableArticle } from "./ArticleActions";
import { paylasilacak } from "@/lib/api-me";

/** Kartta gösterilecek tek cümlenin üst sınırı (karakter). */
const SENTENCE_MAX = 150;

/**
 * Türkçe metinde cümle sonu sayılmaması gereken kısaltmalar.
 * Nokta her zaman cümle bitirmez: "Md. 5", "bkz. tablo", "vb." gibi.
 */
const ABBREVIATIONS = new Set([
  "vb",
  "vs",
  "örn",
  "bkz",
  "md",
  "mad",
  "no",
  "sy",
  "yy",
  "dr",
  "doç",
  "prof",
  "av",
  "sn",
  "mio",
  "milyar",
  "a.ş",
  "ltd",
  "şti",
]);

/** Çoklu boşlukları tek boşluğa indirir. */
function clean(value?: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Metnin ilk cümlesini döndürür.
 *
 * Saf `split(".")` kullanmıyoruz: korpustaki özetler "2026/2022", "yüzde 44-51",
 * "12 Eylül 2026'da", "Md. 5" gibi diziler taşıyor ve naif bölme cümleyi
 * ortasından kesiyordu. Üç koruma var:
 *   1) noktadan önceki sözcük sayı ile bitiyorsa (tarih/madde numarası) atlanır,
 *   2) bilinen kısaltmalarda atlanır,
 *   3) noktadan sonraki sözcük küçük harfle başlıyorsa cümle bitmemiş sayılır.
 */
export function firstSentence(value?: string | null): string {
  const text = clean(value);
  if (!text) return "";

  const boundary = /([.!?…])\s+/g;
  let match: RegExpExecArray | null;

  while ((match = boundary.exec(text)) !== null) {
    const head = text.slice(0, match.index);
    const lastWord = (head.split(" ").pop() ?? "").toLocaleLowerCase("tr-TR");
    const nextChar = text.charAt(match.index + match[0].length);

    if (/\d$/.test(lastWord)) continue;
    if (ABBREVIATIONS.has(lastWord)) continue;
    if (nextChar && nextChar === nextChar.toLocaleLowerCase("tr-TR")) continue;

    return `${head}${match[1]}`;
  }

  return text;
}

/**
 * Kartın tek cümlesi: özetin ilk cümlesi ile ilk anahtar maddeden KISA olanı.
 * Sözleşme gereği ikisi de Türkçedir. Hiçbiri yoksa boş döner ve kart
 * yalnızca başlıkla basılır — yer tutucu cümle uydurulmaz.
 */
export function leadSentence(article: Article): string {
  const candidates: string[] = [];

  const fromSummary = firstSentence(article.summary);
  if (fromSummary) candidates.push(fromSummary);

  const firstPoint = clean(article.key_points?.[0]);
  if (firstPoint) candidates.push(firstSentence(firstPoint));

  if (candidates.length === 0) return "";

  const shortest = candidates.reduce((a, b) => (b.length < a.length ? b : a));
  return truncate(shortest, SENTENCE_MAX);
}

/**
 * Kaynak adını kart altlığı için kısaltır.
 * Korpusta "KOSGEB - Küçük ve Orta Ölçekli İşletmeleri Geliştirme ve
 * Destekleme İdaresi Başkanlığı" gibi 85 karakterlik adlar var; bu görünümde
 * üç satır kaplayıp kartı metne boğuyorlardı. Tire ile ayrılmış uzun
 * açıklamayı atar, kalanı da 34 karakterde keser. Tam ad `title` ile erişilir.
 */
function shortSource(name?: string | null): string {
  const raw = (name ?? "").trim();
  if (!raw) return "";
  const head = raw.split(/\s+[-–—]\s+/)[0].trim() || raw;
  return truncate(head, 34);
}

/** "01", "02" … — sıra numarası, API sırası korunur. */
function ordinal(index: number): string {
  return String(index).padStart(2, "0");
}

export function DigestCard({
  article,
  order,
}: {
  article: Article;
  order?: number;
}) {
  const sentence = leadSentence(article);
  const memberCount = article.cluster?.member_count ?? 0;
  const category = humanize(article.category);

  return (
    <HidableArticle articleId={article.id}>
    <article
      className="kart-card"
      data-band={normalizeBand(article.importance_band)}
    >
      {/* Kartın tamamı tek bağlantı: dokunma hedefi kartın kendisi kadar büyük. */}
      <Link href={`/haber/${article.id}`} className="kart-card-link">
        <div className="kart-card-top">
          <BandBadge band={article.importance_band} />
          <span className="u-band kart-chip">{regionLabel(article.region)}</span>
          {category ? (
            <span className="u-band kart-chip kart-chip-soft">{category}</span>
          ) : null}
          {order ? (
            <span aria-hidden="true" className="kart-order">
              {ordinal(order)}
            </span>
          ) : null}
        </div>

        <h3 className="u-headline kart-title kart-clamp-3">{article.title}</h3>

        {sentence ? (
          <p className="u-body kart-sentence kart-clamp-2">{sentence}</p>
        ) : null}

        <div className="kart-card-foot">
          <span className="kart-source" title={article.source?.name ?? undefined}>
            {shortSource(article.source?.name) || "Kaynak belirtilmemiş"}
          </span>
          {article.published_at ? (
            <time
              className="kart-date"
              dateTime={isoDate(article.published_at)}
            >
              {formatDateShort(article.published_at)}
            </time>
          ) : null}
          {memberCount > 1 ? (
            <span className="kart-verify">{memberCount} kaynak doğruladı</span>
          ) : null}
        </div>
      </Link>

      {/* Paylaş / Gizle kartın bağlantısının DIŞINDA: kartın tamamı tek bir
          <a>, düğmeyi onun içine koymak geçersiz HTML ve dokunuş habere
          gidiyor olurdu. */}
      <div className="kart-eylem">
        <ArticleActions haber={paylasilacak(article)} compact />
      </div>
    </article>
    </HidableArticle>
  );
}
