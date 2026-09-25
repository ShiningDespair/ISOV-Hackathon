/**
 * İSTATİSTİK ve ETİKETLER — /istatistik
 *
 * İki veri kaynağı, tek sayfa, TEK `h1`:
 *   1. `/stats/overview` → sayılar ve dağılımlar
 *   2. `/tags`           → "Etiketler" modülü (id="etiketler")
 *
 * Grafikler saf CSS/SVG'dir; harici grafik kütüphanesi kullanılmaz.
 *
 * SADELEŞTİRME KARARLARI (docs/SADELESTIRME.md §1, kullanıcı: "her yerde bir
 * şeyler var"):
 *
 *  a) GÖRÜNÜM YUVASI KALDIRILDI. Sayfa eskiden `panel` + `gazete` yuvalarını
 *     basıyordu; `html[data-view="gorsel"]/"kart"` iken globals.css tüm
 *     yuvaları gizlediği için sayfa BOŞ kalıyordu (dört görünümden ikisinde).
 *     Dahası gazete yuvası AYNI sayıları (toplam/kaynak/küme, günlük seri,
 *     band, bölge, tekilleştirme, kategori) ikinci kez basıyordu — "aynı
 *     sayıyı iki farklı kutuda gösterme" tekrarının birebir örneği. Tek
 *     mizanpaj: dört görünümde de çalışır, yazdırmada da aynısı basılır.
 *
 *  b) "Etiket" KPI kutucuğu KALDIRILDI. Etiket sayısı artık yalnızca
 *     Etiketler modülünün başlığında duruyor; iki yerde iki ayrı kaynaktan
 *     (stats.total_tags ve tags.length) aynı şeyi söylemek hem tekrar hem de
 *     tutarsızlık riskiydi.
 *
 *  c) 402 etiketin tamamını buluta basmak bir duvar üretiyordu. Bulut EN ÇOK
 *     KULLANILAN 40 etiketi gösterir; tam alfabetik dizin ve türlere göre
 *     kırılım `<details>` içinde, TALEP ÜZERİNE (CONTRACT.md).
 *
 * DÜRÜSTLÜK: iki uç birbirinden bağımsız çöker. Oturum yokluğu (401/403) ile
 * ucun yayında olmaması (404/501) AYRI cümlelerle söylenir; sayı yoksa "—",
 * sıfır uydurulmaz. Ham önem skoru hiçbir yerde gösterilmez.
 */

import Link from "next/link";
import type { Metadata } from "next";

import { getStatsOverview, getTags } from "@/lib/api";
import { hazirDegil, oturumGerekli } from "@/lib/api-me";
import {
  bandLabel,
  formatDateShort,
  formatNumber,
  humanize,
  regionLabel,
  toBuckets,
} from "@/lib/format";
import type { Tag } from "@/lib/types";

import { BarList, DailyBars, RatioBar, Sparkline, StatFigure } from "@/components/Charts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "İstatistik ve Etiketler",
  description:
    "Bölge ve önem bandı dağılımları, günlük seri, tekilleştirme oranı ve etiket dizini.",
};

/** Bulutta görünen etiket sayısı — geri kalanı tam dizinde. */
const BULUT = 40;

/** Tekilleştirme oranını 0..1 aralığına normalize eder. */
function normalizeRatio(stats: {
  dedup_ratio?: number | null;
  duplicates_removed?: number | null;
  total_articles?: number | null;
  unique_articles?: number | null;
}): number | null {
  if (typeof stats.dedup_ratio === "number" && !Number.isNaN(stats.dedup_ratio)) {
    return stats.dedup_ratio > 1 ? stats.dedup_ratio / 100 : stats.dedup_ratio;
  }
  const total = Number(stats.total_articles ?? 0);
  const dupes = Number(stats.duplicates_removed ?? 0);
  if (total > 0 && dupes > 0) return dupes / total;
  const unique = Number(stats.unique_articles ?? 0);
  if (total > 0 && unique > 0 && unique <= total) return 1 - unique / total;
  return null;
}

/** Etiketin kullanım sayısını normalize eder. */
function tagCount(tag: Tag): number {
  return Number(tag.usage_count ?? tag.article_count ?? 0) || 0;
}

/** Kullanım sayısına göre yazı boyutu (rem) — etiket bulutu ölçeği. */
function sizeFor(count: number, max: number): number {
  if (max <= 0) return 1;
  const ratio = count / max;
  return 0.95 + ratio * 1.15; // 0,95rem .. 2,10rem
}

/** Bölüm başlığı — `h2`, kural çizgisiyle. Kutu/çerçeve YOK. */
function Bolum({
  baslik,
  sag,
  children,
  genis = false,
}: {
  baslik: string;
  sag?: React.ReactNode;
  children: React.ReactNode;
  /** Izgarada tam satır kaplasın mı? */
  genis?: boolean;
}) {
  return (
    <section
      className={`birlesik-bolum${genis ? " birlesik-bolum-genis" : ""}`}
    >
      <div className="birlesik-alt-kural">
        <h2 className="u-kicker birlesik-alt-baslik">{baslik}</h2>
        {sag ? <span className="u-kicker birlesik-alt-sag">{sag}</span> : null}
      </div>
      {children}
    </section>
  );
}

/** Dürüst durum cümlesi. */
function DurumNotu({ children }: { children: React.ReactNode }) {
  return (
    <p className="birlesik-durum" role="status" aria-live="polite">
      {children}
    </p>
  );
}

/** 401/403 ile 404/501 ayrımını tek yerde cümleye çeviren yardımcı. */
function ucDurumu(
  ad: string,
  yol: string,
  status: number | undefined,
  hata: string,
): React.ReactNode {
  if (hazirDegil(status)) {
    return (
      <DurumNotu>
        {ad} ucu (<code className="birlesik-kod">{yol}</code>) henüz yayında
        değil.
      </DurumNotu>
    );
  }
  if (oturumGerekli(status)) {
    return (
      <DurumNotu>
        {ad} oturum gerektiriyor — uç çalışıyor, eksik olan giriş.{" "}
        <Link href="/giris?devam=/istatistik" className="u-link-underline">
          Giriş yapın
        </Link>
        .
      </DurumNotu>
    );
  }
  return <DurumNotu>{hata}</DurumNotu>;
}

export default async function IstatistikVeEtiketlerPage() {
  // İki uç PARALEL; biri hata verse diğeri beklemez ve sayfa yine dolu gelir.
  const [statsRes, tagsRes] = await Promise.all([getStatsOverview(), getTags()]);

  /* --- 1) İSTATİSTİK ---------------------------------------------- */

  let istatGovde: React.ReactNode;

  if (!statsRes.ok) {
    istatGovde = ucDurumu(
      "İstatistik",
      "/api/stats/overview",
      statsRes.status,
      statsRes.error,
    );
  } else {
    const stats = statsRes.data;

    const regions = toBuckets(stats.by_region, regionLabel);
    const bands = toBuckets(stats.by_band, bandLabel);
    const categories = toBuckets(stats.by_category, humanize);
    const daily = toBuckets(stats.daily ?? stats.daily_series, (key) =>
      formatDateShort(key),
    );

    const ratio = normalizeRatio(stats);
    const dailyValues = daily.map((d) => d.count);
    const totalFromRegions = regions.reduce((sum, r) => sum + r.count, 0);
    const totalArticles = stats.total_articles ?? totalFromRegions;

    istatGovde = (
      <>
        {/* Tek satırlık sayı şeridi — üç sayı, üç kutucuk, tekrar yok. */}
        <div className="birlesik-sayi-serit">
          <StatFigure
            label="Toplam Haber"
            value={formatNumber(totalArticles)}
            note="Tekilleştirilmiş kayıt sayısı"
          />
          <StatFigure
            label="Kaynak"
            value={formatNumber(stats.total_sources)}
            note="İzlenen açık kaynak"
          />
          <StatFigure
            label="Küme"
            value={formatNumber(stats.total_clusters)}
            note="Birleştirilmiş haber kümesi"
          />
        </div>

        <div className="birlesik-istat-izgara">
          <Bolum
            baslik="Günlük Haber Serisi"
            sag={daily.length > 0 ? `${daily.length} gün` : "—"}
            genis
          >
            <DailyBars data={daily} />
            {dailyValues.length > 1 ? (
              <div className="birlesik-egilim">
                <span className="u-kicker text-ink-faint">Eğilim</span>
                <Sparkline
                  values={dailyValues}
                  label="Günlük haber sayısı eğilimi"
                />
              </div>
            ) : null}
          </Bolum>

          <Bolum baslik="Önem Bandı Dağılımı">
            {/* Renk tek başına bilgi taşımaz: BarList her satıra adı ve
                sayıyı da yazar (WCAG 1.4.1). */}
            <BarList data={bands} accentKeys={["KRITIK"]} />
          </Bolum>

          <Bolum baslik="Bölge Dağılımı">
            <BarList data={regions} />
          </Bolum>

          <Bolum baslik="Kategori Dağılımı">
            <BarList data={categories} />
          </Bolum>

          <Bolum baslik="Tekilleştirme">
            {ratio !== null ? (
              <>
                <RatioBar ratio={ratio} label="Tekilleştirme Oranı" />
                <p className="u-body u-body-soft mt-2.5 text-[0.875rem] leading-snug">
                  Toplanan içeriğin bu oranı, aynı olayı bildiren mükerrer
                  yayın olarak tespit edilip tek kümede birleştirildi.
                </p>
              </>
            ) : (
              <DurumNotu>Tekilleştirme oranı henüz hesaplanmadı.</DurumNotu>
            )}
            {stats.last_collected_at ? (
              <p className="u-kicker birlesik-son-toplama">
                Son toplama: {formatDateShort(stats.last_collected_at)}
              </p>
            ) : null}
          </Bolum>
        </div>
      </>
    );
  }

  /* --- 2) ETİKETLER MODÜLÜ ---------------------------------------- */

  const tags = tagsRes.ok
    ? [...tagsRes.data].sort((a, b) => tagCount(b) - tagCount(a))
    : [];
  const max = tags.length > 0 ? tagCount(tags[0]!) : 0;
  const totalUsage = tags.reduce((sum, t) => sum + tagCount(t), 0);

  const alphabetical = [...tags].sort((a, b) =>
    (a.label || a.slug).localeCompare(b.label || b.slug, "tr"),
  );

  // Türe göre grupla (konu / sektör / kurum vb.)
  const byKind = new Map<string, Tag[]>();
  for (const tag of tags) {
    const kind = tag.kind?.trim() || "konu";
    const list = byKind.get(kind) ?? [];
    list.push(tag);
    byKind.set(kind, list);
  }

  let etiketGovde: React.ReactNode;

  if (!tagsRes.ok) {
    etiketGovde = ucDurumu(
      "Etiket dizini",
      "/api/tags",
      tagsRes.status,
      tagsRes.error,
    );
  } else if (tags.length === 0) {
    etiketGovde = (
      <DurumNotu>
        Henüz etiket yok. Toplama çalıştırıldığında etiketler burada
        listelenecek.
      </DurumNotu>
    );
  } else {
    etiketGovde = (
      <>
        <p className="u-body u-body-soft birlesik-etiket-girdi">
          Bir etikete tıklayınca bültene o etiketle süzülmüş olarak dönersiniz.
          Bulutta en çok kullanılan {formatNumber(Math.min(BULUT, tags.length))}{" "}
          etiket var; tamamı aşağıdaki dizinde.
        </p>

        <div className="birlesik-bulut">
          {tags.slice(0, BULUT).map((tag) => {
            const count = tagCount(tag);
            return (
              <Link
                key={tag.slug}
                href={`/?tag=${encodeURIComponent(tag.slug)}`}
                className="u-headline birlesik-bulut-oge"
                style={{ fontSize: `${sizeFor(count, max).toFixed(2)}rem` }}
                title={`${count} haberde kullanıldı`}
              >
                {tag.label || tag.slug}
                <span className="u-kicker birlesik-bulut-sayi">{count}</span>
              </Link>
            );
          })}
        </div>

        <details className="birlesik-tumu">
          <summary className="birlesik-tumu-ozet">
            Tam dizin ve türlere göre kırılım ({formatNumber(tags.length)})
          </summary>
          <div className="birlesik-tumu-govde">
            <div className="birlesik-alt-kural">
              <h3 className="u-kicker birlesik-alt-baslik">Alfabetik Dizin</h3>
              <span className="u-kicker birlesik-alt-sag">
                {formatNumber(totalUsage)} kullanım
              </span>
            </div>
            <ul className="birlesik-dizin">
              {alphabetical.map((tag) => (
                <li key={tag.slug}>
                  <Link
                    href={`/?tag=${encodeURIComponent(tag.slug)}`}
                    className="u-body u-link-underline birlesik-dizin-bag"
                  >
                    {tag.label || tag.slug}
                  </Link>
                  <span className="u-kicker birlesik-dizin-sayi">
                    {formatNumber(tagCount(tag))}
                  </span>
                </li>
              ))}
            </ul>

            <div className="birlesik-alt-kural birlesik-alt-kural-ust">
              <h3 className="u-kicker birlesik-alt-baslik">Türlere Göre</h3>
              <span className="u-kicker birlesik-alt-sag">
                {byKind.size} tür
              </span>
            </div>
            {[...byKind.entries()].map(([kind, list]) => (
              <section key={kind} className="birlesik-tur-grup">
                <h4 className="u-kicker birlesik-tur-baslik">
                  {humanize(kind)}{" "}
                  <span className="text-ink-faint">({list.length})</span>
                </h4>
                <div className="birlesik-cip-kume">
                  {list.slice(0, 40).map((tag) => (
                    <Link
                      key={tag.slug}
                      href={`/?tag=${encodeURIComponent(tag.slug)}`}
                      className="tag-chip"
                    >
                      {tag.label || tag.slug}
                      <span className="ml-1 text-ink-faint">
                        {tagCount(tag)}
                      </span>
                    </Link>
                  ))}
                </div>
                {list.length > 40 ? (
                  <p className="u-kicker birlesik-tur-kalan">
                    + {formatNumber(list.length - 40)} etiket daha (alfabetik
                    dizinde)
                  </p>
                ) : null}
              </section>
            ))}
          </div>
        </details>
      </>
    );
  }

  /* --- SAYFA ------------------------------------------------------- */

  return (
    <div className="birlesik-sayfa">
      <header className="birlesik-sayfa-ust">
        <h1 className="u-headline u-headline-lg">İstatistik</h1>
        <p className="u-body u-body-soft birlesik-sayfa-girdi">
          Toplama, tekilleştirme ve sınıflandırma sürecinin sayısal görünümü.
          Ham önem skoru gizli metriktir ve gösterilmez.
        </p>
      </header>

      <section className="birlesik-modul">{istatGovde}</section>

      {/* MODÜL — anchor: /istatistik#etiketler */}
      <section
        id="etiketler"
        className="birlesik-modul birlesik-modul-ayrik"
      >
        <div className="birlesik-modul-ust">
          <div>
            <p className="u-kicker u-kicker-accent">Dizin</p>
            <h2 className="u-headline birlesik-modul-baslik">Etiketler</h2>
          </div>
          <p className="u-kicker birlesik-modul-sag">
            {tagsRes.ok ? `${formatNumber(tags.length)} etiket` : "—"}
          </p>
        </div>
        {etiketGovde}
      </section>
    </div>
  );
}
