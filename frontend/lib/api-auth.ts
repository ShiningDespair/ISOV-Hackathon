/**
 * KIMLIK DOGRULAMA ve PROFIL ISTEMCISI
 *
 * `lib/api.ts` DUZENLENMEZ: yazma yolu orada bir kez cozuldu ve `mutate()`
 * disa acildi. Bu dosya onu ice aktarir; okuma icin ayni deseni izleyen
 * kendi `getJson()` yardimcisini tasir.
 *
 * DORT KURAL (lib/api.ts ile ayni):
 *  1. Hicbir fonksiyon EXCEPTION FIRLATMAZ — hepsi `ApiResult<T>` doner.
 *  2. Her istek `credentials: "include"` tasir. Oturum httpOnly cerezle
 *     (`isov_session`) tasiniyor; cerez gonderilmezse giris yapilmis
 *     kullanici bile oturumsuz gorunur.
 *  3. Zaman asimi 8 sn — demo sirasinda sayfa asili kalmasin.
 *  4. Mesajlar Turkce ve tam cumle; dogrudan kullaniciya gosterilebilir.
 *
 * 501 ile 404 AYRI SEYLER:
 *   501 = uc nokta var, HENUZ UYGULANMADI (backend yer tutucusu).
 *   404 = uc nokta yok ya da `/api` vekili tanimli degil, yani SUNUCUYA
 *         ULASILAMIYOR.
 * Ikisini ayni mesajla gostermek, hangisinin eksik oldugunu gizler ve
 * yanlis yerde hata aranmasina yol acar. Bu yuzden `isNotImplemented()`
 * disa acik.
 */

import {
  apiBase,
  mutate,
  serverCookieHeader,
  type ApiResult,
} from "./api";
import { DENSITY } from "./api-panel";
import {
  normalizeFrequency,
  normalizeRole,
  normalizeSendHour,
  normalizeWeekday,
  type InterestTag,
  type LoginInput,
  type LoginResult,
  type MeResponse,
  type NewsletterSettings,
  type PositionOption,
  type ProfileInput,
  type RegisterInput,
  type SectorOption,
  type SessionUser,
  type Taxonomy,
  type TimeBudgetOption,
  type UserProfile,
} from "./types-auth";

/** Istek zaman asimi (ms) — lib/api.ts ile ayni deger. */
const TIMEOUT_MS = 8000;

/** "Henuz uygulanmadi" ayrimi tek yerde tanimli. */
export const NOT_IMPLEMENTED_MESSAGE =
  "Bu özellik henüz uygulanmadı. Sunucu tarafı hazırlandığında burada çalışacak.";

/** Uc nokta ya da vekil yok — sunucuya hic ulasilamadi. */
export const UNREACHABLE_MESSAGE =
  "Sunucuya ulaşılamadı. Bu işlem için gereken uç nokta yayında değil.";

/** Sonuc 501 mi? Arayuz bunu "eksik ozellik" olarak gosterir, hata olarak degil. */
export function isNotImplemented<T>(res: ApiResult<T>): boolean {
  return !res.ok && res.status === 501;
}

/** Sonuc 404/ag hatasi mi? Yani sunucuya ulasilamadi mi? */
export function isUnreachable<T>(res: ApiResult<T>): boolean {
  return !res.ok && (res.status === 404 || res.status === undefined);
}

/** Oturum gecersiz mi? Istemci katmani bunu gorurse /giris'e duser. */
export function isUnauthorized<T>(res: ApiResult<T>): boolean {
  return !res.ok && (res.status === 401 || res.status === 403);
}

/** Backend hata govdesinden okunur mesaj cikarir: {error:{code,message}}. */
function errorMessageFrom(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const err = obj.error;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object") {
    const msg = (err as Record<string, unknown>).message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  if (typeof obj.message === "string" && obj.message.trim()) {
    return obj.message.trim();
  }
  return null;
}

/**
 * Okuma istegi — timeout'lu, cerezli, ASLA firlatmaz.
 *
 * `lib/api.ts`'teki `request()` cerez GONDERMIYOR (acik uclar icin dogru
 * karar). Oturum gerektiren okumalar icin ayri yardimci sart.
 */
/**
 * ÇEREZ SUNUCUDA ELLE İLETİLİR — `credentials: "include"` yalnızca tarayıcıda
 * iş yapar. Bu dosyanın çağrıları çoğunlukla istemciden geliyor (giriş, kayıt,
 * profil kaydetme) ama `getTaxonomy`/`getInterests`/`getMe` bir sunucu
 * bileşeninden de çağrılabilir; o durumda oturum taşınmazsa yanıt sessizce
 * 401 olur. Yardımcı `lib/api.ts` içinde tanımlı ve PAYLAŞILIYOR.
 */
export async function getJson<T>(path: string): Promise<ApiResult<T>> {
  const url = `${apiBase().replace(/\/+$/, "")}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const cookieHeader = await serverCookieHeader();

  try {
    const res = await fetch(url, {
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
      headers: { Accept: "application/json", ...cookieHeader },
    });

    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (!res.ok) {
      const detail = errorMessageFrom(payload);
      if (res.status === 501) {
        return { ok: false, status: 501, error: NOT_IMPLEMENTED_MESSAGE, data: null };
      }
      if (res.status === 404) {
        return { ok: false, status: 404, error: UNREACHABLE_MESSAGE, data: null };
      }
      if (res.status === 401) {
        return {
          ok: false,
          status: 401,
          error: detail ?? "Oturumunuz sona ermiş. Yeniden giriş yapın.",
          data: null,
        };
      }
      if (res.status === 403) {
        return {
          ok: false,
          status: 403,
          error: detail ?? "Bu işlem için yetkiniz yok.",
          data: null,
        };
      }
      return {
        ok: false,
        status: res.status,
        error: detail ?? `Sunucu ${res.status} yanıtı döndürdü.`,
        data: null,
      };
    }

    // Backend {data:{...}} sarmalayabilir ya da duz obje dondurebilir.
    const raw = (payload ?? {}) as Record<string, unknown>;
    const value = (
      raw && typeof raw === "object" && "data" in raw && raw.data ? raw.data : raw
    ) as T;
    return { ok: true, data: value };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && err.name === "AbortError"
          ? "Sunucu zaman aşımına uğradı. Lütfen tekrar deneyin."
          : "Sunucuya ulaşılamadı.",
      data: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `mutate()` 501'i jenerik "Sunucu 501 yanıtı döndürdü." mesajina cevirir.
 * Auth akisinda bu ayrim kullaniciya gosterilecek kadar onemli, o yuzden
 * burada yeniden yaziyoruz.
 */
function refine<T>(res: ApiResult<T>): ApiResult<T> {
  if (res.ok) return res;
  if (res.status === 501) {
    return { ok: false, status: 501, error: NOT_IMPLEMENTED_MESSAGE, data: null };
  }
  return res;
}

/* ------------------------------------------------------------------ */
/* Kimlik dogrulama                                                    */
/* ------------------------------------------------------------------ */

/**
 * POST /auth/register — 201 + oturum cerezi.
 *
 * `tenant_key` GONDERILMIYOR. Sozlesmede alan opsiyonel, ama kurum
 * anahtarini istemcinin belirlemesi `tenantKeyOf()` guvenlik aciginin ta
 * kendisi: kullanici kendini baska bir kurumun icine yazamamali. Kurum
 * eslemesi sunucuda (e-posta alan adi / davet) cozulur.
 */
export async function register(
  input: RegisterInput,
): Promise<ApiResult<{ user?: SessionUser }>> {
  const body = {
    email: input.email.trim().toLowerCase(),
    password: input.password,
    full_name: input.full_name.trim(),
    ...(input.title && input.title.trim() ? { title: input.title.trim() } : {}),
  };
  const res = await mutate<{ user?: SessionUser }>("POST", "/auth/register", body, {
    conflict: "Bu e-posta adresi ile zaten bir hesap var. Giriş yapmayı deneyin.",
  });
  return refine(res);
}

/**
 * POST /auth/login — 200 + oturum cerezi.
 *
 * Kilit ve hiz siniri AYRI mesajlar aliyor: "yanlis sifre" ile "hesabiniz
 * kilitli" ayni mesaji paylasirsa kullanici sifresini tekrar tekrar dener
 * ve kilidi uzatir.
 */
export async function login(input: LoginInput): Promise<ApiResult<LoginResult>> {
  const res = await mutate<LoginResult>("POST", "/auth/login", {
    email: input.email.trim().toLowerCase(),
    password: input.password,
  });
  if (res.ok) return res;

  if (res.status === 401) {
    return {
      ok: false,
      status: 401,
      error: "E-posta veya şifre hatalı. Lütfen tekrar deneyin.",
      data: null,
    };
  }
  // 423 Locked — e-posta bazli kalici kilit (users.locked_until).
  if (res.status === 423) {
    return {
      ok: false,
      status: 423,
      error:
        "Hesabınız çok sayıda hatalı denemeden sonra geçici olarak kilitlendi. Bir süre sonra tekrar deneyin ya da şifrenizi sıfırlayın.",
      data: null,
    };
  }
  // 429 — IP anahtarli hiz siniri. Kilitten FARKLI: hesap degil, adres sinirli.
  if (res.status === 429) {
    return {
      ok: false,
      status: 429,
      error:
        "Kısa sürede çok fazla giriş denemesi yapıldı. Birkaç dakika bekleyip tekrar deneyin.",
      data: null,
    };
  }
  if (res.status === 403) {
    return {
      ok: false,
      status: 403,
      error: res.error || "Bu hesap askıya alınmış. Yöneticinizle görüşün.",
      data: null,
    };
  }
  return refine(res);
}

/** POST /auth/logout — oturumu iptal eder. */
export async function logout(): Promise<ApiResult<{ ok?: boolean }>> {
  return refine(await mutate<{ ok?: boolean }>("POST", "/auth/logout", {}));
}

/** GET /auth/me — oturum sahibi + profil + turetilmis duzen. */
export async function getMe(): Promise<ApiResult<MeResponse>> {
  const res = await getJson<Record<string, unknown>>("/auth/me");
  if (!res.ok) return res;
  return { ok: true, data: normalizeMe(res.data) };
}

/** POST /auth/password — mevcut sifre ile degistirme. */
export async function changePassword(
  current: string,
  next: string,
): Promise<ApiResult<{ ok?: boolean }>> {
  const res = await mutate<{ ok?: boolean }>("POST", "/auth/password", {
    current,
    next,
  });
  if (!res.ok && res.status === 401) {
    return {
      ok: false,
      status: 401,
      error: "Mevcut şifreniz hatalı.",
      data: null,
    };
  }
  return refine(res);
}

/**
 * POST /auth/password/reset-request — SMTP yoksa 202 doner, kayit acilir.
 *
 * Yanit her durumda AYNI: "adres kayitliysa baglanti gonderildi". Aksi
 * halde uc nokta e-posta dogrulayicisina donusur (hangi adresin kayitli
 * oldugunu sizdirir).
 */
export async function requestPasswordReset(
  email: string,
): Promise<ApiResult<{ ok?: boolean }>> {
  return refine(
    await mutate<{ ok?: boolean }>("POST", "/auth/password/reset-request", {
      email: email.trim().toLowerCase(),
    }),
  );
}

/** POST /auth/password/reset — tek kullanimlik token ile yeni sifre. */
export async function resetPassword(
  token: string,
  next: string,
): Promise<ApiResult<{ ok?: boolean }>> {
  const res = await mutate<{ ok?: boolean }>("POST", "/auth/password/reset", {
    token,
    next,
  });
  if (!res.ok && (res.status === 400 || res.status === 410 || res.status === 422)) {
    return {
      ok: false,
      status: res.status,
      error:
        "Bu sıfırlama bağlantısı geçersiz ya da süresi dolmuş. Yeni bir bağlantı isteyin.",
      data: null,
    };
  }
  return refine(res);
}

/* ------------------------------------------------------------------ */
/* Profil ve bulten                                                    */
/* ------------------------------------------------------------------ */

/**
 * PUT /me/profile — pozisyon, sektorler, ilgi alanlari, vakit.
 *
 * ALAN ADLARI SOZLESMEYLE BIREBIR OLMAK ZORUNDA: uc, tanimadigi alani
 * HATA VERMEDEN yok sayiyor (`body.X === undefined` -> eski deger korunur).
 * Yani `time_budget` yazmak 200 doner ama vakit secimi KAYBOLUR. Bu tur
 * sessiz kayip, hata mesajindan daha zararli.
 */
export async function saveProfile(
  input: ProfileInput,
): Promise<ApiResult<{ profile?: unknown }>> {
  return refine(
    await mutate<{ profile?: unknown }>("PUT", "/me/profile", {
      position_code: input.position_code,
      primary_sector_code: input.primary_sector_code,
      secondary_sector_codes: input.secondary_sector_codes,
      interest_tag_slugs: input.interest_tag_slugs,
      time_budget_min: input.time_budget_min,
    }),
  );
}

/**
 * PUT /me/newsletter — siklik, gonderim saati, haftalik gunu.
 *
 * Abonelikten cikmak `frequency: "kapali"`. Ayri bir `subscribed` alani
 * YOK; olsaydi "kapali ama gunluk" gibi celiskili kayitlar mumkun olurdu.
 *
 * `send_weekday` haftalik secildiginde gonderilir. Gonderilmezse backend
 * Pazartesi'ye duser; arayuz de "Pazartesi sabahı" yazdigi icin degeri
 * ACIKCA gondermek iki tarafi ayni sey konusur tutuyor.
 */
export async function saveNewsletter(
  input: NewsletterSettings,
): Promise<ApiResult<{ newsletter?: unknown }>> {
  const body: Record<string, unknown> = {
    frequency: input.frequency,
    send_hour: input.send_hour,
  };
  if (input.frequency === "haftalik") {
    body.send_weekday = normalizeWeekday(input.send_weekday ?? 1);
  }
  return refine(await mutate<{ newsletter?: unknown }>("PUT", "/me/newsletter", body));
}

/* ------------------------------------------------------------------ */
/* Taksonomi                                                           */
/* ------------------------------------------------------------------ */

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function firstKey(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

/** Duzen kodu -> aciklama haritasi; hem obje hem dizi bicimini kabul eder. */
function normalizeLayouts(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const code = str(firstKey(o, ["code", "key", "layout", "slug"]));
      const label = str(firstKey(o, ["label", "ad", "description", "aciklama"]));
      if (code) out[code] = label || code;
    }
    return out;
  }
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const label = typeof v === "string" ? v : str((v as Record<string, unknown>)?.label);
      out[k] = label || k;
    }
  }
  return out;
}

function normalizePositions(
  raw: unknown,
  layouts: Record<string, string>,
): PositionOption[] {
  if (!Array.isArray(raw)) return [];
  const out: PositionOption[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const code = str(item);
      if (code) out.push({ code, label: code, layout: "", layoutLabel: "" });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const code = str(firstKey(o, ["code", "key", "position_code", "slug"]));
    if (!code) continue;
    const layout = str(firstKey(o, ["layout", "duzen", "layout_code"]));
    out.push({
      code,
      label: str(firstKey(o, ["label", "ad", "title"])) || code,
      layout,
      layoutLabel:
        str(firstKey(o, ["layout_label", "layoutLabel", "duzen_aciklama"])) ||
        (layout ? layouts[layout] ?? "" : ""),
    });
  }
  return out;
}

function normalizeSectors(raw: unknown): SectorOption[] {
  if (!Array.isArray(raw)) return [];
  const out: SectorOption[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const code = str(firstKey(o, ["code", "nace", "key"]));
    const label = str(firstKey(o, ["label", "ad", "name"]));
    if (!code) continue;
    out.push({ code, label: label || code, group: str(o.group) || undefined });
  }
  return out;
}

const SAYI_ADI: Record<number, string> = { 1: "bir", 2: "iki", 3: "üç", 4: "dört", 5: "beş" };

/**
 * Vakit kademesinin açıklaması — sayıların HEPSİ yoğunluk tablosundan
 * (backend `lib/positions.js` DENSITY, yedeği `lib/api-panel.ts` DENSITY).
 *
 * NEDEN: metin eskiden elle yazılıydı ("ilk 10 haber tam özet, sonraki 20
 * haber üç madde") ve kademe 15 → 10 dakikaya inince güncellenmedi;
 * sihirbaz "10 dakika — 20 haber, ilk 10 tam özet, sonraki 20 üç madde"
 * yazdı (10 + 20 ≠ 20). Nilgün P1-4, Burak P2-3, Selin P2-3.
 */
export function densityDetail(d: {
  items: number;
  full?: number;
  bullets?: number;
  style?: string;
}): string {
  const items = Number(d.items) || 0;
  if (items <= 0) return "";
  const full = Math.max(0, Math.min(items, Number(d.full) || 0));
  const bullets = Number(d.bullets) || 0;
  const madde = bullets > 0 ? `${SAYI_ADI[bullets] ?? bullets} madde` : "madde";
  switch (d.style) {
    case "tek-cumle":
      return `${items} haber, her biri tek cümlede`;
    case "madde":
      return `${items} haber, her biri ${bullets > 0 ? `${SAYI_ADI[bullets] ?? bullets} maddede` : "maddeler hâlinde"}`;
    case "kademeli":
      return full > 0 && full < items
        ? `${items} haber: ilk ${full} haber tam özet, sonraki ${items - full} haber ${madde}`
        : `${items} haber`;
    default:
      return `${items} haber`;
  }
}

/**
 * Yogunluk tablosunu okur: `{ "2": {items,style}, "5": {...} }`.
 * Backend bunu `density` ALTINDA, vakit listesinden AYRI veriyor
 * (`time_budgets: [2,5,10]`). Ikisini birlestirmeden vakit adimi
 * "2 dakika" yazip ne getirdigini soylemezdi — oysa kullanicinin karari
 * tam olarak o bilgiye bagli.
 */
type DensityRow = { items: number; full: number; bullets: number; style: string };

function densityMap(raw: unknown): Map<number, DensityRow> {
  const out = new Map<number, DensityRow>();
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const minutes = Number(k);
    if (!Number.isFinite(minutes)) continue;
    const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    out.set(minutes, {
      items: Number(firstKey(o, ["items", "count", "haber"])) || 0,
      full: Number(firstKey(o, ["full", "tam"])) || 0,
      bullets: Number(firstKey(o, ["bullets", "madde"])) || 0,
      style: str(firstKey(o, ["style", "bicim"])),
    });
  }
  return out;
}

function normalizeTimeBudgets(raw: unknown, rawDensity?: unknown): TimeBudgetOption[] {
  const density = densityMap(rawDensity);
  const rows: Record<string, unknown>[] = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === "object") rows.push(item as Record<string, unknown>);
      // Duz sayi dizisi (`[2,5,10]`) — gercek backend bicimi.
      else if (Number.isFinite(Number(item))) rows.push({ minutes: Number(item) });
    }
  } else if (raw && typeof raw === "object") {
    // DENSITY bicimi dogrudan vakit listesi olarak gelmis olabilir.
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const row = (v && typeof v === "object" ? { ...(v as object) } : {}) as Record<
        string,
        unknown
      >;
      row.minutes = Number(k);
      rows.push(row);
    }
  }

  // Vakit listesi hic gelmediyse yogunluk tablosunun anahtarlarini kullan.
  if (rows.length === 0) {
    for (const minutes of density.keys()) rows.push({ minutes });
  }

  const out: TimeBudgetOption[] = [];
  for (const o of rows) {
    const minutes = Number(firstKey(o, ["minutes", "time_budget", "dakika", "value"]));
    if (!Number.isFinite(minutes) || minutes <= 0) continue;
    // Backend yoğunluğu gelmediyse istemcinin DENSITY kopyası (aynı sayılar).
    const d =
      density.get(minutes) ??
      (minutes in DENSITY ? (DENSITY[minutes as keyof typeof DENSITY] as DensityRow) : undefined);
    const items = Number(firstKey(o, ["items", "count", "haber"])) || d?.items || 0;
    const style = str(firstKey(o, ["style", "bicim"])) || d?.style || "";
    const full = Number(firstKey(o, ["full", "tam"])) || d?.full || 0;
    const bullets = Number(firstKey(o, ["bullets", "madde"])) || d?.bullets || 0;
    out.push({
      minutes,
      items,
      style,
      label: `${minutes} dakika`,
      detail:
        str(firstKey(o, ["detail", "aciklama", "description"])) ||
        densityDetail({ items, full, bullets, style }),
    });
  }
  out.sort((a, b) => a.minutes - b.minutes);
  return out;
}

/**
 * GET /meta/taxonomy — pozisyonlar, duzenler, NACE sektorleri, vakit
 * kademeleri.
 *
 * TOLERANSLI OKUMA: alan adlari hem Ingilizce hem Turkce, hem dizi hem
 * obje bicimiyle kabul edilir. Sebep: bu uc nokta bu satirlar yazilirken
 * henuz yayinda degil (501/404). Sikica tek bicime baglanmak, backend
 * kucuk bir isim farkiyla gelirse bos ekran uretir.
 *
 * Eksik ya da bos donen bolumleri cagiran taraf yerel yedekle tamamlar
 * (bkz. components/onboarding/taxonomy-fallback.ts).
 */
export async function getTaxonomy(): Promise<ApiResult<Taxonomy>> {
  const res = await getJson<Record<string, unknown>>("/meta/taxonomy");
  if (!res.ok) return res;
  const o = (res.data ?? {}) as Record<string, unknown>;
  const layouts = normalizeLayouts(
    firstKey(o, ["layouts", "duzenler", "LAYOUT_LABELS", "layout_labels"]),
  );
  return {
    ok: true,
    data: {
      layouts,
      positions: normalizePositions(
        firstKey(o, ["positions", "pozisyonlar", "POSITIONS"]),
        layouts,
      ),
      sectors: normalizeSectors(
        firstKey(o, ["sectors", "sektorler", "nace", "nace_sectors", "NACE_SECTORS"]),
      ),
      timeBudgets: normalizeTimeBudgets(
        firstKey(o, ["time_budgets", "timeBudgets", "vakit", "vakit_kademeleri"]),
        firstKey(o, ["density", "DENSITY", "yogunluk"]),
      ),
    },
  };
}

/**
 * GET /meta/interests — ilgi alani etiketleri.
 *
 * Duz dizi (`["tesvik", ...]`), obje dizisi (`[{slug,label}]`) ve
 * `{data:[...]}` bicimlerinin hepsi kabul edilir.
 */
export async function getInterests(limit = 72): Promise<ApiResult<InterestTag[]>> {
  // UST SINIR VAR: uc varsayilan olarak 200 etiket donuyor (kullanima gore
  // azalan). 200 cip bir ekranda karar verilemez bir duvar olur; en cok
  // gecen 72 etiket hem tarama yapilabilir bir liste hem de secimin
  // siralamayi gercekten etkilemesi icin yeterli (hic haberde gecmeyen bir
  // etiketi secmek siralamayi HIC degistirmez).
  const res = await getJson<unknown>(`/meta/interests?limit=${limit}`);
  if (!res.ok) return res;
  const raw = res.data;
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown>)?.interests)
      ? ((raw as Record<string, unknown>).interests as unknown[])
      : Array.isArray((raw as Record<string, unknown>)?.tags)
        ? ((raw as Record<string, unknown>).tags as unknown[])
        : [];

  const out: InterestTag[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    let slug = "";
    let label = "";
    let group: string | undefined;
    if (typeof item === "string") {
      slug = str(item);
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      slug = str(firstKey(o, ["slug", "code", "key", "tag"]));
      label = str(firstKey(o, ["label", "ad", "name", "title"]));
      group = str(firstKey(o, ["group", "grup", "kind", "tur"])) || undefined;
    }
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, label: label || slug, group });
  }
  return { ok: true, data: out };
}

/* ------------------------------------------------------------------ */
/* Yanit normalizasyonu                                                */
/* ------------------------------------------------------------------ */

function normalizeUser(raw: unknown): SessionUser {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    id: (o.id as number | string) ?? "",
    email: str(o.email),
    full_name: str(firstKey(o, ["full_name", "fullName", "ad_soyad"])),
    title: str(o.title) || null,
    role: normalizeRole(o.role),
    status: str(o.status) || null,
    // Kurum bilgisi ic ice gelebilir: `tenant: {tenant_key, name}`.
    tenant_key:
      str(firstKey(o, ["tenant_key", "tenantKey"])) ||
      str((o.tenant as Record<string, unknown> | undefined)?.tenant_key) ||
      null,
    // Kurum ADI da taşınır. Önceden yalnızca anahtar taşınıyordu ve Hesabım
    // menüsü kurum satırında "İstanbul Sanayi Odası Vakfı" yerine "isov"
    // basıyordu (persona testi ekran görüntüsü). Backend adı zaten veriyor.
    tenant_name:
      str(firstKey(o, ["tenant_name", "tenantName"])) ||
      str((o.tenant as Record<string, unknown> | undefined)?.name) ||
      null,
    must_change_password: Boolean(
      firstKey(o, ["must_change_password", "mustChangePassword"]),
    ),
  };
}

/**
 * Profil yanitini tek bicime indirger.
 *
 * `GET /auth/me` profili `serializeProfile()` bicimiyle veriyor:
 * `time_budget_min`, `primary_sector: {code,label}`,
 * `secondary_sectors: [{code,label}]`, `vector: {status,...}`.
 * Duz kod alanlari (`primary_sector_code`) da kabul edilir — iki bicim de
 * gecerli sayilir ki uc kucuk bir degisiklikte arayuzu bos birakmasin.
 */
function codeOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    return str((value as Record<string, unknown>).code);
  }
  return "";
}

function normalizeProfile(raw: unknown): UserProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const secondary = firstKey(o, ["secondary_sectors", "secondary_sector_codes"]);
  const interests = firstKey(o, ["interest_tag_slugs", "interests"]);
  const regions = firstKey(o, ["region_focus", "regions"]);
  const vector = (o.vector ?? {}) as Record<string, unknown>;
  return {
    position_code: str(firstKey(o, ["position_code", "position"])) || "ust-yonetim",
    primary_sector_code:
      codeOf(firstKey(o, ["primary_sector", "primary_sector_code", "sector_primary"])) ||
      null,
    secondary_sector_codes: Array.isArray(secondary)
      ? secondary.map(codeOf).filter(Boolean)
      : [],
    interest_tag_slugs: Array.isArray(interests)
      ? interests.map(str).filter(Boolean)
      : [],
    time_budget_min:
      Number(firstKey(o, ["time_budget_min", "time_budget", "timeBudget"])) || 5,
    region_focus: Array.isArray(regions) ? regions.map(str).filter(Boolean) : [],
    vector_status:
      str(firstKey(vector, ["status"])) ||
      str(firstKey(o, ["profile_vector_status"])) ||
      null,
  };
}

function normalizeNewsletter(raw: unknown): NewsletterSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    frequency: normalizeFrequency(firstKey(o, ["frequency", "siklik"])),
    send_hour: normalizeSendHour(firstKey(o, ["send_hour", "sendHour", "saat"])),
    send_weekday:
      o.send_weekday === null || o.send_weekday === undefined
        ? null
        : normalizeWeekday(o.send_weekday),
  };
}

/** `/auth/me` yanitini tek bicime indirger; kullanici duz de gelebilir. */
function normalizeMe(raw: unknown): MeResponse {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const userRaw = o.user ?? o;
  return {
    user: normalizeUser(userRaw),
    profile: normalizeProfile(o.profile),
    layout: str(firstKey(o, ["layout", "duzen"])) || null,
    newsletter: normalizeNewsletter(o.newsletter),
  };
}

/* ------------------------------------------------------------------ */
/* Yonlendirme yardimcilari                                            */
/* ------------------------------------------------------------------ */

/**
 * `?devam=` parametresini GUVENLI hale getirir.
 *
 * Acik yonlendirme (open redirect) korumasi: yalnizca tek egik cizgiyle
 * baslayan, kendi kokumuzdeki yollar kabul edilir. `//baska.site` ve
 * `https://baska.site` tarayicida mutlak adres olarak cozulur — reddedilir.
 * Giris/kayit sayfalarina geri donmek de dongu uretir, onlar da reddedilir.
 */
export function safeNextPath(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  if (value.includes("://") || value.includes("\\")) return "/";
  const path = value.split(/[?#]/)[0] ?? "/";
  if (path === "/giris" || path === "/kayit") return "/";
  return value;
}

/** Oturum bittiyse gidilecek adres — `?devam=` ile gelinen yolu korur. */
export function loginPathFor(pathname: string, search = ""): string {
  const target = `${pathname}${search}`;
  if (!pathname || pathname === "/") return "/giris";
  return `/giris?devam=${encodeURIComponent(target)}`;
}
