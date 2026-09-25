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
 * BÖLÜMLEME (sıralama değil): süresi dolan kalemler AYRI bir bölümde,
 * listenin SONUNDA. Ölçülen hata (Burak P1-3, 25 Eylül 2026): "SÜRE
 * DOLDU · 15 Eylül · KOSGEB Kapasite Geliştirme" KRİTİK rozetiyle 2. sırada,
 * açık 30 Eylül / 26 Ekim / 31 Ekim kalemlerinin üstündeydi; ilk ekranda
 * görünen 3 kalemin biri ölü bir çağrıydı. Her bölüm kendi içinde API
 * sırasını korur. Süresi dolan kalemde önem rozeti basılmaz: "KRİTİK"
 * artık yapılabilecek bir iş anlatmıyor.
 *
 * ADIMLAR: bir çağrıda birden çok tarih varsa hepsi türüyle yazılır ("Ön
 * kayıt: 22 Ekim · Son başvuru: 26 Ekim"); geri sayım en yakın GELECEK
 * adıma yapılır (deadline.ts §4).
 *
 * Tarih UYDURULMAZ: yalnızca `deadline.ts` işaretli bir tarih bulabildiği
 * kalemler buraya girer, kalanlar normal haber akışında kalır.
 */

import Link from "next/link";

import { BandBadge } from "@/components/BandBadge";
import { humanize } from "@/lib/format";
import type { Article } from "@/lib/types";

import {
  deadlineStepsOf,
  expiredLabel,
  formatHitDate,
  formatHitDateShort,
  urgencyOf,
  type DateHit,
} from "./deadline";
import { TaskExport, type TaskExportRow } from "./TaskExport";

export interface TaskItem {
  article: Article;
  hit: DateHit;
}

/** "22.10.2026" — Excel (tr-TR) bunu tarih olarak tanır. */
function dmy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

function exportRow(item: TaskItem, steps: DateHit[]): TaskExportRow {
  const { article, hit } = item;
  const tarihler = (adim: string) =>
    steps.filter((s) => s.step === adim).map((s) => dmy(s.iso)).join(" / ");
  const diger = steps
    .filter((s) => s.step !== "Ön kayıt" && s.step !== "Son başvuru")
    .map((s) => `${s.step}: ${dmy(s.iso)}`)
    .join(" / ");
  return {
    kalem: article.title ?? "",
    kurum: article.source?.name ?? "",
    tur: article.category ? humanize(article.category) : "",
    siradaki: `${hit.step}: ${dmy(hit.iso)}`,
    onKayit: tarihler("Ön kayıt"),
    sonBasvuru: tarihler("Son başvuru"),
    digerTarih: diger,
    kalanGun: hit.days,
    durum: hit.days < 0 ? "Süresi doldu" : "Açık",
    kaynak: article.url ?? "",
    haberYolu: `/haber/${article.id}`,
    dayanak: hit.evidence,
  };
}

function TaskRow({
  item,
  steps,
  sira,
  gecti,
}: {
  item: TaskItem;
  steps: DateHit[];
  sira: number;
  gecti: boolean;
}) {
  const { article, hit } = item;
  const now = new Date();
  // Satırda yalnızca birden çok adım varsa ya da tek adımın türü çipte
  // yazmıyorsa adım dizisi basılır — tek tarihli kalem kısa kalsın.
  const adimlar = steps.length > 1 ? steps : [];

  return (
    <li className="pano-is" data-tarih-gecti={gecti ? "true" : "false"}>
      <div className="pano-is-ust">
        <span className="pano-is-sira" aria-hidden="true">
          {String(sira).padStart(2, "0")}
        </span>
        <span
          className="pano-gerisayim"
          data-aciliyet={urgencyOf(hit)}
          title={`${hit.step}: ${formatHitDate(hit.iso)}`}
        >
          {gecti ? expiredLabel(hit.days) : hit.label}
        </span>
        <span className="tarih-adim-tur u-kicker">
          {gecti ? hit.step : `Sıradaki adım: ${hit.step}`}
        </span>
        <time className="pano-is-tarih" dateTime={hit.iso}>
          {formatHitDate(hit.iso)}
        </time>
        {gecti ? null : <BandBadge band={article.importance_band} />}
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

      {adimlar.length > 0 ? (
        <p className="tarih-adimlar">
          {adimlar.map((s, i) => (
            <span key={`${s.step}-${s.iso}`} className="tarih-adim" data-gecti={s.days < 0 ? "true" : "false"}>
              {i > 0 ? <span aria-hidden="true"> · </span> : null}
              <span className="tarih-adim-ad">{s.step}:</span>{" "}
              <time dateTime={s.iso}>{formatHitDateShort(s.iso, now)}</time>
              {s.days < 0 ? " (geçti)" : ""}
            </span>
          ))}
        </p>
      ) : null}

      <p className="pano-is-kanit">
        <span className="u-kicker text-ink-faint">Dayanak</span> {hit.evidence}
      </p>

      {article.source?.name ? (
        <p className="u-kicker mt-1.5">{article.source.name}</p>
      ) : null}
    </li>
  );
}

export function TaskList({ items }: { items: TaskItem[] }) {
  if (items.length === 0) return null;

  const now = new Date();
  const withSteps = items.map((item) => {
    const steps = deadlineStepsOf(item.article, now);
    return { item, steps: steps.length > 0 ? steps : [item.hit] };
  });
  const acik = withSteps.filter(({ item }) => item.hit.days >= 0);
  const gecmis = withSteps.filter(({ item }) => item.hit.days < 0);
  const rows = [...acik, ...gecmis].map(({ item, steps }) => exportRow(item, steps));

  return (
    <div className="tarih-is-blok">
      <div className="tarih-is-arac">
        <TaskExport rows={rows} />
      </div>

      {acik.length > 0 ? (
        <ol className="pano-is-liste">
          {acik.map(({ item, steps }, i) => (
            <TaskRow key={item.article.id} item={item} steps={steps} sira={i + 1} gecti={false} />
          ))}
        </ol>
      ) : (
        <p className="u-body u-body-soft">Süresi açık kalem yok.</p>
      )}

      {gecmis.length > 0 ? (
        <section className="tarih-gecmis" aria-label={`Süresi dolanlar (${gecmis.length})`}>
          {/* Katlanmıyor: "Süresi doldu (X gün önce)" etiketi görünür
              kalsın; bölüm sonda olduğu için açık kalemleri itmiyor. */}
          <p className="tarih-gecmis-baslik u-kicker">
            Süresi dolanlar ({gecmis.length})
          </p>
          <ol className="pano-is-liste" start={acik.length + 1}>
            {gecmis.map(({ item, steps }, i) => (
              <TaskRow
                key={item.article.id}
                item={item}
                steps={steps}
                sira={acik.length + i + 1}
                gecti
              />
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
