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

/**
 * Veritabanındaki sabit değerlerin Türkçe görüntüleme adları.
 *
 * NEDEN: humanize() slug'ı yalnızca büyük harfle başlatıyordu; slug'lar
 * ASCII olduğu için arayüze "Tesvik", "Ar Ge", "Ticaret Politikasi",
 * "Cevre" ve haber detayında "DUYGU: Negatif" yerine "NEGATIF" düştü
 * (25 Eylül 2026 persona testi, 5 personanın 5'i). Anahtarlar canlı
 * veritabanından çıkarıldı: `SELECT DISTINCT category FROM articles`
 * (19 değer) + şemadaki sentiment / source_type / period_type /
 * trigger_type enum'ları + tags.kind enum'u. Burada olmayan değer
 * humanize()'ın eski davranışına düşer.
 */
const CATEGORY_LABEL: Record<string, string> = {
  "ar-ge": "Ar-Ge",
  cevre: "Çevre",
  "dis-ticaret": "Dış Ticaret",
  duyuru: "Duyuru",
  ekonomi: "Ekonomi",
  emtia: "Emtia",
  enerji: "Enerji",
  finansman: "Finansman",
  ihracat: "İhracat",
  istihdam: "İstihdam",
  lojistik: "Lojistik",
  mevzuat: "Mevzuat",
  sanayi: "Sanayi",
  standart: "Standart",
  "tedarik-zinciri": "Tedarik Zinciri",
  teknoloji: "Teknoloji",
  tesvik: "Teşvik",
  "ticaret-politikasi": "Ticaret Politikası",
  vergi: "Vergi",
};

const SENTIMENT_LABEL: Record<string, string> = {
  POZITIF: "Olumlu",
  NOTR: "Nötr",
  NEGATIF: "Olumsuz",
};

/** Kaynak türü, rapor dönemi, çalıştırma tetikleyicisi ve etiket türü. */
const ENUM_LABEL: Record<string, string> = {
  // sources.source_type
  kurum: "Kurum",
  acik_veri: "Açık Veri",
  basin: "Basın",
  uluslararasi: "Uluslararası",
  diger: "Diğer",
  // reports.period_type
  gunluk: "Günlük",
  haftalik: "Haftalık",
  aylik: "Aylık",
  ozel: "Özel",
  // collection_runs.trigger_type
  manuel: "Manuel",
  zamanlanmis: "Zamanlanmış",
  seed: "Başlangıç Verisi",
  // tags.kind
  konu: "Konu",
  sektor: "Sektör",
  cografya: "Coğrafya",
};

/** Yalnızca sözlüğün kendi anahtarı ("constructor" gibi prototip adları değil). */
function ownLabel(map: Record<string, string>, key: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

/**
 * Sabit değeri okunur hale getirir: "ticaret-politikasi" -> "Ticaret Politikası",
 * "NEGATIF" -> "Olumsuz". Sözlükte yoksa slug'ı kelime kelime büyük harfle başlatır.
 */
export function humanize(slug?: string | null): string {
  if (!slug) return "";
  const key = String(slug).trim();
  const known =
    ownLabel(CATEGORY_LABEL, key.toLowerCase()) ??
    ownLabel(SENTIMENT_LABEL, key.toUpperCase()) ??
    ownLabel(ENUM_LABEL, key.toLowerCase());
  if (known) return known;
  return key
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


/**
 * Kaynak ADININ dili — `lang` niteliği için.
 *
 * `sources.language` kaynağın YAYIN dilidir, adının dili değil. İngilizce
 * yayın yapan "Uluslararası Enerji Ajansı (IEA)" ya da "Avrupa Komisyonu
 * Basın Odası"na `lang="en"` verilirse büyük harf dönüşümü İngilizce
 * kurallarla yapılır ve "ULUSLARARASI ENERJI", "KOMISYONU" basılır (PDF
 * tarafında Chromium'la ölçüldü). Kural: yayın dili İngilizce VE adda Türkçe
 * harf yoksa "en"; aksi halde sayfanın `tr`'si geçerli kalsın. Böylece
 * "Cyprus Mail" → "CYPRUS MAIL", "Uluslararası…" → "ULUSLARARASI…".
 * "Cyprus Mail (Reuters servisi)" gibi karışık adlar Türkçe harf içermediği
 * halde Türkçe kelime taşıyabilir; bu durumda "SERVISI" riski kabul edildi —
 * kelime düzeyinde dil tespiti bu küçük sorun için fazla.
 */
export function kaynakAdiDili(
  source?: { name?: string | null; language?: string | null } | null,
): "en" | undefined {
  if (!source || source.language !== "en") return undefined;
  return /[çğıöşüÇĞİÖŞÜ]/.test(source.name ?? "") ? undefined : "en";
}
