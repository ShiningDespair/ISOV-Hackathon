/**
 * "BU ARALIKTA DEĞİŞENLER" SATIRI.
 *
 * Tarih filtresinin altına konur: seçili aralıkta kaç yeni haber, kaç dosya
 * gelişmesi, kaç band yükselmesi olduğunu söyler.
 *
 * DÜRÜSTLÜK KURALI: `/changes` henüz uygulanmadıysa (501) ya da router
 * bağlanmadıysa (404) bu satır HİÇ RENDER EDİLMEZ. Boş sayı göstermek,
 * "0 değişiklik" demek, olmayan veriyi varmış gibi sunmaktır — bunun yerine
 * satır yok sayılır. Ağ hatasında da aynı: sessizce kaybolur, sayfayı bozmaz.
 *
 * İKİ KULLANIM BİÇİMİ VAR, ÖNEMLİ FARKLA:
 *
 *  1. `rangeChangeOzeti()` + `<RangeChangesLine>` — TERCİH EDİLEN. Sayfa
 *     veriyi kendi `await`'iyle alır, satır senkron basılır. JS kapalıyken de
 *     satır tam olarak bulunduğu yerde görünür.
 *  2. `<RangeChanges from to />` — kendi kendine veri çeken asenkron bileşen.
 *     Kolay ama `app/loading.tsx` yüzünden akıtılır (stream): JS kapalı
 *     tarayıcıda satır sayfanın en altında kalır. Ölçülerek görüldü; bu yüzden
 *     yalnızca zaten JS'e bağlı bağlamlarda kullanılmalı.
 *
 * `getChanges` asla fırlatmaz; iki yol da hata durumunda `null` üretir.
 */

import Link from "next/link";

import {
  CHANGE_TYPES,
  getChanges,
  type ChangeType,
} from "@/lib/api-me";
import { formatNumber } from "@/lib/format";
import { tarihAraligiEtiketi } from "@/components/DateRangeFilter";

/** Tür adının cümle içinde geçen biçimi: "4 yeni haber". */
const ICINDE: Record<ChangeType, string> = {
  yeni: "yeni haber",
  "kume-buyudu": "kümede büyüme",
  "band-yukseldi": "band yükselmesi",
  "dosya-gelismesi": "dosya gelişmesi",
  "ozet-guncellendi": "özet güncellemesi",
};

export interface RangeChangeOzeti {
  toplam: number;
  /** "4 yeni haber" gibi hazır ibareler; boşsa yalnızca toplam söylenir. */
  parcalar: string[];
  /** Seçili aralığın okunur karşılığı; aralık yoksa null. */
  aralik: string | null;
  /** Değişiklikler paneline giden bağlantı (aralık korunur). */
  hedef: string;
}

/**
 * Aralık özetini hesaplar. Veri yoksa / uç nokta hazır değilse `null` döner
 * ve çağıran taraf HİÇBİR ŞEY basmaz.
 */
export async function rangeChangeOzeti(
  from?: string,
  to?: string,
): Promise<RangeChangeOzeti | null> {
  const res = await getChanges({ from, to, limit: 200 });
  if (!res.ok) return null;

  const { data: items, total, counts, countsFromList } = res.data;
  const toplam = total || items.length;
  if (toplam <= 0) return null;

  // Sayımlar listeden türetildiyse ve liste eksikse tür kırılımı YANLIŞ
  // olurdu; o durumda yalnızca toplam söylenir.
  const kirilimGuvenli = !countsFromList || items.length >= toplam;
  const parcalar = kirilimGuvenli
    ? CHANGE_TYPES.filter((t) => (counts[t] ?? 0) > 0).map(
        (t) => `${formatNumber(counts[t])} ${ICINDE[t]}`,
      )
    : [];

  const qs = new URLSearchParams({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }).toString();

  return {
    toplam,
    parcalar,
    aralik: tarihAraligiEtiketi(from, to),
    hedef: `/degisiklikler${qs ? `?${qs}` : ""}`,
  };
}

/** Senkron satır — veri sayfa tarafından çekilmişse bunu kullanın. */
export function RangeChangesLine({
  ozet,
  withLink = true,
}: {
  ozet: RangeChangeOzeti | null;
  withLink?: boolean;
}) {
  if (!ozet) return null;

  return (
    <p className="degis-aralik" role="status" aria-live="polite">
      <span className="u-kicker degis-aralik-etiket">
        {ozet.aralik ? "Bu aralıkta" : "Son değişiklikler"}
      </span>{" "}
      <span className="degis-aralik-govde">
        {ozet.parcalar.length > 0
          ? ozet.parcalar.join(" · ")
          : `${formatNumber(ozet.toplam)} değişiklik`}
      </span>
      {withLink ? (
        <>
          {" "}
          <Link href={ozet.hedef} className="u-link-underline degis-aralik-bag">
            Değişiklikler panelinde gör
          </Link>
        </>
      ) : null}
    </p>
  );
}

/**
 * Kendi verisini çeken asenkron sarmalayıcı. Kolaylık için var; JS kapalı
 * senaryoda satırın yeri kayar (yukarıdaki not). Sayfa zaten `await`
 * yapıyorsa `rangeChangeOzeti()` + `RangeChangesLine` tercih edilmeli.
 */
export async function RangeChanges({
  from,
  to,
  withLink = true,
}: {
  from?: string;
  to?: string;
  withLink?: boolean;
}) {
  const ozet = await rangeChangeOzeti(from, to);
  return <RangeChangesLine ozet={ozet} withLink={withLink} />;
}

export default RangeChanges;
