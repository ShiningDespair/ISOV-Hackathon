/**
 * KPI ŞERİDİ — panelin en üstündeki sayısal göstergeler.
 *
 * KURAL: gerçek sayı yoksa "—" basılır, SIFIR UYDURULMAZ. `formatNumber`
 * null/undefined için zaten "—" döndürür; buradaki `kpiValue` yardımcısı
 * aynı davranışı sayı dışı değerler için de garanti eder.
 *
 * Gösterge kutucuğu `components/Charts.tsx` içindeki `StatFigure` —
 * yeniden yazılmadı, olduğu gibi kullanıldı.
 */

import { StatFigure } from "@/components/Charts";
import { formatNumber } from "@/lib/format";

export interface Kpi {
  label: string;
  /** Hazır metin (ör. "%12,2") ya da sayı; null/undefined -> "—". */
  value: string | number | null | undefined;
  /** Sayının neye dayandığı — "uydurulmadı" iddiasının kanıtı. */
  note?: string;
}

/** Sayıyı Türkçe biçimler, veri yoksa "—" döndürür. */
export function kpiValue(value: Kpi["value"]): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return formatNumber(value);
  const text = String(value).trim();
  return text === "" ? "—" : text;
}

export function KpiRow({ items }: { items: Kpi[] }) {
  if (items.length === 0) return null;

  return (
    <div className="pano-kpi" data-adet={items.length}>
      {items.map((item) => (
        <StatFigure
          key={item.label}
          label={item.label}
          value={kpiValue(item.value)}
          note={item.note}
        />
      ))}
    </div>
  );
}
