/**
 * RAPORLAR ve DEĞİŞİKLİKLER — /raporlar
 *
 * İki modül, tek sayfa, TEK `h1`:
 *   1. "Değişiklikler"  (id="degisiklikler")  — üstte, kasıtlı olarak ÇOK KISA
 *   2. "Rapor Arşivi"   (id="arsiv")          — altında, bugünkü içerikle
 *
 * NEDEN ÜSTTE VE NEDEN KISA: kullanıcının en büyük şikâyeti ilgi süresinin
 * bültene yetmemesi. Bülteni yeniden taramak yerine "son ziyaretinden beri
 * 4 şey" demek en yüksek kaldıraçlı çözüm. Bu yüzden varsayılan yüzey en
 * fazla BEŞ tek satırlık kalem; tarih/tür süzgeçleri ve tam liste
 * `<details>` içinde, TALEP ÜZERİNE gelir (CONTRACT.md: detay talep üzerine).
 *
 * GÖRÜNÜM YUVASI KULLANILMIYOR (bilinçli sadeleştirme):
 * Bu sayfa eskiden yalnızca `panel` ve `gazete` yuvalarını basıyordu;
 * `html[data-view="gorsel"]` ya da `"kart"` iken globals.css tüm yuvaları
 * gizlediği için sayfa BOŞ kalıyordu (dört görünümden ikisinde). Ayrıca
 * gazete yuvası aynı rapor listesini ikinci kez, farklı tipografiyle
 * basıyordu — "her yerde bir şeyler var" şikâyetinin tam örneği. Tek
 * mizanpaj: dört görünümde de çalışır, yazdırmada da aynısı basılır.
 * Raporun gazete mizanpajı zaten rapor DETAYINDA (`/raporlar/[id]`) duruyor.
 *
 * DÜRÜSTLÜK: iki modül birbirinden bağımsız çöker. Rapor ucu 401 dönerken
 * değişiklikler modülü görünür kalır ve tersi. Oturum yokluğu (401/403) ile
 * ucun yayında olmaması (404/501) AYRI cümlelerle söylenir; sayı yoksa "—".
 */

import Link from "next/link";
import type { Metadata } from "next";

import { getReports } from "@/lib/api";
import {
  CHANGE_TYPE_LABEL,
  getChangesAll,
  hazirDegil,
  normalizeChangeType,
  oturumGerekli,
  TEKNIK_TUR,
} from "@/lib/api-me";
import { formatDate, formatNumber, humanize, isoDate, truncate } from "@/lib/format";
import type { Report } from "@/lib/types";

import {
  DateRangeChip,
  DateRangeFilter,
  gecerliGun,
  tarihAraligiEtiketi,
  withState,
  type DateFilterState,
} from "@/components/DateRangeFilter";
import { ChangeList } from "@/components/changes/ChangeList";
import { ChangeRow } from "@/components/changes/ChangeRow";
import { ChangeTypeFilter } from "@/components/changes/ChangeTypeFilter";
import { PdfDownloadLink } from "@/components/PrintButton";
import { SinceLastVisit } from "@/components/changes/SinceLastVisit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Raporlar ve Değişiklikler",
  description:
    "Bültende ne değişti ve dönemsel yönetici özetleri — tek sayfada, üstte kısa değişiklik dökümü.",
};

/** Modüllerin ve süzgeç bağlantılarının tabanı. */
const BASE = "/raporlar";
/** Varsayılan yüzeyde görünen kalem sayısı — kasıtlı olarak küçük. */
const KISA = 5;
/** Tam listede en çok kaç sayfa (×100, backend MAX_LIMIT) çekilir. */
const EN_COK_SAYFA = 5;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value && value.trim() !== "" ? value : undefined;
}

/* ------------------------------------------------------------------ */
/* Rapor yardımcıları (eski /raporlar sayfasından aynen taşındı)       */
/* ------------------------------------------------------------------ */

/** Rapor başlığı yoksa dönemden üret. */
function titleOf(report: Report): string {
  if (report.title?.trim()) return report.title;
  const period = humanize(report.period_type) || "Dönemsel";
  const start = formatDate(report.period_start);
  const end = formatDate(report.period_end);
  return `${period} Bülten Raporu · ${start} – ${end}`;
}

function summaryOf(report: Report): string {
  return report.executive_summary ?? report.summary ?? "";
}

/**
 * Rapordaki haber sayısı; bilinmiyorsa `null` ("—" basılır, 0 uydurulmaz).
 * Ölçülen hata: arşiv kartı "0 HABER" yazıyordu, rapor 40 haber içeriyor —
 * liste ucu sayıyı `item_count` adıyla veriyor, burada yalnızca
 * `article_count` okunuyordu (Selin P1-8, Burak P2-1).
 */
function countOf(report: Report): number | null {
  if (typeof report.article_count === "number") return report.article_count;
  const itemCount = (report as { item_count?: unknown }).item_count;
  if (typeof itemCount === "number") return itemCount;
  const fromSections = (report.sections ?? []).reduce(
    (sum, s) => sum + (s.articles?.length ?? s.items?.length ?? 0),
    0,
  );
  const n = fromSections || (report.articles?.length ?? 0);
  return n > 0 ? n : null;
}

/* ------------------------------------------------------------------ */
/* Sayfa içi ortak parçalar                                            */
/* ------------------------------------------------------------------ */

/**
 * Modül başlığı. `h2` burada; alt etiketler `h3`. Ekstra kutu/çerçeve YOK —
 * modülleri yalnızca bir kural çizgisi ayırır.
 */
function ModulBasligi({
  ustluk,
  baslik,
  sag,
}: {
  ustluk: string;
  baslik: string;
  sag?: React.ReactNode;
}) {
  return (
    <div className="birlesik-modul-ust">
      <div>
        <p className="u-kicker u-kicker-accent">{ustluk}</p>
        <h2 className="u-headline birlesik-modul-baslik">{baslik}</h2>
      </div>
      {sag ? <p className="u-kicker birlesik-modul-sag">{sag}</p> : null}
    </div>
  );
}

/** Modül içi alt etiket — kural çizgisiyle, `h3` seviyesinde. */
function AltKural({ baslik, sag }: { baslik: string; sag?: React.ReactNode }) {
  return (
    <div className="birlesik-alt-kural">
      <h3 className="u-kicker birlesik-alt-baslik">{baslik}</h3>
      {sag ? <span className="u-kicker birlesik-alt-sag">{sag}</span> : null}
    </div>
  );
}

/** Dürüst durum cümlesi — boş/hatalı/yayında değil hâllerinin tek biçimi. */
function DurumNotu({ children }: { children: React.ReactNode }) {
  return (
    <p className="birlesik-durum" role="status" aria-live="polite">
      {children}
    </p>
  );
}

export default async function RaporlarVeDegisikliklerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;

  // Tür parametresi ENUM dışıysa yok sayılır — uydurma süzgeç gösterilmez.
  const tur = normalizeChangeType(one(sp.type));
  const state: DateFilterState = {
    from: gecerliGun(one(sp.from)),
    to: gecerliGun(one(sp.to)),
    type: tur ?? undefined,
  };
  const suzgecVar = Boolean(state.from || state.to || state.type);

  // İki uç PARALEL çağrılır; biri hata verse diğeri beklemez.
  const [degisRes, raporRes] = await Promise.all([
    // from/to backend'e AYNEN gider; uygulanması backend'in işi (WP2).
    getChangesAll(
      { from: state.from, to: state.to, type: state.type },
      EN_COK_SAYFA,
    ),
    getReports(),
  ]);

  const aralik = tarihAraligiEtiketi(state.from, state.to);

  /* --- 1) DEĞİŞİKLİKLER MODÜLÜ ------------------------------------ */

  /*
   * TEKNİK GÜRÜLTÜ VARSAYILANDA GİZLİ. Ölçüm: 235 kaydın 115'i "Özet
   * güncellendi — içerik değişmedi" ve kısa dökümün 5 satırının 5'ini
   * dolduruyordu. Tür süzgeci YOKKEN bu tür listeden ve sayıdan düşülür;
   * kaç kaydın gizlendiği hemen altında söylenir ve tek tıkla görülebilir.
   * Kullanıcı türü AÇIKÇA seçerse (tür süzgeci) hiçbir şey gizlenmez.
   * Süzme sırayı korur (filter), yeniden sıralama yapılmaz.
   */
  const teknikGizli = !state.type;
  const hamKayitlar = degisRes.ok ? degisRes.data.data : [];
  const kayitlar = teknikGizli
    ? hamKayitlar.filter((k) => normalizeChangeType(k.change_type) !== TEKNIK_TUR)
    : hamKayitlar;
  const teknikSayisi = degisRes.ok && teknikGizli
    ? degisRes.data.counts[TEKNIK_TUR] ??
      hamKayitlar.length - kayitlar.length
    : 0;
  const degisToplam = degisRes.ok
    ? Math.max(0, (degisRes.data.total || hamKayitlar.length) - teknikSayisi)
    : null;
  const listeEksik = degisRes.ok && !degisRes.data.complete;
  const teknikHedef = `${withState(state, { type: TEKNIK_TUR }, BASE)}#degisiklikler`;

  // Sayı yoksa "—" — sıfır uydurulmaz.
  const degisSag = degisToplam === null
    ? "—"
    : `${formatNumber(degisToplam)} kayıt${aralik ? ` · ${aralik}` : ""}`;

  /** "115 teknik özet güncellemesi gizlendi · göster" — dürüst sayım. */
  const teknikNotu =
    teknikSayisi > 0 ? (
      <p className="tarih-teknik-not u-kicker">
        {formatNumber(teknikSayisi)} teknik özet güncellemesi gizlendi
        <span className="sr-only"> (haberin özeti yenilendi, içerik değişmedi)</span>
        {" · "}
        <Link href={teknikHedef} className="u-link-underline">
          Göster
        </Link>
      </p>
    ) : null;

  const suzgecler = (
    <div className="degis-filtre-blok">
      <DateRangeFilter state={state} basePath={BASE} className="degis-tarih-sag" />
      <ChangeTypeFilter
        state={state}
        basePath={BASE}
        counts={degisRes.ok ? degisRes.data.counts : undefined}
        /* Sayılar yalnızca tür süzgeci YOKKEN gösterilir: süzgeçliyken sorgu
           tek türü döndürür, diğer türlerin sayısı bilinmiyor demektir ve
           "0" basmak yanlış olur. */
        showCounts={
          degisRes.ok &&
          !state.type &&
          (!degisRes.data.countsFromList ||
            degisRes.data.data.length >= degisRes.data.total)
        }
        teknikGizli={teknikGizli}
      />
      {suzgecVar ? (
        <div className="degis-cipler">
          <span className="u-kicker text-ink-faint">Etkin Süzgeçler</span>
          <DateRangeChip state={state} basePath={BASE} />
          {state.type && tur ? (
            <Link
              href={`${BASE}?${new URLSearchParams({
                tumu: "1",
                ...(state.from ? { from: state.from } : {}),
                ...(state.to ? { to: state.to } : {}),
              }).toString()}#degisiklikler`}
              className="tag-chip"
              title="Tür süzgecini kaldır"
            >
              Tür: {CHANGE_TYPE_LABEL[tur]} <span aria-hidden="true">×</span>
              <span className="sr-only-custom"> süzgecini kaldır</span>
            </Link>
          ) : null}
          {/* Temizlerken geniş görünümde KAL: kullanıcı süzgeci
              kaldırmak istiyor, listeyi kapatmak değil. */}
          <Link
            href={`${BASE}?tumu=1#degisiklikler`}
            className="u-kicker u-link-underline text-accent"
          >
            Tümünü Temizle
          </Link>
        </div>
      ) : null}
    </div>
  );

  /** Kayıt yokken basılacak cümle — süzgeç varsa farklı, dürüst. */
  const bosCumle = suzgecVar
    ? "Seçili aralıkta ve türde değişiklik kaydı yok. Aralığı genişletmeyi ya da tür süzgecini kaldırmayı deneyin."
    : "Bu korpusta henüz değişiklik kaydı yok. Yeni toplama çalıştığında yeni haberler, büyüyen kümeler ve dosya gelişmeleri burada satır satır görünür.";

  /**
   * GENİŞ Mİ? Genişleme sinyali URL'de taşınır, `<details>` ile DEĞİL.
   *
   * Gerekçe ölçülebilir bir kusuru önlüyor: `<details>` içine tam listeyi
   * koyunca ilk beş kalem hem üstteki kısa listede hem açılan tam listede
   * görünüyordu — aynı satırın iki kez basılması tam da kullanıcının
   * şikâyet ettiği kalabalık. Bağlantı ile genişletmek (sözleşmede izinli
   * ikinci seçenek) tekrarı tamamen kaldırır, JS gerektirmez, adres
   * paylaşılabilir olur.
   *
   * Süzgeç etkinken zorunlu olarak geniş: kullanıcı süzdüğü sonucu
   * görmek ister. NOT: tür şeridindeki "Tümü" bağlantısı (tarih de yoksa)
   * URL'i `/raporlar`a indirger ve görünüm kısa hâle döner; `withState`
   * yalnızca süzgeç anahtarlarını taşıyor ve o yardımcı başka ajanın
   * dosyasında. "Tümünü göster" bağlantısı hemen altta durduğu için
   * kullanıcı tek tıkla geri genişletir.
   */
  const genis = suzgecVar || one(sp.tumu) === "1";
  const genisHedef = `${BASE}?tumu=1#degisiklikler`;
  const kisaHedef = `${BASE}#degisiklikler`;

  let degisGovde: React.ReactNode;

  if (!degisRes.ok && hazirDegil(degisRes.status)) {
    // Uç nokta yok: "bozuk" değil, "henüz yok". Ayrım kullanıcı için önemli.
    degisGovde = (
      <DurumNotu>
        Değişiklik ucu (<code className="birlesik-kod">/api/changes</code>)
        henüz yayında değil. Yayına alındığında son değişiklikler burada satır
        satır listelenecek.
      </DurumNotu>
    );
  } else if (!degisRes.ok && oturumGerekli(degisRes.status)) {
    // Oturum yokluğu AYRI cümle: uç çalışıyor, eksik olan kimlik.
    degisGovde = (
      <DurumNotu>
        Değişiklik dökümü oturum gerektiriyor — uç çalışıyor, eksik olan giriş.{" "}
        <Link href="/giris?devam=/raporlar" className="u-link-underline">
          Giriş yapın
        </Link>
        .
      </DurumNotu>
    );
  } else if (!degisRes.ok) {
    degisGovde = <DurumNotu>{degisRes.error}</DurumNotu>;
  } else if (genis) {
    /* GENİŞ: süzgeçler + tam liste. Kısa liste BASILMAZ — tekrar olmaz. */
    degisGovde = (
      <>
        {suzgecler}
        {kayitlar.length > 0 ? (
          <>
            <p className="degis-toplam u-kicker">
              {formatNumber(degisToplam ?? kayitlar.length)} kayıt
              {aralik ? ` · ${aralik}` : ""}
              {listeEksik && (degisToplam ?? 0) > kayitlar.length
                ? ` · ilk ${formatNumber(kayitlar.length)} gösteriliyor`
                : ""}
            </p>
            {teknikNotu}
            {/* Gün başlıkları h3: modülün başlığı h2. */}
            <ChangeList items={kayitlar} basligiSeviyesi="h3" />
          </>
        ) : (
          <>
            <DurumNotu>{bosCumle}</DurumNotu>
            {teknikNotu}
          </>
        )}
        <p className="birlesik-genislet">
          <Link href={kisaHedef} className="u-kicker u-link-underline">
            ← Kısa döküme dön
          </Link>
        </p>
      </>
    );
  } else {
    /* KISA (VARSAYILAN): en fazla beş tek satırlık kalem, süzgeç yok. */
    const ilkler = kayitlar.slice(0, KISA);
    degisGovde = (
      <>
        {ilkler.length > 0 ? (
          <ul className="degis-satirlar birlesik-kisa-liste">
            {ilkler.map((item, i) => (
              <ChangeRow
                key={`${item.id ?? item.change_key ?? "k"}-${i}`}
                item={item}
              />
            ))}
          </ul>
        ) : (
          <DurumNotu>{bosCumle}</DurumNotu>
        )}
        {teknikNotu}
        {(degisToplam ?? 0) > ilkler.length ? (
          <p className="birlesik-genislet">
            <Link href={genisHedef} className="u-kicker u-link-underline">
              Tümünü göster ve süz ({formatNumber(degisToplam ?? 0)}) →
            </Link>
          </p>
        ) : null}
      </>
    );
  }

  /* --- 2) RAPOR ARŞİVİ MODÜLÜ ------------------------------------- */

  const raporlar = raporRes.ok
    ? [...raporRes.data].sort((a, b) => {
        const ta = new Date(a.period_end ?? a.created_at ?? 0).getTime();
        const tb = new Date(b.period_end ?? b.created_at ?? 0).getTime();
        return tb - ta;
      })
    : [];
  const [sonRapor, ...eskiler] = raporlar;

  let raporGovde: React.ReactNode;

  if (!raporRes.ok && hazirDegil(raporRes.status)) {
    raporGovde = (
      <DurumNotu>
        Rapor ucu (<code className="birlesik-kod">/api/reports</code>) henüz
        yayında değil.
      </DurumNotu>
    );
  } else if (!raporRes.ok && oturumGerekli(raporRes.status)) {
    raporGovde = (
      <DurumNotu>
        Rapor arşivi oturum gerektiriyor.{" "}
        <Link href="/giris?devam=/raporlar" className="u-link-underline">
          Giriş yapın
        </Link>
        .
      </DurumNotu>
    );
  } else if (!raporRes.ok) {
    raporGovde = <DurumNotu>{raporRes.error}</DurumNotu>;
  } else if (raporlar.length === 0) {
    raporGovde = (
      <DurumNotu>
        Henüz rapor üretilmedi. Dönemsel rapor üretildiğinde arşivde burada
        listelenir.
      </DurumNotu>
    );
  } else {
    raporGovde = (
      <div className="birlesik-rapor-izgara">
        {/* Son rapor — öne çıkarılmış */}
        <section className="birlesik-rapor-son">
          <AltKural baslik="Son Rapor" />
          {sonRapor ? (
            <article>
              <p className="u-kicker">
                {humanize(sonRapor.period_type) || "Dönemsel"} ·{" "}
                <time dateTime={isoDate(sonRapor.period_start)}>
                  {formatDate(sonRapor.period_start)}
                </time>{" "}
                –{" "}
                <time dateTime={isoDate(sonRapor.period_end)}>
                  {formatDate(sonRapor.period_end)}
                </time>
              </p>
              <Link href={`/raporlar/${sonRapor.id}`} className="group block">
                <h4 className="u-headline u-headline-md mt-1.5 group-hover:text-accent">
                  {titleOf(sonRapor)}
                </h4>
              </Link>
              {summaryOf(sonRapor) ? (
                <p className="u-body mt-2.5 text-[1rem] leading-[1.55]">
                  {truncate(summaryOf(sonRapor), 460)}
                </p>
              ) : null}
              <p className="u-kicker mt-2.5 text-ink-faint">
                {countOf(sonRapor) === null ? "—" : formatNumber(countOf(sonRapor))} haber
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                <Link
                  href={`/raporlar/${sonRapor.id}`}
                  className="u-kicker u-link-underline inline-block"
                >
                  Raporu Oku →
                </Link>
                {/* Sunucudaki basıma hazır PDF — eskiden arayüzden hiç
                    bağlanmamıştı (Burak P2-1). */}
                <PdfDownloadLink reportId={sonRapor.id} label="PDF indir" />
              </p>
            </article>
          ) : null}
        </section>

        {/* Arşiv */}
        <section className="birlesik-rapor-arsiv">
          <AltKural
            baslik="Arşiv"
            sag={`${formatNumber(raporlar.length)} rapor`}
          />
          {eskiler.length > 0 ? (
            <ul className="birlesik-rapor-liste">
              {eskiler.map((report) => (
                <li key={report.id}>
                  <p className="u-kicker">
                    {humanize(report.period_type) || "Dönemsel"} ·{" "}
                    <time dateTime={isoDate(report.period_end)}>
                      {formatDate(report.period_end)}
                    </time>
                    <span className="text-ink-faint">
                      {" "}
                      · {countOf(report) === null ? "—" : formatNumber(countOf(report))} haber
                    </span>
                  </p>
                  <Link href={`/raporlar/${report.id}`} className="group block">
                    <h4 className="u-headline u-headline-sm mt-0.5 group-hover:text-accent">
                      {titleOf(report)}
                    </h4>
                  </Link>
                  <PdfDownloadLink
                    reportId={report.id}
                    label="PDF indir"
                    className="u-kicker u-link-underline tarih-pdf-bag"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <DurumNotu>Arşivde başka rapor bulunmuyor.</DurumNotu>
          )}
        </section>
      </div>
    );
  }

  /* --- SAYFA ------------------------------------------------------- */

  return (
    <div className="birlesik-sayfa">
      <header className="birlesik-sayfa-ust">
        <h1 className="u-headline u-headline-lg">Raporlar ve Değişiklikler</h1>
        <p className="u-body u-body-soft birlesik-sayfa-girdi">
          Üstte “ne değişti”, altında dönemsel yönetici özetleri. Bülteni
          yeniden taramanız gerekmez.
        </p>
      </header>

      {/* MODÜL 1 — anchor: /raporlar#degisiklikler */}
      <section id="degisiklikler" className="birlesik-modul">
        <ModulBasligi ustluk="Takip" baslik="Değişiklikler" sag={degisSag} />
        {/* Oturum ve uç varsa görünür; yoksa hiç basılmaz (sessiz). */}
        <SinceLastVisit />
        {degisGovde}
      </section>

      {/* MODÜL 2 — modülleri yalnızca kural çizgisi ayırır, kutu YOK. */}
      <section id="arsiv" className="birlesik-modul birlesik-modul-ayrik">
        <ModulBasligi
          ustluk="Arşiv"
          baslik="Rapor Arşivi"
          sag={
            raporRes.ok ? `${formatNumber(raporlar.length)} rapor` : "—"
          }
        />
        {raporGovde}
      </section>

      <p className="degis-dipnot">
        Değişiklikler kurumun panelinde herkes için aynıdır; “son
        ziyaretinizden beri” satırı yalnızca sizin oturumunuza bakar. Ham önem
        skoru gizli metriktir, yalnızca önem bandı gösterilir.
      </p>
    </div>
  );
}
