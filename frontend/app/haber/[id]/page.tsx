/**
 * HABER DETAYI.
 * Büyük serif başlık, kicker, özet kutusu, anahtar maddeler, varlıklar,
 * etiketler ve kaynak bağlantısı.
 *
 * Kritik demo bölümü: haber bir kümenin temsilcisiyse
 * "Bu haberi doğrulayan diğer N kaynak" listesi — tekilleştirmenin
 * görünür kanıtı.
 */

import Link from "next/link";
import type { Metadata } from "next";

import { getArticle, getCluster } from "@/lib/api";
import {
  formatDate,
  formatDateTime,
  humanize,
  isoDate,
  regionLabel,
  truncate, kaynakAdiDili } from "@/lib/format";
import type { ClusterMember } from "@/lib/types";

import { BandBadge, RegionBadge } from "@/components/BandBadge";
import { NewspaperMasthead } from "@/components/Masthead";
import { PrintButton } from "@/components/PrintButton";
import { DataUnavailable, SectionRule } from "@/components/States";
import { NewspaperView } from "@/components/ViewSlot";
import { ArticleImage } from "@/components/ArticleImage";
import { ArticleActions } from "@/components/ArticleActions";
import { paylasilacak } from "@/lib/api-me";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = Promise<{ id: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id } = await params;
  const res = await getArticle(id);
  if (!res.ok) return { title: "Haber" };
  return {
    title: res.data.title,
    description: truncate(res.data.summary ?? "", 160),
  };
}

/** Kaynak bağlantısının görünen alan adı. */
function hostOf(url?: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export default async function ArticlePage({ params }: { params: Params }) {
  const { id } = await params;
  const res = await getArticle(id);

  if (!res.ok) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6">
        <DataUnavailable message={res.error} />
      </div>
    );
  }

  const article = res.data;

  // Küme üyeleri detayda gömülü gelmezse /clusters/:id ile tamamla.
  let members: ClusterMember[] =
    article.cluster_members ?? article.members ?? [];

  if (members.length === 0 && article.cluster?.id) {
    const clusterRes = await getCluster(article.cluster.id);
    if (clusterRes.ok) members = clusterRes.data.members ?? [];
  }

  // Haberin kendisini "diğer kaynaklar" listesinden çıkar.
  const others = members.filter((m) => Number(m.id) !== Number(article.id));

  const entities = Object.entries(article.entities ?? {}).filter(
    ([, values]) => Array.isArray(values) && values.length > 0,
  );

  const tags = article.tags ?? [];
  const keyPoints = article.key_points ?? [];

  /* Ortak içerik parçaları — iki görünüm de aynı veriyi kullanır. */

  // Kaynak adının yanında haberin GERÇEK yayın adresi. NEDEN: basın müdürü
  // testi "İSO PMI'ı Ticaret Gazetesi'ne atfedilmiş" dedi; ölçüldü, 131
  // haberin 131'inde URL alan adı kaynağın ana sayfasıyla aynı — yani atıf
  // doğru, haber gazetenin İSO verisini aktaran yazısı. Okurun bunu kendisi
  // görmesi için alan adı yazılır. Adres kaynağın sitesinde DEĞİLSE (bugün
  // 0 haber) kaynak yalnızca aktarandır ve bu açıkça söylenir. Birincil
  // kaynak (İSO, TÜİK) alanı veri modelinde yok; tahminle yazılmaz.
  const articleHost = hostOf(article.url);
  const homeHost = hostOf(article.source?.homepage_url);
  const hostDiffers =
    Boolean(articleHost && homeHost) &&
    articleHost !== homeHost &&
    !articleHost.endsWith(`.${homeHost}`) &&
    !homeHost.endsWith(`.${articleHost}`);

  const kickerLine = (
    <p className="u-kicker flex flex-wrap items-center gap-x-2 gap-y-1">
      {article.source?.name ? (
        <span className="text-ink" lang={kaynakAdiDili(article.source)}>{article.source.name}</span>
      ) : null}
      {articleHost ? (
        <>
          <span aria-hidden="true" className="text-ink-faint">·</span>
          <span className="normal-case tracking-normal" title="Haberin yayımlandığı adres">
            {hostDiffers ? `Aktaran · asıl yayın: ${articleHost}` : articleHost}
          </span>
        </>
      ) : null}
      <span aria-hidden="true" className="text-ink-faint">·</span>
      <span>{regionLabel(article.region)}</span>
      {article.published_at ? (
        <>
          <span aria-hidden="true" className="text-ink-faint">·</span>
          <time dateTime={isoDate(article.published_at)}>
            {formatDateTime(article.published_at)}
          </time>
        </>
      ) : null}
      {article.category ? (
        <>
          <span aria-hidden="true" className="text-ink-faint">·</span>
          <Link
            href={`/?category=${encodeURIComponent(article.category)}`}
            className="u-link-underline"
          >
            {humanize(article.category)}
          </Link>
        </>
      ) : null}
    </p>
  );

  const sourceLink = article.url ? (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="u-kicker inline-block border border-ink px-3 py-1.5 text-ink transition-colors hover:bg-ink hover:text-paper"
    >
      Kaynağa Git{hostOf(article.url) ? ` · ${hostOf(article.url)}` : ""} ↗
    </a>
  ) : null;

  /** Tekilleştirme kanıtı bölümü — demoda kritik. */
  const clusterSection =
    others.length > 0 ? (
      <section className="mt-8" aria-labelledby="dogrulama-basligi">
        <div className="border-t-[3px] border-double border-ink pt-3">
          <h2 id="dogrulama-basligi" className="u-kicker u-kicker-accent">
            Tekilleştirme Kanıtı
          </h2>
          <h3 className="u-headline u-headline-md mt-1">
            Bu haberi doğrulayan diğer {others.length} kaynak
          </h3>
          <p className="u-body u-body-soft mt-1.5 text-[0.9rem]">
            Aynı olayı bildiren yayınlar tek bir kümede birleştirildi; bültende
            yalnızca temsilci haber gösteriliyor.
          </p>
        </div>

        <ol className="mt-4 divide-y divide-rule border-t border-rule">
          {others.map((member, index) => (
            <li key={member.id} className="flex gap-4 py-3">
              <span className="u-headline w-7 shrink-0 text-[1.35rem] font-black leading-none text-ink-faint tabular-nums">
                {String(index + 2).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="u-kicker">
                  <span lang={kaynakAdiDili(member.source)}>
                    {member.source?.name ?? "Bilinmeyen kaynak"}
                  </span>
                  {member.published_at ? (
                    <>
                      <span aria-hidden="true" className="mx-1.5 text-ink-faint">·</span>
                      <time dateTime={isoDate(member.published_at)}>
                        {formatDate(member.published_at)}
                      </time>
                    </>
                  ) : null}
                </p>
                <h4 className="u-headline u-headline-sm mt-1">
                  <Link href={`/haber/${member.id}`} className="u-link-underline">
                    {member.title}
                  </Link>
                </h4>
                {member.url ? (
                  <a
                    href={member.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="u-kicker mt-1 inline-block text-ink-faint hover:text-accent"
                  >
                    {hostOf(member.url)} ↗
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>
    ) : null;

  return (
    <>
      {/* ---------------- EKRAN GÖVDESİ (Panel · Görsel · Kart) ----------------
          GÖRÜNÜM YUVASI DEĞİL, bilinçli olarak. Önceden bu gövde `<PanelView>`
          içindeydi ve sayfa yalnızca Panel + Gazete yuvası basıyordu. Görsel ya
          da Kart görünümünde globals.css ikisini de gizliyordu, yani haber
          sayfası BEMBEYAZ açılıyordu. Pozisyona göre açılış görünümü gelince
          (üst yönetim → Görsel, diğer yedi pozisyon → Kart) bu, HİÇBİR üye
          rolünün varsayılan görünümle haber okuyamaması demekti — iki persona
          testinde gerçek tarayıcıyla ölçüldü: `main` metin uzunluğu 0.
          Gövdeyi üç yuvaya ayrı ayrı basmak aynı `id`leri üç kez üretirdi;
          bunun yerine tek kopya yuvasız basılıyor ve yalnızca Gazete
          görünümünde ve yazdırmada gizleniyor (app/css/haber.css). */}
      <div className="ekran-govdesi">
        <div className="mx-auto w-full max-w-[1440px] px-4 pb-12 sm:px-6">
          <nav aria-label="Geri" className="border-b border-rule py-3">
            <Link href="/" className="u-kicker u-link-underline">
              ← Bültene Dön
            </Link>
          </nav>

          {/* Görsel görünümde haberin kendi görseli ya da kaynak amblemi
              başlığın üstünde durur; diğer görünümlerde gizli. */}
          <div className="haber-gorsel mt-5 max-w-[960px]">
            <ArticleImage
              src={article.image_url}
              alt={article.title}
              seed={article.id}
              sourceName={article.source?.name}
              label={humanize(article.category ?? "") || regionLabel(article.region)}
              fallbackInitials={regionLabel(article.region)}
              ratio="lead"
              sourceSlug={article.source?.slug}
              sourceType={article.source?.source_type}
              countryCode={article.source?.country_code}
              articleUrl={article.url}
              publishedAt={article.published_at}
            />
          </div>

          <div className="grid grid-cols-1 gap-x-10 gap-y-8 pt-6 lg:grid-cols-12">
            {/* Ana sütun */}
            <article className="lg:col-span-8">
              <header>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <BandBadge band={article.importance_band} />
                  <RegionBadge region={article.region} />
                  {article.cluster && (article.cluster.member_count ?? 0) > 1 ? (
                    <span className="u-kicker text-ink-faint">
                      {article.cluster.member_count} kaynak doğruladı
                    </span>
                  ) : null}
                  {/* Detayda etiketli (kompakt değil): haberi okuyan kişi
                      onu iletmeye en yakın anda. */}
                  <ArticleActions haber={paylasilacak(article)} className="ml-auto" />
                </div>

                <h1 className="u-headline u-headline-xl">{article.title}</h1>

                <div className="mt-4 border-t border-rule pt-3">
                  {kickerLine}
                </div>
              </header>

              {/* Özet kutusu */}
              {article.summary ? (
                <section
                  aria-label="Özet"
                  className="mt-6 border-y-[3px] border-double border-ink bg-surface px-5 py-4"
                >
                  <h2 className="u-kicker u-kicker-accent">Yönetici Özeti</h2>
                  <p className="u-body mt-2 text-[1.0625rem] leading-[1.6]">
                    {article.summary}
                  </p>
                </section>
              ) : null}

              {/* Anahtar maddeler */}
              {keyPoints.length > 0 ? (
                <section className="mt-7" aria-labelledby="anahtar-basligi">
                  <SectionRule title="Anahtar Maddeler" />
                  <ul className="space-y-2.5">
                    {keyPoints.map((point, i) => (
                      <li key={i} className="u-body flex gap-3 leading-snug">
                        <span
                          aria-hidden="true"
                          className="mt-[0.35rem] h-[6px] w-[6px] shrink-0 bg-accent"
                        />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                  <h2 id="anahtar-basligi" className="sr-only-custom">
                    Anahtar maddeler
                  </h2>
                </section>
              ) : null}

              {/* Gövde metni (varsa) */}
              {article.body ? (
                <section className="mt-7">
                  <SectionRule title="Haber Metni" />
                  <div className="u-body space-y-3.5 text-[1.0625rem] leading-[1.6]">
                    {article.body
                      .split(/\n{1,}/)
                      .map((p) => p.trim())
                      .filter(Boolean)
                      .map((p, i) => (
                        <p key={i}>{p}</p>
                      ))}
                  </div>
                </section>
              ) : null}

              <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-ink pt-4">
                {sourceLink}
                <PrintButton label="PDF" />
              </div>

              {clusterSection}
            </article>

            {/* Sağ dar kolon */}
            <aside className="lg:col-span-4 lg:border-l lg:border-rule lg:pl-8">
              {tags.length > 0 ? (
                <section className="mb-7">
                  <SectionRule title="Etiketler" />
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <Link
                        key={tag.slug}
                        href={`/?tag=${encodeURIComponent(tag.slug)}`}
                        className="tag-chip"
                      >
                        {tag.label || tag.slug}
                      </Link>
                    ))}
                  </div>
                </section>
              ) : null}

              {entities.length > 0 ? (
                <section className="mb-7">
                  <SectionRule title="Varlıklar" />
                  <dl className="space-y-3">
                    {entities.map(([kind, values]) => (
                      <div key={kind} className="border-b border-rule pb-2.5">
                        <dt className="u-kicker text-ink-faint">
                          {humanize(kind)}
                        </dt>
                        <dd className="u-body mt-1 text-[0.95rem] leading-snug">
                          {values.join(" · ")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : null}

              <section className="mb-7">
                <SectionRule title="Künye" />
                <dl className="space-y-2">
                  <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-1.5">
                    <dt className="u-kicker">Kaynak</dt>
                    <dd className="u-body text-right text-[0.9rem]" lang={kaynakAdiDili(article.source)}>
                      {article.source?.name ?? "—"}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-1.5">
                    <dt className="u-kicker">Kaynak Türü</dt>
                    <dd className="u-body text-right text-[0.9rem]">
                      {humanize(article.source?.source_type) || "—"}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-1.5">
                    <dt className="u-kicker">Bölge</dt>
                    <dd className="u-body text-right text-[0.9rem]">
                      {regionLabel(article.region)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-1.5">
                    <dt className="u-kicker">Duygu</dt>
                    <dd className="u-body text-right text-[0.9rem]">
                      {humanize(article.sentiment) || "—"}
                    </dd>
                  </div>
                  {article.cluster ? (
                    <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-1.5">
                      <dt className="u-kicker">Küme</dt>
                      <dd className="u-body text-right text-[0.9rem] tabular-nums">
                        #{article.cluster.id} · {article.cluster.member_count ?? 1}{" "}
                        üye
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            </aside>
          </div>
        </div>
      </div>

      {/* ---------------- GAZETE GÖRÜNÜMÜ ---------------- */}
      <NewspaperView>
        <div className="paper-texture min-h-screen w-full">
          <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-8">
            <NewspaperMasthead
              subtitle="Haber Nüshası"
              date={article.published_at}
            />

            <div className="no-print mb-5 flex items-center justify-between gap-3">
              <Link href="/" className="u-kicker u-link-underline">
                ← Bültene Dön
              </Link>
              <PrintButton />
            </div>

            <article>
              <p className="u-kicker u-kicker-accent text-center">
                {regionLabel(article.region)}
                {article.category ? ` · ${humanize(article.category)}` : ""}
              </p>

              <h1 className="u-headline mx-auto mt-2 max-w-4xl text-center text-[clamp(1.6rem,5vw,3.4rem)] font-black leading-[1] tracking-[-0.02em]">
                {article.title}
              </h1>

              <p className="u-kicker mt-3 border-y border-rule py-2 text-center">
                <span lang={kaynakAdiDili(article.source)}>{article.source?.name ?? "Kaynak"}</span>
                {article.published_at ? (
                  <>
                    {" · "}
                    <time dateTime={isoDate(article.published_at)}>
                      {formatDate(article.published_at)}
                    </time>
                  </>
                ) : null}
                {others.length > 0
                  ? ` · ${others.length + 1} kaynak doğruladı`
                  : ""}
              </p>

              <div className="newspaper-columns mt-5">
                {article.summary ? (
                  <p className="u-body drop-cap newspaper-justify mb-3 text-[0.9375rem] leading-[1.5]">
                    {article.summary}
                  </p>
                ) : null}

                {keyPoints.length > 0 ? (
                  <div className="newspaper-item">
                    <h2 className="newspaper-folio mb-1.5">Anahtar Maddeler</h2>
                    <ul className="u-body space-y-1 text-[0.875rem] leading-snug">
                      {keyPoints.map((p, i) => (
                        <li key={i} className="flex gap-2">
                          <span aria-hidden="true">—</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {article.body
                  ? article.body
                      .split(/\n{1,}/)
                      .map((p) => p.trim())
                      .filter(Boolean)
                      .map((p, i) => (
                        <p
                          key={i}
                          className="u-body newspaper-justify mb-2.5 text-[0.875rem] leading-[1.48]"
                        >
                          {p}
                        </p>
                      ))
                  : null}

                {others.length > 0 ? (
                  <aside className="newspaper-item border-t border-ink pt-2">
                    <h2 className="newspaper-folio mb-1.5">
                      Doğrulayan Diğer {others.length} Kaynak
                    </h2>
                    <ul className="u-body space-y-1.5 text-[0.8125rem] leading-snug">
                      {others.map((m) => (
                        <li key={m.id}>
                          <Link href={`/haber/${m.id}`}>
                            <strong className="font-semibold" lang={kaynakAdiDili(m.source)}>
                              {m.source?.name ?? "Kaynak"}:
                            </strong>{" "}
                            {m.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </aside>
                ) : null}

                {entities.length > 0 ? (
                  <aside className="newspaper-item border-t border-ink pt-2">
                    <h2 className="newspaper-folio mb-1.5">Varlıklar</h2>
                    <dl className="u-body text-[0.8125rem] leading-snug">
                      {entities.map(([kind, values]) => (
                        <div key={kind} className="mb-1">
                          <dt className="inline font-semibold">
                            {humanize(kind)}:{" "}
                          </dt>
                          <dd className="inline">{values.join(", ")}</dd>
                        </div>
                      ))}
                    </dl>
                  </aside>
                ) : null}

                {article.url ? (
                  <p className="newspaper-item u-kicker">
                    <a href={article.url} target="_blank" rel="noopener noreferrer">
                      Kaynak: {hostOf(article.url)}
                    </a>
                  </p>
                ) : null}
              </div>
            </article>
          </div>
        </div>
      </NewspaperView>
    </>
  );
}
