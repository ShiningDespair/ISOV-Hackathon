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
 *  2) YIL METİNDEN GELİR. Yılsız bir tarih ("ön kayıt 22 Ekim") YALNIZCA
 *     aynı maddede yıllı bir tarih varsa ve ona en yakın yıla bağlanarak
 *     kabul edilir. Maddede hiç yıl yoksa tarih alınmaz (tahmin yok).
 *     NEDEN değişti (Burak P1-2, 25 Eylül 2026): "1501 son başvuru 26 Ekim
 *     2026 (ön kayıt 22 Ekim)" maddesinde yılsız ön kayıt atlanıyor,
 *     listede 26 Ekim görünüyordu; 4 gün önceki ön kayıt kaçarsa başvuru
 *     yapılamıyor. Aynı kural 1707'de ("ön kayıt son tarihi 11 Kasım 2026")
 *     ön kaydı gösteriyordu — kullanıcı için kural tutarsızdı.
 *
 *  3) ARALIK BAŞI SON TARİH DEĞİLDİR. "1 Eylül - 13 Kasım 2026" içinde
 *     başlangıç atlanır; bitiş "Son başvuru" sayılır (madde başvuru ya da
 *     çağrıdan söz ediyorsa).
 *
 *  4) HER TARİHİN TÜRÜ YAZILIR (`step`): "Ön kayıt", "Son başvuru", "Son
 *     kredi kullanımı"… Tür, tarihin bulunduğu CÜMLECİKTEN (virgül, noktalı
 *     virgül, parantez arası) okunur; cümlecikte işaret yoksa "Son tarih".
 *     Geri sayım en yakın GELECEK tarihe (sıradaki adım) yapılır ve adımın
 *     türü yanında yazılır.
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
  /**
   * Adımın türü: "Ön kayıt", "Son başvuru", "Son tarih", "Takvim"…
   * Metindeki cümlecikten okunur, uydurulmaz.
   */
  step: string;
  /** Yıl metinde bu tarihin yanında değil, aynı maddedeki başka tarihten mi? */
  yearInferred: boolean;
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

/** Metindeki bir tarih eşleşmesi — konumuyla (tür ve aralık tespiti için). */
interface DateMatch {
  stamp: number;
  start: number;
  end: number;
  yearInferred: boolean;
}

const MONTH_PATTERN = Object.keys(MONTHS).join("|");

/**
 * Bir metindeki tüm tarihleri metin sırasında döndürür.
 * Yılsız tarihler ("22 Ekim") yalnızca metinde yıllı bir tarih varsa, ona
 * en yakın yıla bağlanarak alınır (±1 yıl adayından referansa en yakını).
 */
function parseDates(text: string): DateMatch[] {
  const found: DateMatch[] = [];
  const lowered = lower(text);

  const written = new RegExp(
    `(\\d{1,2})\\s+(${MONTH_PATTERN})\\s+(\\d{4})`,
    "g",
  );
  let m: RegExpExecArray | null;
  while ((m = written.exec(lowered)) !== null) {
    const day = Number(m[1]);
    const month = MONTHS[m[2] ?? ""] ?? 0;
    const year = Number(m[3]);
    if (day >= 1 && day <= 31 && month >= 1 && year >= 2000 && year <= 2100) {
      found.push({
        stamp: Date.UTC(year, month - 1, day),
        start: m.index,
        end: m.index + m[0].length,
        yearInferred: false,
      });
    }
  }

  const numeric = /(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/g;
  while ((m = numeric.exec(lowered)) !== null) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      found.push({
        stamp: Date.UTC(year, month - 1, day),
        start: m.index,
        end: m.index + m[0].length,
        yearInferred: false,
      });
    }
  }

  const full = [...found];
  if (full.length > 0) {
    const yearless = new RegExp(
      `(?<![\\d.])(\\d{1,2})\\s+(${MONTH_PATTERN})(?![a-zçğıöşü]*\\s+\\d{4})`,
      "g",
    );
    while ((m = yearless.exec(lowered)) !== null) {
      const start = m.index;
      if (full.some((f) => start >= f.start && start < f.end)) continue;
      const day = Number(m[1]);
      const month = MONTHS[m[2] ?? ""] ?? 0;
      if (day < 1 || day > 31 || month < 1) continue;
      // Referans: metinde bu tarihe EN YAKIN yıllı tarih.
      const ref = full.reduce((a, b) =>
        Math.abs(b.start - start) < Math.abs(a.start - start) ? b : a,
      );
      const refYear = new Date(ref.stamp).getUTCFullYear();
      const stamp = [refYear - 1, refYear, refYear + 1]
        .map((y) => Date.UTC(y, month - 1, day))
        .reduce((a, b) =>
          Math.abs(b - ref.stamp) < Math.abs(a - ref.stamp) ? b : a,
        );
      found.push({ stamp, start, end: start + m[0].length, yearInferred: true });
    }
  }

  return found.sort((a, b) => a.start - b.start);
}

/** Tarihten hemen sonra "- 13 Kasım" gibi ikinci bir tarih geliyor mu? */
function isRangeStart(lowered: string, end: number): boolean {
  const rest = lowered.slice(end);
  return new RegExp(
    `^\\s*[-–—]\\s*(\\d{1,2}\\s+(${MONTH_PATTERN})|\\d{1,2}[./]\\d{1,2}[./]\\d{4})`,
  ).test(rest);
}

/** Tarihten hemen önce "1 Eylül - " ya da "7-" (7-30 Eylül) gibi aralık başı var mı? */
function isRangeEnd(lowered: string, start: number): boolean {
  const before = lowered.slice(0, start);
  return new RegExp(
    `(\\d{1,2}(\\s+(${MONTH_PATTERN})(\\s+\\d{4})?)?|\\d{1,2}[./]\\d{1,2}[./]\\d{4})\\s*[-–—]\\s*$`,
  ).test(before);
}

/**
 * Adım türleri — ÖNCELİK SIRASIYLA. "ön kayıt son tarihi 11 Kasım"
 * cümleciğinde hem "ön kayıt" hem "son tarih" var; doğru tür "Ön kayıt".
 */
const STEP_MARKERS: Array<[string, string]> = [
  ["ön kayıt", "Ön kayıt"],
  ["son başvuru", "Son başvuru"],
  ["başvuru son", "Son başvuru"],
  ["kadar başvuru", "Son başvuru"],
  ["son kredi kullanımı", "Son kredi kullanımı"],
  ["son teslim", "Son teslim"],
  ["son kayıt", "Son kayıt"],
  ["son ödeme", "Son ödeme"],
];

/** Tarihin içinde durduğu cümlecik (virgül, noktalı virgül, parantez arası). */
function clauseAround(lowered: string, start: number, end: number): { before: string; after: string } {
  const breaks = /[,;()]/;
  let a = start;
  while (a > 0 && !breaks.test(lowered[a - 1] ?? "")) a--;
  let b = end;
  while (b < lowered.length && !breaks.test(lowered[b] ?? "")) b++;
  return { before: lowered.slice(a, start), after: lowered.slice(end, b) };
}

function stepOf(lowered: string, match: DateMatch): string {
  const { before, after } = clauseAround(lowered, match.start, match.end);
  for (const part of [before, after]) {
    for (const [marker, label] of STEP_MARKERS) {
      if (part.includes(marker)) return label;
    }
  }
  if (isRangeEnd(lowered, match.start) && /başvuru|çağrı/.test(lowered)) {
    return "Son başvuru";
  }
  return "Son tarih";
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
    const lowered = lower(text);
    for (const match of parseDates(text)) {
      // ESKİ TARİH: "14 Ağustos'tan 18 Eylül 2026'ya uzatıldı" — ayrılma
      // ekli tarih uzatma/ertelemede ESKİ son tarihtir, adım değildir
      // (korpusta #39; almasaydık "Son başvuru: 14 Ağustos" uydururduk).
      if (
        /^['’]?(t|d)(a|e)n(?![a-zçğıöşü])/.test(lowered.slice(match.end)) &&
        /uzat|ertele/.test(lowered)
      ) {
        continue;
      }
      const rangeStart = isRangeStart(lowered, match.end);
      // Son tarihte aralık başı hiç alınmaz; takvimde yalnızca yılsız
      // aralık başı atlanır (eski davranış: yıllı başlangıç takvim olayı).
      if (rangeStart && (kind === "son-tarih" || match.yearInferred)) continue;
      const days = Math.round((match.stamp - today) / DAY_MS);
      const iso = isoOf(match.stamp);
      const step = kind === "son-tarih" ? stepOf(lowered, match) : "Takvim";
      // Aynı madde/aynı haber içinde aynı tarih+tür bir kez.
      if (hits.some((h) => h.iso === iso && h.step === step)) continue;
      hits.push({
        iso,
        days,
        kind,
        evidence: text,
        label: labelFor(days, kind),
        step,
        yearInferred: match.yearInferred,
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
 * Bir haberin TÜM son tarih adımları, tarih sırasında (haber içi — haber
 * sıralamasına dokunmaz). Yapılacaklar satırında "Ön kayıt: 22 Ekim ·
 * Son başvuru: 26 Ekim" dizisini ve CSV sütunlarını besler.
 */
export function deadlineStepsOf(
  article: Article,
  now: Date = new Date(),
): DateHit[] {
  return extractDateHits(article, now)
    .filter((h) => h.kind === "son-tarih")
    .sort((a, b) => a.days - b.days);
}

/** "22 Ekim 2026" → "22 Ekim" (yıl bu yılsa kısaltılır, satır kısa kalsın). */
export function formatHitDateShort(iso: string, now: Date = new Date()): string {
  const full = formatHitDate(iso);
  const thisYear = new Date(todayStamp(now)).getUTCFullYear();
  return full.endsWith(` ${thisYear}`) ? full.slice(0, -5) : full;
}

/** "Süresi doldu (10 gün önce)" */
export function expiredLabel(days: number): string {
  const n = Math.abs(days);
  return n === 0 ? "Süresi doldu (bugün)" : `Süresi doldu (${n} gün önce)`;
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
