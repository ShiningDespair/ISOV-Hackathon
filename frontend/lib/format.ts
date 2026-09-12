/** Türkçe biçimlendirme yardımcıları — hepsi Europe/Istanbul saat diliminde. */

import { BAND_LABEL, BAND_RANK, REGION_LABEL } from "./types";
import type { Article, CountBucket, ImportanceBand, Region } from "./types";

const TZ = "Europe/Istanbul";

const dateFmt = new Intl.DateTimeFormat("tr-TR", {
  timeZone: TZ,
  day: "numeric",
  month: "long",
  year: "numeric",
});

const dateShortFmt = new Intl.DateTimeFormat("tr-TR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFmt = new Intl.DateTimeFormat("tr-TR", {
  timeZone: TZ,
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const weekdayFmt = new Intl.DateTimeFormat("tr-TR", {
  timeZone: TZ,
  weekday: "long",
});

const numberFmt = new Intl.NumberFormat("tr-TR");

/** Geçerli bir Date üretir; başarısızsa null. */
function toDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "12 Eylül 2026" */
export function formatDate(value?: string | null): string {
  const d = toDate(value);
  return d ? dateFmt.format(d) : "—";
}

/** "12.09.2026" */
export function formatDateShort(value?: string | null): string {
  const d = toDate(value);
  return d ? dateShortFmt.format(d) : "—";
}

/** "12 Eylül 2026 14:30" */
export function formatDateTime(value?: string | null): string {
  const d = toDate(value);
  return d ? dateTimeFmt.format(d) : "—";
}

/** "Cumartesi, 12 Eylül 2026" — gazete tarih satırı. */
export function formatMasthead(value?: string | null): string {
  const d = toDate(value) ?? new Date();
  const weekday = weekdayFmt.format(d);
  return `${weekday.charAt(0).toLocaleUpperCase("tr-TR")}${weekday.slice(1)}, ${dateFmt.format(d)}`;
}

/** ISO tarih (datetime attribute için). */
export function isoDate(value?: string | null): string | undefined {
  const d = toDate(value);
  return d ? d.toISOString() : undefined;
}

/** "3 saat önce" biçiminde göreli zaman. */
export function relativeTime(value?: string | null): string {
  const d = toDate(value);
  if (!d) return "—";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "az önce";
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} gün önce`;
  return formatDate(value);
}

/** Binlik ayraçlı sayı. */
export function formatNumber(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return numberFmt.format(value);
}

/** Yüzde — 0..1 ya da 0..100 girdisini normalize eder. */
export function formatPercent(value?: number | null, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const pct = value <= 1 ? value * 100 : value;
  return `%${pct.toFixed(digits).replace(".", ",")}`;
}

/** Bilinmeyen değerleri güvenli bölgeye düşürür. */
export function normalizeRegion(value?: string | null): Region {
  const v = String(value ?? "").toUpperCase();
  if (v in REGION_LABEL) return v as Region;
  return "DIGER";
}

/** Bilinmeyen bandı ORTA sayar. */
export function normalizeBand(value?: string | null): ImportanceBand {
  const v = String(value ?? "").toUpperCase();
  if (v in BAND_LABEL) return v as ImportanceBand;
  return "ORTA";
}

export function regionLabel(value?: string | null): string {
  return REGION_LABEL[normalizeRegion(value)];
}

export function bandLabel(value?: string | null): string {
  return BAND_LABEL[normalizeBand(value)];
}

/** Kicker satırı: "Resmî Gazete · Türkiye · 12 Eylül 2026" */
export function kicker(article: Article): string {
  const parts = [
    article.source?.name?.trim(),
    regionLabel(article.region),
    formatDate(article.published_at),
  ].filter((p): p is string => Boolean(p && p !== "—"));
  return parts.join(" · ");
}

/** Kategori adını okunur hale getirir: "mevzuat-degisikligi" -> "Mevzuat Değişikliği" */
export function humanize(slug?: string | null): string {
  if (!slug) return "";
  return slug
    .replace(/[-_]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toLocaleUpperCase("tr-TR") + w.slice(1))
    .join(" ");
}

/** Metni kelime sınırında keser. */
export function truncate(text?: string | null, max = 220): string {
  const t = (text ?? "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Haberleri band + tarihe göre sıralar (ham skor kullanılmaz). */
export function sortByImportance(articles: Article[]): Article[] {
  return [...articles].sort((a, b) => {
    const rank = BAND_RANK[normalizeBand(b.importance_band)] - BAND_RANK[normalizeBand(a.importance_band)];
    if (rank !== 0) return rank;
    const ta = toDate(a.published_at)?.getTime() ?? 0;
    const tb = toDate(b.published_at)?.getTime() ?? 0;
    return tb - ta;
  });
}

/**
 * Backend istatistik kovalarını ({key,count} | {region,count} | Record) tek
 * biçime indirger. Grafik bileşenleri bunu tüketir.
 */
export function toBuckets(
  raw: CountBucket[] | Record<string, number> | null | undefined,
  labeller: (key: string) => string = (k) => k,
): { key: string; label: string; count: number }[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((b) => {
        const key = String(
          b.key ?? b.region ?? b.band ?? b.category ?? b.date ?? b.day ?? b.label ?? "",
        );
        const count = Number(b.count ?? b.total ?? b.value ?? 0) || 0;
        return { key, label: b.label ? String(b.label) : labeller(key), count };
      })
      .filter((b) => b.key !== "");
  }
  return Object.entries(raw).map(([key, count]) => ({
    key,
    label: labeller(key),
    count: Number(count) || 0,
  }));
}

/** "Sayı No" — gazete künyesi için yıl-gün bazlı deterministik numara. */
export function issueNumber(date = new Date()): string {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const day = Math.floor((date.getTime() - start) / 86400000) + 1;
  return `${date.getUTCFullYear()}–${String(day).padStart(3, "0")}`;
}
