/**
 * VERİ TAZELİĞİ — künyedeki "Son veri: 12 Eylül 2026 · 13 gün önce".
 *
 * NEDEN VAR: persona testinde (Selin, 25 Eylül 2026) künye "Cuma, 25 Eylül
 * 2026 · Sayı No 2026-268", altbilgi "Son güncelleme: 25 Eylül" yazıyordu;
 * oysa 115 haberin en yenisi 12 Eylül tarihliydi. Sürekli toplama çalışmıyor,
 * veri bir kez tohumlandı. Bugünün tarihinden türetilen her damga okura
 * 13 günlük haberi "bugünün sayısı" diye sunuyordu.
 *
 * KAYNAK: GET /stats/freshness (iki MAX/LIMIT 1 sorgusu). Uç henüz
 * yayında değilse (404) /stats/overview'daki `totals.last_published_at`e
 * düşer — aynı tarih, daha pahalı sorgu. İkisi de yoksa `null` döner ve
 * arayüz hiçbir tarih BASMAZ (uydurma yok).
 *
 * MALİYET: künye HER sayfada basılıyor. Sonuç kullanıcıya özgü değil
 * (tüm korpusun en yeni haberi), o yüzden sunucu sürecinde 5 dakikalık
 * TEK bir bellek önbelleği tutuluyor: sayfa başına ek istek ≈ 0. Yine de
 * panel kapalı (backend/src/routes/index.js) — oturum çerezi olmayan
 * istekte önbellekten bile olsa tarih gösterilmez.
 *
 * Asla exception fırlatmaz.
 */

import { apiBase, serverCookieHeader } from "./api";

export interface Freshness {
  /** En yeni haberin yayın anı (ISO). */
  lastDataAt: string;
  /** Europe/Istanbul takvim günü farkı (bugün − son veri günü), ≥ 0. */
  ageDays: number;
  /** 2 günden eski mi — künye görsel olarak uyarır. */
  stale: boolean;
  /** Son toplama çalışması (varsa) ve kaç YENİ haber getirdiği. */
  lastRunAt: string | null;
  lastRunNew: number | null;
}

/** Bu eşikten (gün) eski veri "eski" sayılır. Görev tanımı: 2 gün. */
export const STALE_AFTER_DAYS = 2;

const TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 3000;

let memo: { at: number; value: Freshness | null } | null = null;

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Istanbul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** İki anın Europe/Istanbul takvimindeki gün farkı. */
export function calendarDaysBetween(from: Date, to: Date): number {
  const a = Date.parse(`${dayKeyFmt.format(from)}T00:00:00Z`);
  const b = Date.parse(`${dayKeyFmt.format(to)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** "bugün" / "dün" / "13 gün önce" */
export function ageLabel(days: number): string {
  if (days <= 0) return "bugün";
  if (days === 1) return "dün";
  return `${days} gün önce`;
}

async function getJson(path: string, cookie: Record<string, string>): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBase().replace(/\/+$/, "")}${path}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", ...cookie },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function pickIso(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  return Number.isNaN(Date.parse(v)) ? null : v;
}

function build(lastDataAt: string, lastRunAt: string | null, lastRunNew: number | null): Freshness {
  const ageDays = calendarDaysBetween(new Date(lastDataAt), new Date());
  return {
    lastDataAt,
    ageDays,
    stale: ageDays > STALE_AFTER_DAYS,
    lastRunAt,
    lastRunNew,
  };
}

async function load(cookie: Record<string, string>): Promise<Freshness | null> {
  const fresh = (await getJson("/stats/freshness", cookie)) as
    | { last_published_at?: unknown; last_run?: { finished_at?: unknown; started_at?: unknown; new_count?: unknown } | null }
    | null;
  if (fresh) {
    const at = pickIso(fresh.last_published_at);
    if (!at) return null;
    const run = fresh.last_run ?? null;
    const runAt = run ? pickIso(run.finished_at) ?? pickIso(run.started_at) : null;
    const runNew = run && typeof run.new_count === "number" ? run.new_count : null;
    return build(at, runAt, runNew);
  }
  // Geri düşüş: yeni uç yayına çıkmadan önce de dürüst tarih gösterilsin.
  const ov = (await getJson("/stats/overview", cookie)) as
    | { totals?: { last_published_at?: unknown } | null; last_run?: { finished_at?: unknown; new_count?: unknown } | null }
    | null;
  const at = pickIso(ov?.totals?.last_published_at);
  if (!at) return null;
  const runAt = pickIso(ov?.last_run?.finished_at);
  const runNew = typeof ov?.last_run?.new_count === "number" ? ov.last_run.new_count : null;
  return build(at, runAt, runNew);
}

/**
 * Sunucu bileşenleri için. Oturumsuz istekte `null`.
 * Önbellekteki değerin `ageDays`i her çağrıda yeniden hesaplanır — gece
 * yarısını geçen önbellek "12 gün önce" demeye devam etmesin.
 */
export async function getFreshness(): Promise<Freshness | null> {
  try {
    const cookie = await serverCookieHeader();
    if (!cookie.cookie || !/(?:^|;\s*)isov_session=/.test(cookie.cookie)) return null;

    const now = Date.now();
    if (!memo || now - memo.at > TTL_MS) {
      const value = await load(cookie);
      // Başarısız okuma kısa süre önbellekte kalır: backend geç kalktıysa
      // her sayfa 3 sn zaman aşımı beklemesin, ama 5 dk da "—" kalmasın.
      memo = { at: value ? now : now - TTL_MS + 30_000, value };
    }
    const v = memo.value;
    return v ? build(v.lastDataAt, v.lastRunAt, v.lastRunNew) : null;
  } catch {
    return null;
  }
}

/**
 * Sayı No — yılın kaçıncı günü, ama BUGÜNÜN değil VERİNİN günü.
 * Yeni veri gelmedikçe sayı ilerlemez; eskiden `issueNumber(new Date())`
 * her gün artıyor ve 13 günlük korpusa "2026-268" diye yeni sayı basıyordu.
 */
export function issueNumberFor(iso: string): string {
  const key = dayKeyFmt.format(new Date(iso)); // YYYY-MM-DD, TRT
  const [y, m, d] = key.split("-").map(Number);
  const day = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1;
  return `${y}–${String(day).padStart(3, "0")}`;
}
