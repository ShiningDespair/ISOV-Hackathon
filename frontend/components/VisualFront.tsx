/**
 * GÖRSEL GÖRÜNÜMÜ — ana tasarımın (NYT tipografisi, gazete estetiği) aynısı,
 * üzerine haber görselleri eklenmiş hâli. Kutu/gölge/yuvarlak köşe YOK;
 * görseller ince kural çizgisi çerçevesiyle metnin içine oturur.
 *
 * Mizanpaj:
 *   1) Manşet bloğu — solda büyük görsel (16:9), sağda başlık + kicker + özet.
 *      Mobilde görsel üstte, metin altta.
 *   2) Görsel ızgara — mobil 1, tablet 2, geniş 3 kolon; her kartta üstte
 *      görsel (4:3), altında band rozeti, başlık, kicker, kısa özet.
 *   3) Görselsiz kompakt liste — kalan haberler, sayfa şişmesin.
 *
 * Bu dosya SUNUCU bileşenidir; yalnızca <ArticleImage> istemci tarafında
 * çalışır (onError ile yer tutucuya düşmek için).
 *
 * Gizli metrik notu: `importance_score` OKUNMAZ. Sıralama backend'den geldiği
 * gibi korunur, kullanıcıya yalnızca `importance_band` rozet olarak gösterilir.
 */

import Link from "next/link";

import {
  formatDate,
  formatNumber,
  humanize,
  isoDate,
  regionLabel,
  truncate,
} from "@/lib/format";
import type { Article } from "@/lib/types";

import { ArticleImage } from "./ArticleImage";
import { BandBadge } from "./BandBadge";
import { CompactArticle } from "./ArticleCard";
import {
  ActiveFilters,
  BandFilter,
  RegionTabs,
  type FilterState,
} from "./Filters";
import { EmptyState, SectionRule } from "./States";

/** Izgarada görselli kart olarak basılacak haber üst sınırı. */
const GRID_MAX = 12;

/** Yer tutucu kicker'ı: kategori varsa o, yoksa bölge. */
function placeholderLabel(article: Article): string {
  const category = humanize(article.category);
  return category || regionLabel(article.region);
}

/** Kaynak · bölge · tarih satırı (ArticleCard'daki kicker ile aynı düzen). */
function MetaLine({ article }: { article: Article }) {
  return (
    <p className="u-kicker flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-ink">
        {article.source?.name?.trim() || "Kaynak belirtilmemiş"}
      </span>
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

/** "3 kaynak doğruladı" — tekilleştirmenin görünür kanıtı. */
function ClusterNote({ article }: { article: Article }) {
  const count = article.cluster?.member_count ?? 0;
  if (!article.cluster || count < 2) return null;
  return <span className="u-kicker text-ink-faint">{count} kaynak doğruladı</span>;
}

/**
 * Görsel bağlantısı: başlığın kopyası olduğu için klavye sırasından çıkarıldı
 * (tabIndex -1) — her kartta iki kez sekme atlanmasın. `data-a11y-image`
 * bağlantının kendisinde de duruyor ki "Görselleri gizle" ayarında geriye
 * yüksekliği sıfır, boş bir bağlantı kalmasın.
 */

/** MANŞET — solda görsel, sağda metin. */
function VisualLead({ article }: { article: Article }) {
  return (
    <article className="gorsel-lead border-b border-ink pb-7">
      {/* Kaynak amblemi (görseli olmayan haberler) için geçen alanlar:
          `sourceSlug` adlandırılmış tasarımı, `sourceType` tür arketipini,
          `countryCode` ülke damgasını seçer; `articleUrl` ve `publishedAt`
          Resmî Gazete künyesindeki sayı/tarih için gerekiyor. Bunlar
          geçmezse amblem yine çıkar, yalnızca monogram kademesine düşer. */}
      <Link
        href={`/haber/${article.id}`}
        aria-label={article.title}
        tabIndex={-1}
        data-a11y-image
        className="gorsel-media-link"
      >
        <ArticleImage
          src={article.image_url}
          alt={article.title}
          seed={article.id}
          sourceName={article.source?.name}
          label={placeholderLabel(article)}
          fallbackInitials={regionLabel(article.region)}
          ratio="lead"
          sourceSlug={article.source?.slug}
          sourceType={article.source?.source_type}
          countryCode={article.source?.country_code}
          articleUrl={article.url}
          publishedAt={article.published_at}
        />
      </Link>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <BandBadge band={article.importance_band} />
          <ClusterNote article={article} />
        </div>

        <Link href={`/haber/${article.id}`} className="group block">
          <h2 className="u-headline u-headline-lg group-hover:text-accent">
            {article.title}
          </h2>
        </Link>

        <div className="mt-3">
          <MetaLine article={article} />
        </div>

        {article.summary ? (
          <p className="u-body mt-3 text-[1.0625rem] leading-[1.55]">
            {truncate(article.summary, 360)}
          </p>
        ) : null}

        {article.key_points && article.key_points.length > 0 ? (
          <ul className="mt-4 space-y-1.5 border-t border-rule pt-3">
            {article.key_points.slice(0, 3).map((point, i) => (
              <li key={i} className="u-body flex gap-2 text-[0.95rem] leading-snug">
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
      </div>
    </article>
  );
}

/** Izgara kartı — üstte görsel, altında metin. */
function VisualCard({ article }: { article: Article }) {
  return (
    <article className="gorsel-card">
      {/* Kaynak amblemi (görseli olmayan haberler) için geçen alanlar:
          `sourceSlug` adlandırılmış tasarımı, `sourceType` tür arketipini,
          `countryCode` ülke damgasını seçer; `articleUrl` ve `publishedAt`
          Resmî Gazete künyesindeki sayı/tarih için gerekiyor. Bunlar
          geçmezse amblem yine çıkar, yalnızca monogram kademesine düşer. */}
      <Link
        href={`/haber/${article.id}`}
        aria-label={article.title}
        tabIndex={-1}
        data-a11y-image
        className="gorsel-media-link"
      >
        <ArticleImage
          src={article.image_url}
          alt={article.title}
          seed={article.id}
          sourceName={article.source?.name}
          label={placeholderLabel(article)}
          fallbackInitials={regionLabel(article.region)}
          ratio="card"
          sourceSlug={article.source?.slug}
          sourceType={article.source?.source_type}
          countryCode={article.source?.country_code}
          articleUrl={article.url}
          publishedAt={article.published_at}
        />
      </Link>

      <div className="gorsel-card-body">
        <div className="flex flex-wrap items-center gap-2">
          <BandBadge band={article.importance_band} />
          <ClusterNote article={article} />
        </div>

        <Link href={`/haber/${article.id}`} className="group block">
          <h3 className="u-headline u-headline-sm group-hover:text-accent">
            {article.title}
          </h3>
        </Link>

        <MetaLine article={article} />

        {article.summary ? (
          <p className="u-body u-body-soft text-[0.9375rem] leading-[1.5]">
            {truncate(article.summary, 150)}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function VisualFront({
  articles,
  total,
  state,
  baslikDuzeyi = 1,
}: {
  articles: Article[];
  total: number;
  state: FilterState;
  /**
   * Ekran okuyucu basliginin duzeyi.
   *
   * Neden prop: bu bilesen iki baglamda kullaniliyor ve ikisinde DOGRU
   * duzey farkli.
   *   - Genel akista gorunum yuvasi sayfanin TEK govdesi; panel yuvasi
   *     `display:none` oldugu icin oradaki `h1` yardimci teknolojiye
   *     hic ulasmiyor. Burada `h1` DOGRU, yoksa sayfa bassiz kalir.
   *   - Bana Ozel akisinda kabuk, yuvalarin DISINDA bir `h1` basiyor;
   *     burada da `h1` basmak iki ana yer isareti demek olurdu.
   * Bu yuzden duzey cagirana birakildi, bilesen icinde tahmin edilmiyor.
   */
  baslikDuzeyi?: 1 | 2;
}) {
  const Baslik = baslikDuzeyi === 1 ? "h1" : "h2";
  const lead = articles[0];
  const grid = articles.slice(1, 1 + GRID_MAX);
  const tail = articles.slice(1 + GRID_MAX);

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-10 sm:px-6">
      <Baslik className="sr-only-custom">
        İSO · İSOV Dış Kaynak İzleme Bülteni — Görsel Bülten
      </Baslik>

      {/* Filtre şeridi — panel görünümüyle aynı düzen (arama kutusu ana
          görünümde tek örnek kalsın diye burada tekrarlanmıyor). */}
      <section aria-label="Bülten filtreleri" className="border-b border-ink py-3">
        <RegionTabs state={state} />
        <div className="mt-3 flex flex-col gap-3">
          <BandFilter state={state} />
          <ActiveFilters state={state} />
        </div>
      </section>

      {articles.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {lead ? (
            <section className="pt-6">
              <SectionRule
                title="Günün Manşeti"
                right={`${formatNumber(total)} haber`}
              />
              <VisualLead article={lead} />
            </section>
          ) : null}

          {grid.length > 0 ? (
            <section className="mt-8">
              <SectionRule
                title="Görsel Akış"
                right={`${formatNumber(grid.length)} haber`}
              />
              <div className="gorsel-grid">
                {grid.map((a) => (
                  <VisualCard key={a.id} article={a} />
                ))}
              </div>
            </section>
          ) : null}

          {tail.length > 0 ? (
            <section className="mt-10">
              <SectionRule
                title="Bültenin Devamı"
                right={`${formatNumber(tail.length)} haber`}
              />
              <div className="gorsel-tail">
                {tail.map((a) => (
                  <CompactArticle key={a.id} article={a} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
