/**
 * Saf CSS/SVG grafikler — harici grafik kütüphanesi KULLANILMAZ.
 * Gazete estetiği: siyah dolgu, ince kural çizgileri, sans-serif etiketler.
 */

import { formatNumber } from "@/lib/format";

export interface Bucket {
  key: string;
  label: string;
  count: number;
}

/** Yatay çubuk grafik — bölge / band / kategori dağılımları. */
export function BarList({
  data,
  emptyLabel = "Veri yok",
  accentKeys = [],
}: {
  data: Bucket[];
  emptyLabel?: string;
  /** Bordo vurgu uygulanacak anahtarlar (ör. KRITIK). */
  accentKeys?: string[];
}) {
  if (!data.length) {
    return <p className="u-body u-body-soft text-[0.9rem]">{emptyLabel}</p>;
  }

  const max = Math.max(...data.map((d) => d.count), 1);
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <ul className="divide-y divide-rule">
      {data.map((item) => {
        const pct = max > 0 ? (item.count / max) * 100 : 0;
        const share = total > 0 ? (item.count / total) * 100 : 0;
        const accent = accentKeys.includes(item.key);
        return (
          <li key={item.key} className="py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="u-kicker text-ink">{item.label}</span>
              <span className="u-kicker text-ink-faint tabular-nums">
                {formatNumber(item.count)}
                <span className="ml-1.5 text-ink-faint">
                  ({share.toFixed(0)}%)
                </span>
              </span>
            </div>
            <div
              className="mt-1.5 h-[7px] w-full bg-paper-deep"
              role="img"
              aria-label={`${item.label}: ${item.count} haber, toplamın yüzde ${share.toFixed(0)}'i`}
            >
              <div
                className={`h-full ${accent ? "bg-accent" : "bg-ink"}`}
                style={{ width: `${Math.max(pct, 1.5)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Günlük haber serisi — SVG sütun grafiği. */
export function DailyBars({
  data,
  height = 120,
}: {
  data: Bucket[];
  height?: number;
}) {
  if (!data.length) {
    return (
      <p className="u-body u-body-soft text-[0.9rem]">
        Günlük seri verisi yok.
      </p>
    );
  }

  const width = 720;
  const pad = { top: 8, right: 2, bottom: 18, left: 2 };
  const plotH = height - pad.top - pad.bottom;
  const plotW = width - pad.left - pad.right;
  const max = Math.max(...data.map((d) => d.count), 1);
  const slot = plotW / data.length;
  const barW = Math.max(2, Math.min(slot * 0.66, 26));

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-[120px] w-full"
        role="img"
        aria-label={`Günlük haber sayısı serisi, ${data.length} gün. En yüksek ${max} haber.`}
      >
        {/* Taban kural çizgisi */}
        <line
          x1={pad.left}
          y1={pad.top + plotH}
          x2={width - pad.right}
          y2={pad.top + plotH}
          stroke="#121212"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {data.map((d, i) => {
          const h = max > 0 ? (d.count / max) * plotH : 0;
          const x = pad.left + i * slot + (slot - barW) / 2;
          const y = pad.top + plotH - h;
          return (
            <rect
              key={`${d.key}-${i}`}
              x={x}
              y={y}
              width={barW}
              height={Math.max(h, d.count > 0 ? 1 : 0)}
              fill="#121212"
            >
              <title>{`${d.label}: ${d.count} haber`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="u-kicker mt-1 flex justify-between text-ink-faint">
        <span>{data[0]?.label ?? ""}</span>
        <span>En yüksek: {formatNumber(max)}</span>
        <span>{data[data.length - 1]?.label ?? ""}</span>
      </figcaption>
    </figure>
  );
}

/** İnce sparkline — küçük eğilim göstergesi. */
export function Sparkline({
  values,
  label,
}: {
  values: number[];
  label?: string;
}) {
  if (values.length < 2) return null;

  const width = 160;
  const height = 32;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / span) * (height - 2) - 1;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-8 w-full max-w-[160px]"
      role="img"
      aria-label={label ?? "Eğilim çizgisi"}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke="#121212"
        strokeWidth="1.25"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Büyük sayı göstergesi — künye kutucuğu. */
export function StatFigure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="border-t border-ink pt-2">
      <p className="u-kicker">{label}</p>
      <p className="u-headline mt-1 text-[2rem] font-black leading-none tabular-nums">
        {value}
      </p>
      {note ? (
        <p className="u-body u-body-soft mt-1 text-[0.8125rem] leading-snug">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/** Oran çubuğu — tekilleştirme oranı gibi tek değerli göstergeler. */
export function RatioBar({
  ratio,
  label,
}: {
  /** 0..1 aralığında. */
  ratio: number;
  label: string;
}) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="u-kicker">{label}</span>
        <span className="u-kicker tabular-nums text-ink">
          %{pct.toFixed(1).replace(".", ",")}
        </span>
      </div>
      <div
        className="mt-1.5 h-2.5 w-full border border-ink"
        role="img"
        aria-label={`${label}: yüzde ${pct.toFixed(1)}`}
      >
        <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
