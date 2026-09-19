/**
 * TÜRE GÖRE FİLTRE ŞERİDİ — `BandFilter` deseninin aynısı.
 * Link tabanlı: JS gerekmez, tarih aralığı ve diğer parametreler korunur.
 *
 * Sayılar YALNIZCA güvenilirse gösterilir: `/changes` sayfalı döndüğünde
 * listeden türetilmiş kırılım eksik olur, o hâlde sayı basmak yanıltıcıdır.
 */

import Link from "next/link";

import { CHANGE_TYPES, CHANGE_TYPE_LABEL, type ChangeType } from "@/lib/api-me";
import {
  withState,
  type DateFilterState,
} from "@/components/DateRangeFilter";
import { formatNumber } from "@/lib/format";

export function ChangeTypeFilter({
  state,
  basePath = "/degisiklikler",
  counts,
  showCounts = false,
}: {
  state: DateFilterState;
  basePath?: string;
  counts?: Partial<Record<ChangeType, number>>;
  showCounts?: boolean;
}) {
  const aktif = state.type ?? undefined;

  return (
    <nav aria-label="Değişiklik türü filtresi" className="degis-tur-seridi">
      <Link
        href={withState(state, { type: undefined }, basePath)}
        className="tag-chip"
        data-active={!aktif ? "true" : "false"}
        aria-current={!aktif ? "true" : undefined}
      >
        Tümü
      </Link>
      {CHANGE_TYPES.map((t) => {
        const secili = aktif === t;
        const sayi = showCounts ? counts?.[t] : undefined;
        return (
          <Link
            key={t}
            href={withState(state, { type: t }, basePath)}
            className="tag-chip"
            data-active={secili ? "true" : "false"}
            aria-current={secili ? "true" : undefined}
          >
            {CHANGE_TYPE_LABEL[t]}
            {typeof sayi === "number" && sayi > 0 ? (
              <span className="degis-tur-sayi"> {formatNumber(sayi)}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export default ChangeTypeFilter;
