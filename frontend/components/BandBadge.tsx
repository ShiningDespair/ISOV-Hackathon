/**
 * Önem bandı ve bölge rozetleri.
 * DİKKAT: Ham `importance_score` gizli metriktir ve UI'da ASLA gösterilmez.
 * Yalnızca `importance_band` rozet olarak basılır.
 */

import { bandLabel, normalizeBand, regionLabel } from "@/lib/format";

const BAND_CLASS: Record<string, string> = {
  KRITIK: "u-band u-band-kritik",
  YUKSEK: "u-band u-band-yuksek",
  ORTA: "u-band u-band-orta",
  DUSUK: "u-band u-band-dusuk",
};

export function BandBadge({
  band,
  className = "",
}: {
  band?: string | null;
  className?: string;
}) {
  const key = normalizeBand(band);
  return (
    <span
      className={`${BAND_CLASS[key]} ${className}`}
      title={`Önem bandı: ${bandLabel(key)}`}
    >
      {bandLabel(key)}
    </span>
  );
}

/** Bölge rozeti — renk kullanılmaz, yalnızca ince gri çerçeve. */
export function RegionBadge({
  region,
  className = "",
}: {
  region?: string | null;
  className?: string;
}) {
  return (
    <span className={`u-band border-rule text-ink-soft ${className}`}>
      {regionLabel(region)}
    </span>
  );
}
