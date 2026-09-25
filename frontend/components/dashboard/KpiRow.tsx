/**
 * KPI ŞERİDİ — panelin en üstündeki sayısal göstergeler.
 *
 * KURAL: gerçek sayı yoksa "—" basılır, SIFIR UYDURULMAZ. `formatNumber`
 * null/undefined için zaten "—" döndürür; buradaki `kpiValue` yardımcısı
 * aynı davranışı sayı dışı değerler için de garanti eder.
 *
 * İKİ KİP:
 *
 *   geniş (`sik` verilmemiş) — `components/Charts.tsx` içindeki
 *     `StatFigure` ızgarası. 2rem'lik sayı + altında gerekçe notu. Hâlâ
 *     duruyor çünkü `/istatistik` gibi göstergenin kendisinin konu olduğu
 *     sayfalarda doğru olan bu.
 *
 *   sıkı (`sik`) — tek satırlık yatay şerit, `etiket: değer` yan yana.
 *     Gerekçesi ölçülebilir bir kural: `/` ilk ekranında (1440×900 ve
 *     390×844) ilk haber başlığı görünür olmak zorunda
 *     (docs/SADELESTIRME.md §6). Geniş kip 3-4 göstergeyi 2 sütuna
 *     sarıp ~190 piksel yiyordu ve kullanıcının şikâyeti tam buydu:
 *     "KPI'lar çok yer kaplıyor, haber görmek için kaydırmak gerekiyor".
 *     Sıkı kipte gerekçe notu EKRANDAN kalkar ama SİLİNMEZ — `title`
 *     niteliğine taşınır, yani "sayı neye dayanıyor" sorusunun cevabı
 *     hâlâ arayüzde.
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

export function KpiRow({
  items,
  sik = false,
}: {
  items: Kpi[];
  /** Tek satırlık sıkı şerit kipi — bkz. dosya başı. */
  sik?: boolean;
}) {
  if (items.length === 0) return null;

  // `data-adet` KORUNUYOR: geniş kipteki sütun sayısı kuralları
  // (`.pano-kpi[data-adet="3"|"4"]`) globals.css içinde ve o dosya kilitli.
  return (
    <div
      className="pano-kpi"
      data-adet={items.length}
      data-sik={sik ? "true" : "false"}
    >
      {items.map((item) =>
        sik ? (
          <span
            key={item.label}
            className="akis-kpi-oge"
            title={item.note}
          >
            <span className="akis-kpi-etiket">{item.label}</span>
            <span className="akis-kpi-deger tabular-nums">
              {kpiValue(item.value)}
            </span>
          </span>
        ) : (
          <StatFigure
            key={item.label}
            label={item.label}
            value={kpiValue(item.value)}
            note={item.note}
          />
        ),
      )}
    </div>
  );
}
