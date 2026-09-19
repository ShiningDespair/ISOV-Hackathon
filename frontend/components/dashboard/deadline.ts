/**
 * TARİH ÇIKARIMI — `key_points` içine gömülü son başvuru / takvim tarihleri.
 *
 * Korpusta ayrı bir `deadline` alanı YOK; tarih bilgisi anahtar maddelerin
 * içinde düz metin olarak geçiyor:
 *
 *   "Son başvuru tarihi 15 Eylül 2026 - takvimdeki en yakın son tarih"
 *   "Başvuru dönemi 1 Eylül - 31 Ekim 2026, son kredi kullanımı 31 Aralık 2026"
 *   "Ön aşama zarar kararı son tarihi: 26 Ekim 2026"
 *
 * İKİ KURAL:
 *
 *  1) TARİH YETMEZ, İŞARET DE GEREKİR. "Soruşturma 3 Haziran 2026'da
 *     açılmıştı" cümlesi tarih taşır ama son başvuru DEĞİLDİR. Bu yüzden
 *     yalnızca aynı maddede son tarih/takvim işareti (ör. "son başvuru",
 *     "yürürlüğe gir") geçen tarihler kabul edilir. İşaret yoksa kalem
 *     normal haber gibi gösterilir — tarih UYDURULMAZ.
 *
 *  2) YIL ZORUNLU. "1 Eylül - 31 Ekim 2026" aralığında yalnızca "31 Ekim
 *     2026" eşleşir, yani aralığın BİTİŞİ. Bu tesadüf değil, işimize gelen
 *     doğru davranış: geri sayım bitiş tarihine yapılır. Yılsız "1 Eylül"
 *     parçasını tahminle 2026'ya bağlamak, yanlış yıla geri sayım
 *     göstermekle sonuçlanabilirdi.
 */

import type { Article } from "@/lib/types";

export type DateKind = "son-tarih" | "takvim";

export interface DateHit {
  /** YYYY-AA-GG (UTC gün başlangıcı olarak yorumlanır). */
  iso: string;
  /** Bugüne göre gün farkı; negatif = geçmiş. */
  days: number;
  kind: DateKind;
  /** Tarihin çıkarıldığı anahtar madde — kanıt olarak ekranda gösterilir. */
  evidence: string;
  /** "Son 6 gün", "Bugün son gün", "Süre doldu" … */
  label: string;
}

const MONTHS: Record<string, number> = {
  ocak: 1,
  şubat: 2,
  mart: 3,
  nisan: 4,
  mayıs: 5,
  haziran: 6,
  temmuz: 7,
  ağustos: 8,
  eylül: 9,
  ekim: 10,
  kasım: 11,
  aralık: 12,
};

const MONTH_NAMES = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

/** "Yapılacak" anlamı taşıyan işaretler — kullanıcıdan eylem bekler. */
const DEADLINE_MARKERS = [
  "son başvuru",
  "başvuru son",
  "son tarih",
  "başvuru dönemi",
  "başvuru süresi",
  "başvuru takvimi",
  "son kredi kullanımı",
  "son gün",
  "son teslim",
  "son kayıt",
  "son ödeme",
  "ön kayıt",
  "son sınır",
  "kadar başvuru",
];

/** Takvim işaretleri — yürürlük, toplantı, uygulama tarihleri. */
const CALENDAR_MARKERS = [
  "yürürlüğe gir",
  "yürürlük",
  "geçerli olacak",
  "uygulanmaya baş",
  "uygulanacak",
  "toplantı",
  "oturumları",
  "karar tarihi",
  "pilot dönemi",
  "geçiş dönemi",
  "kademeli olarak",
];

const DAY_MS = 86400000;

const isoFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Istanbul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Bugünün Europe/Istanbul tarihi, UTC gün başlangıcı olarak. */
export function todayStamp(now: Date = new Date()): number {
  const [y, m, d] = isoFormatter.format(now).split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function lower(value: string): string {
  return value.toLocaleLowerCase("tr-TR");
}

function hasMarker(text: string, markers: string[]): boolean {
  const t = lower(text);
  return markers.some((m) => t.includes(m));
}

/** Bir metindeki tüm (gün, ay, yıl) tarihlerini metin sırasında döndürür. */
function parseDates(text: string): number[] {
  const found: number[] = [];
  const lowered = lower(text);

  const monthPattern = Object.keys(MONTHS).join("|");
  const written = new RegExp(
    `(\\d{1,2})\\s+(${monthPattern})\\s+(\\d{4})`,
    "g",
  );
  let m: RegExpExecArray | null;
  while ((m = written.exec(lowered)) !== null) {
    const day = Number(m[1]);
    const month = MONTHS[m[2] ?? ""] ?? 0;
    const year = Number(m[3]);
    if (day >= 1 && day <= 31 && month >= 1 && year >= 2000 && year <= 2100) {
      found.push(Date.UTC(year, month - 1, day));
    }
  }

  const numeric = /(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/g;
  while ((m = numeric.exec(lowered)) !== null) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      found.push(Date.UTC(year, month - 1, day));
    }
  }

  return found;
}

function isoOf(stamp: number): string {
  const d = new Date(stamp);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

/** "26 Ekim 2026" — geri sayımın yanında tam tarih olarak basılır. */
export function formatHitDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

function labelFor(days: number, kind: DateKind): string {
  if (days < 0) return kind === "son-tarih" ? "Süre doldu" : "Yürürlükte";
  if (days === 0) return kind === "son-tarih" ? "Bugün son gün" : "Bugün";
  if (days === 1) return kind === "son-tarih" ? "Son 1 gün" : "Yarın";
  return kind === "son-tarih" ? `Son ${days} gün` : `${days} gün sonra`;
}

/**
 * Haberin anahtar maddelerinden işaretli tüm tarihleri çıkarır.
 * Sonuç metin sırasındadır; hiçbir yerde haber sıralamasını etkilemez.
 */
export function extractDateHits(
  article: Article,
  now: Date = new Date(),
): DateHit[] {
  const points = Array.isArray(article.key_points) ? article.key_points : [];
  if (points.length === 0) return [];

  const today = todayStamp(now);
  const hits: DateHit[] = [];

  for (const raw of points) {
    const text = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;

    const isDeadline = hasMarker(text, DEADLINE_MARKERS);
    const isCalendar = hasMarker(text, CALENDAR_MARKERS);
    if (!isDeadline && !isCalendar) continue;

    const kind: DateKind = isDeadline ? "son-tarih" : "takvim";
    for (const stamp of parseDates(text)) {
      const days = Math.round((stamp - today) / DAY_MS);
      hits.push({
        iso: isoOf(stamp),
        days,
        kind,
        evidence: text,
        label: labelFor(days, kind),
      });
    }
  }

  return hits;
}

/**
 * Geri sayım için TEK tarih seçer: en yakın gelecekteki son başvuru tarihi.
 * Gelecekte hiç yoksa en YAKIN geçmiş tarihi "Süre doldu" olarak döndürür —
 * çünkü kullanıcı kaçırdığı son tarihi de görmek ister.
 * Hiç işaretli tarih yoksa `null`; o kalem normal haber gibi gösterilir.
 */
export function deadlineOf(
  article: Article,
  now: Date = new Date(),
): DateHit | null {
  const hits = extractDateHits(article, now).filter(
    (h) => h.kind === "son-tarih",
  );
  if (hits.length === 0) return null;

  const upcoming = hits.filter((h) => h.days >= 0);
  if (upcoming.length > 0) {
    return upcoming.reduce((a, b) => (b.days < a.days ? b : a));
  }
  return hits.reduce((a, b) => (b.days > a.days ? b : a));
}

/**
 * Mevzuat takvimi için tarih seçer: son başvuru tarihleri (geçmiş dahil) ve
 * YALNIZCA gelecekteki yürürlük/toplantı tarihleri. Geçmiş yürürlük tarihi
 * takvime yazılmaz — "12 Eylül'de yürürlüğe girdi" bir takvim kalemi değil,
 * tamamlanmış bir olaydır.
 */
export function calendarHitOf(
  article: Article,
  now: Date = new Date(),
): DateHit | null {
  const hits = extractDateHits(article, now).filter(
    (h) => h.kind === "son-tarih" || h.days >= 0,
  );
  if (hits.length === 0) return null;

  const upcoming = hits.filter((h) => h.days >= 0);
  if (upcoming.length > 0) {
    return upcoming.reduce((a, b) => (b.days < a.days ? b : a));
  }
  return hits.reduce((a, b) => (b.days > a.days ? b : a));
}

/** Geri sayım çipinin aciliyet sınıfı — palet dışına çıkmaz. */
export function urgencyOf(hit: DateHit): "gecti" | "yakin" | "normal" {
  if (hit.days < 0) return "gecti";
  if (hit.days <= 7) return "yakin";
  return "normal";
}
