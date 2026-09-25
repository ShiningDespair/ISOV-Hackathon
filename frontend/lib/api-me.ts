/**
 * `/me/*` ve `/changes` İSTEMCİSİ
 *
 * Kişiselleştirme uçları (gizleme, paylaşım kaydı, değişiklik takibi)
 * `lib/api.ts`'in dışında durur: o dosya paralel çalışmada çakışma
 * üretiyordu, sözleşme gereği yalnızca `mutate()` dışa açık.
 *
 * ÜÇ KURAL:
 *  1. Hiçbir fonksiyon exception fırlatmaz — `ApiResult` döner.
 *  2. Uç nokta henüz yayında değilse backend 501 (yer tutucu router) ya da
 *     404 (eski imaj / vekil yok) döner. İkisi de "henüz yok" demektir;
 *     `hazirDegil()` bunu tek yerde ayırır. Arayüz bu durumda sayı UYDURMAZ,
 *     ilgili satırı hiç göstermez.
 *  3. Oturum httpOnly çerezle taşınır → `credentials: "include"` ZORUNLU.
 */

import {
  apiBase,
  buildQuery,
  mutate,
  serverCookieHeader,
  type ApiResult,
} from "./api";
import { bandLabel } from "./format";
import type { Article, Paginated, Source } from "./types";

/** İstek zaman aşımı (ms) — panel demo sırasında asılı kalmasın. */
const TIMEOUT_MS = 8000;

/* ------------------------------------------------------------------ */
/* Düşük seviye GET                                                    */
/* ------------------------------------------------------------------ */

/**
 * GET — timeout'lu, çerezli, asla fırlatmaz.
 *
 * ÇEREZ SUNUCUDA ELLE İLETİLİR. `credentials: "include"` YALNIZCA tarayıcıda
 * iş yapar; sunucu bileşeninden atılan `fetch` tarayıcının çerezini
 * kendiliğinden taşımaz. Bu eksik ÖLÇÜLEN bir hataya yol açtı: giriş yapmış
 * kullanıcıda /raporlar içindeki Değişiklikler modülü "oturum gerektiriyor —
 * eksik olan giriş" yazıyordu, çünkü sunucudan atılan /changes isteği 401
 * alıyordu. Aynı hata daha önce `lib/api.ts` içinde bültenin boş kalmasına
 * yol açtı; yardımcı orada tanımlı ve buradan PAYLAŞILIYOR, ikinci bir kopya
 * çıkarılmıyor.
 */
async function getJson<T>(path: string): Promise<ApiResult<T>> {
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
      return {
        ok: false,
        status: res.status,
        error: mesaj(res.status, payload),
        data: null,
      };
    }
    return { ok: true, data: (payload ?? {}) as T };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && err.name === "AbortError"
          ? "Sunucu zaman aşımına uğradı."
          : "Sunucuya ulaşılamadı.",
      data: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Backend hata gövdesinden mesaj çıkarır: `{error:{code,message}}`. */
function govdeMesaji(payload: unknown): string | null {
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

function mesaj(status: number, payload: unknown): string {
  const detay = govdeMesaji(payload);
  if (status === 501) return "Bu özellik sunucuda henüz uygulanmadı.";
  if (status === 404) return "Bu özellik için gereken uç nokta yayında değil.";
  if (status === 401) return "Bu işlem için giriş yapmanız gerekiyor.";
  if (status === 403) return "Bu işlem için yetkiniz yok.";
  if (status === 429) return "Çok fazla deneme yapıldı. Lütfen biraz bekleyin.";
  return detay ?? `Sunucu ${status} yanıtı döndürdü.`;
}

/**
 * Uç nokta HENÜZ YOK mu?
 *
 * 501 = yer tutucu router açıkça "uygulanmadı" diyor.
 * 404 = router hiç bağlanmamış ya da `/api` vekili yok.
 * Her ikisinde de kullanıcıya "bozuk" değil "henüz yok" denir ve sayı
 * gösteren satırlar tamamen gizlenir.
 */
export function hazirDegil(status?: number): boolean {
  return status === 501 || status === 404;
}

/** Oturum gerekiyor mu (401/403)? */
export function oturumGerekli(status?: number): boolean {
  return status === 401 || status === 403;
}

/* ------------------------------------------------------------------ */
/* Değişiklik türleri                                                  */
/* ------------------------------------------------------------------ */

/** CONTRACT.md → `article_changes.change_type` ENUM'u ile birebir. */
export const CHANGE_TYPES = [
  "yeni",
  "kume-buyudu",
  "band-yukseldi",
  "dosya-gelismesi",
  "ozet-guncellendi",
] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const CHANGE_TYPE_LABEL: Record<ChangeType, string> = {
  yeni: "Yeni haber",
  "kume-buyudu": "Küme büyüdü",
  "band-yukseldi": "Band yükseldi",
  "dosya-gelismesi": "Dosya gelişmesi",
  "ozet-guncellendi": "Özet güncellendi",
};

/** Satır başındaki çok kısa etiket — tek kelimeye yakın. */
export const CHANGE_TYPE_KISA: Record<ChangeType, string> = {
  yeni: "Yeni",
  "kume-buyudu": "Küme",
  "band-yukseldi": "Band",
  "dosya-gelismesi": "Dosya",
  "ozet-guncellendi": "Özet",
};

/** Tür açıklaması — genişletilmiş detayda gösterilir. */
export const CHANGE_TYPE_ACIKLAMA: Record<ChangeType, string> = {
  yeni: "Haber bültene ilk kez girdi.",
  "kume-buyudu":
    "Aynı olayı doğrulayan bağımsız kaynak sayısı arttı; tekilleştirme kümesi büyüdü.",
  "band-yukseldi":
    "Haberin önem bandı yukarı taşındı. Yalnızca yukarı yönlü değişim kaydedilir.",
  "dosya-gelismesi":
    "Aynı mevzuat dosyasında yeni bir aşama görüldü (taslak → nihai gibi).",
  "ozet-guncellendi": "Haberin özeti yenilendi; içerik değişmedi.",
};

export function normalizeChangeType(value?: string | null): ChangeType | null {
  const v = String(value ?? "").trim().toLowerCase();
  return (CHANGE_TYPES as readonly string[]).includes(v)
    ? (v as ChangeType)
    : null;
}

export function changeTypeLabel(value?: string | null): string {
  const t = normalizeChangeType(value);
  return t ? CHANGE_TYPE_LABEL[t] : "Değişiklik";
}

/* ------------------------------------------------------------------ */
/* Değişiklik kaydı                                                    */
/* ------------------------------------------------------------------ */

/**
 * `GET /changes` kaydı.
 *
 * Backend paralel yazılıyor; alan adları için birden fazla olasılık
 * kabul edilir (`payload` içinde ya da düz kolon olarak). Hiçbir alan
 * zorunlu değil — eksik alan satırı bozmaz, yalnızca o parçayı gizler.
 */
export interface ChangeItem {
  id?: number | null;
  article_id?: number | null;
  change_type?: string | null;
  change_key?: string | null;
  thread_id?: number | null;
  /** Onaysız dosya gelişmesi: 0/false → kullanıcıya çekinceli gösterilir. */
  is_confirmed?: boolean | number | null;
  detected_at?: string | null;
  created_at?: string | null;
  changed_at?: string | null;
  /** Serbest biçimli ayrıntı: eski/yeni değerler burada olabilir. */
  payload?: Record<string, unknown> | null;
  detail?: Record<string, unknown> | null;
  old_value?: string | number | null;
  new_value?: string | number | null;
  note?: string | null;
  /** Haber gömülü gelebilir ya da alanları düz gelebilir. */
  article?: Article | null;
  title?: string | null;
  url?: string | null;
  source?: Source | null;
  source_name?: string | null;
  published_at?: string | null;
  importance_band?: string | null;
}

/** `GET /changes` yanıtı — sayfalı liste + (varsa) türe göre sayımlar. */
export interface ChangesPage extends Paginated<ChangeItem> {
  /** Türe göre toplamlar; backend vermezse listeden hesaplanır. */
  counts: Partial<Record<ChangeType, number>>;
  /** Sayımlar listeden mi türetildi? Sayfalıysa liste eksik olabilir. */
  countsFromList: boolean;
}

export interface ChangesQuery {
  from?: string;
  to?: string;
  type?: string;
  article_id?: number;
  limit?: number;
  page?: number;
}

function sayi(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function kayitDizisi(raw: unknown): ChangeItem[] {
  if (Array.isArray(raw)) return raw as ChangeItem[];
  const obj = (raw ?? {}) as Record<string, unknown>;
  for (const key of ["data", "items", "changes"]) {
    const v = obj[key];
    if (Array.isArray(v)) return v as ChangeItem[];
  }
  return [];
}

function turSayimlari(
  raw: unknown,
  items: ChangeItem[],
): { counts: Partial<Record<ChangeType, number>>; fromList: boolean } {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const kaynak = (obj.counts ?? obj.by_type ?? obj.totals_by_type) as unknown;

  if (kaynak && typeof kaynak === "object" && !Array.isArray(kaynak)) {
    const out: Partial<Record<ChangeType, number>> = {};
    let dolu = false;
    for (const [k, v] of Object.entries(kaynak as Record<string, unknown>)) {
      const t = normalizeChangeType(k);
      const n = sayi(v);
      if (t && n !== null) {
        out[t] = n;
        dolu = true;
      }
    }
    if (dolu) return { counts: out, fromList: false };
  }

  const out: Partial<Record<ChangeType, number>> = {};
  for (const item of items) {
    const t = normalizeChangeType(item.change_type);
    if (!t) continue;
    out[t] = (out[t] ?? 0) + 1;
  }
  return { counts: out, fromList: true };
}

/** GET /changes — değişiklik akışı. */
export async function getChanges(
  query: ChangesQuery = {},
): Promise<ApiResult<ChangesPage>> {
  const res = await getJson<unknown>(`/changes${buildQuery({ ...query })}`);
  if (!res.ok) return res;

  const raw = res.data as Record<string, unknown>;
  const items = kayitDizisi(raw);
  const { counts, fromList } = turSayimlari(raw, items);
  const limit = sayi(raw?.limit) ?? query.limit ?? items.length;
  const total = sayi(raw?.total) ?? items.length;
  const page = sayi(raw?.page) ?? query.page ?? 1;

  return {
    ok: true,
    data: {
      data: items,
      page,
      limit: limit || items.length,
      total,
      totalPages:
        sayi(raw?.totalPages) ??
        Math.max(1, Math.ceil(total / Math.max(1, limit || 1))),
      counts,
      countsFromList: fromList,
    },
  };
}

/**
 * OKUR İÇİN GÜRÜLTÜ OLAN TÜR.
 *
 * Ölçüm (25 Eylül 2026, /raporlar): 235 kaydın 115'i "Özet güncellendi —
 * içerik değişmedi"; kısa dökümün beş satırının beşini de bunlar
 * dolduruyordu (Selin P1-8, Burak P1-6, Nilgün P1-5). Varsayılan görünüm
 * bu türü dışarıda bırakır; tür süzgecinden hâlâ seçilir ve kaç kaydın
 * gizlendiği her zaman söylenir.
 */
export const TEKNIK_TUR: ChangeType = "ozet-guncellendi";

/**
 * GET /changes — TÜM sayfalar (en çok `maxPages`), API sırası korunarak.
 *
 * NEDEN: backend `limit`i 100'de kesiyor (`MAX_LIMIT`, lib/http.js);
 * sayfa eskiden `limit: 200` isteyip 100 alıyordu. Teknik türü istemcide
 * süzünce ilk 100 kaydın yarısı gidiyor, geriye eksik bir liste kalıyordu.
 * Sayfalar paralel çekilir ve SIRAYLA birleştirilir (yeniden sıralama yok).
 * `complete` false ise liste eksiktir; arayüz bunu söyler.
 */
export async function getChangesAll(
  query: Omit<ChangesQuery, "page" | "limit"> = {},
  maxPages = 5,
): Promise<ApiResult<ChangesPage & { complete: boolean }>> {
  const PAGE = 100;
  const first = await getChanges({ ...query, limit: PAGE, page: 1 });
  if (!first.ok) return first;
  const pages = Math.min(maxPages, Math.max(1, Math.ceil(first.data.total / PAGE)));
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) =>
      getChanges({ ...query, limit: PAGE, page: i + 2 }),
    ),
  );
  const items = [...first.data.data];
  let complete = true;
  for (const r of rest) {
    if (!r.ok) {
      complete = false;
      break;
    }
    items.push(...r.data.data);
  }
  if (items.length < first.data.total) complete = false;
  return {
    ok: true,
    data: { ...first.data, data: items, page: 1, limit: items.length, totalPages: 1, complete },
  };
}

/** `GET /me/changes` — son ziyaretten beri olanlar. */
export interface MeChanges {
  /** Son ziyaretten beri değişiklik sayısı. */
  total: number;
  /**
   * Eşik zamanı (ISO). DİKKAT: bu her zaman "son giriş" DEĞİL — bkz.
   * `sinceSource`.
   */
  since?: string | null;
  /**
   * Eşiğin kaynağı (backend `since_source`):
   *  - "onceki-ziyaret" → `users.prev_seen_at`, gerçek bir önceki ziyaret
   *  - "ilk-giris"      → önceki ziyaret YOK; backend son 7 güne düştü
   *  - "istek"          → çağıran açıkça `since` verdi
   *  - "aralik"         → açık from/to aralığı kullanıldı (WP2)
   *  - null             → backend söylemedi; "son giriş" denemez
   */
  sinceSource: "onceki-ziyaret" | "ilk-giris" | "istek" | "aralik" | null;
  items: ChangeItem[];
  counts: Partial<Record<ChangeType, number>>;
}

/** GET /me/changes — oturum gerektirir. */
export async function getMeChanges(): Promise<ApiResult<MeChanges>> {
  const res = await getJson<unknown>("/me/changes");
  if (!res.ok) return res;

  const raw = (res.data ?? {}) as Record<string, unknown>;
  const inner =
    raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)
      ? (raw.data as Record<string, unknown>)
      : raw;
  const items = kayitDizisi(inner);
  const { counts } = turSayimlari(inner, items);
  const total =
    sayi(inner.total) ??
    sayi(inner.count) ??
    sayi(inner.new_count) ??
    items.length;

  const since =
    (typeof inner.since === "string" && inner.since) ||
    (typeof inner.last_seen_at === "string" && inner.last_seen_at) ||
    (typeof inner.last_visit_at === "string" && inner.last_visit_at) ||
    null;

  // "son giriş" YALNIZCA gerçek önceki ziyarette söylenebilir. Ölçülen
  // hata: bugün açılan hesaba "son giriş 18 Eylül 2026 19:47" yazılıyordu;
  // API `prev_seen_at: null`, `since_source: "ilk-giris"` diyordu ve `since`
  // backend'in 7 günlük varsayılan penceresinin başıydı (25 − 7 = 18 Eylül).
  // Arayüz o alanı ayırt etmeden "son giriş" diye basıyordu.
  const ss = inner.since_source;
  const sinceSource =
    ss === "onceki-ziyaret" || ss === "ilk-giris" || ss === "istek" || ss === "aralik"
      ? ss
      : null;

  return { ok: true, data: { total, since, sinceSource, items, counts } };
}

/* ------------------------------------------------------------------ */
/* Değişiklik kaydından okunur parçalar                                */
/* ------------------------------------------------------------------ */

function payload(item: ChangeItem): Record<string, unknown> {
  const a = item.payload && typeof item.payload === "object" ? item.payload : {};
  const b = item.detail && typeof item.detail === "object" ? item.detail : {};
  return { ...b, ...a };
}

/** İlk dolu alanı döndürür — backend alan adı için birkaç olasılık var. */
function ilk(src: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = src[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

export function changeArticleId(item: ChangeItem): number | null {
  return sayi(item.article_id ?? item.article?.id);
}

export function changeTitle(item: ChangeItem): string {
  const t = item.article?.title ?? item.title;
  const s = typeof t === "string" ? t.trim() : "";
  return s || "Başlığı gelmeyen kayıt";
}

export function changeUrl(item: ChangeItem): string | null {
  const id = changeArticleId(item);
  if (id !== null) return `/haber/${id}`;
  const u = item.article?.url ?? item.url;
  return typeof u === "string" && u.trim() ? u.trim() : null;
}

export function changeSourceName(item: ChangeItem): string | null {
  const n = item.article?.source?.name ?? item.source?.name ?? item.source_name;
  return typeof n === "string" && n.trim() ? n.trim() : null;
}

export function changeAt(item: ChangeItem): string | null {
  return (
    item.detected_at ??
    item.changed_at ??
    item.created_at ??
    item.article?.published_at ??
    item.published_at ??
    null
  );
}

/**
 * Onaysız kayıt mı? `is_confirmed` HİÇ gelmezse onaylı sayılır — yoksa
 * uygulanmamış bir alan yüzünden tüm kayıtlar "çekinceli" görünürdü.
 * Yalnızca açıkça 0/false geldiğinde çekince gösterilir.
 */
export function changeCekinceli(item: ChangeItem): boolean {
  // Backend `is_confirmed`'i ÜST DÜZEYDE değil `detail` JSON'unun İÇİNDE
  // döndürüyor. Önceden yalnızca üst düzeye bakılıyordu; alan "hiç gelmedi"
  // sayılıp kayıt ONAYLI gösteriliyordu. Sonuç (canlıda ölçüldü): pipeline'ın
  // kendisinin onaysız işaretlediği 5 dosya gelişmesinin 5'i de kesin dille
  // basılıyordu — elle yapılan ölçümde YANLIŞ POZİTİF olduğu bilinen "Brent
  // petrol" kaydı dahil, ve teknik güncellemeler gizlenince modülün en
  // üstündeki kayıt oydu. Çekince kodu vardı ama hiç çalışmıyordu.
  const detay =
    item.detail && typeof item.detail === "object"
      ? (item.detail as Record<string, unknown>).is_confirmed
      : undefined;
  const v = item.is_confirmed ?? (detay as ChangeItem["is_confirmed"]);
  if (v === undefined || v === null) return false;
  if (typeof v === "number") return v === 0;
  if (typeof v === "boolean") return v === false;
  return String(v) === "0" || String(v).toLowerCase() === "false";
}

/**
 * "Ne değişti" — TEK KISA İBARE. Panelin varsayılanı çok kısa olmalı,
 * bu yüzden burada cümle değil ibare üretilir.
 */
export function changeOzet(item: ChangeItem): string {
  const tur = normalizeChangeType(item.change_type);
  const p = payload(item);

  const oncesi = ilk(p, [
    "from",
    "old",
    "old_value",
    "before",
    "old_band",
    "from_band",
    "old_member_count",
    "member_count_before",
  ]) ?? item.old_value ?? undefined;

  const sonrasi = ilk(p, [
    "to",
    "new",
    "new_value",
    "after",
    "new_band",
    "to_band",
    "new_member_count",
    "member_count_after",
  ]) ?? item.new_value ?? undefined;

  switch (tur) {
    case "kume-buyudu": {
      const a = sayi(oncesi);
      const b = sayi(sonrasi);
      if (a !== null && b !== null) return `${a} kaynaktan ${b}'e`;
      if (b !== null) return `${b} kaynak doğruluyor`;
      return "Doğrulayan kaynak sayısı arttı";
    }
    case "band-yukseldi": {
      if (oncesi !== undefined && sonrasi !== undefined) {
        return `${bandLabel(String(oncesi))} → ${bandLabel(String(sonrasi))}`;
      }
      if (sonrasi !== undefined) return `Artık ${bandLabel(String(sonrasi))}`;
      return "Önem bandı yükseldi";
    }
    case "dosya-gelismesi": {
      const asama = ilk(p, ["stage", "asama", "step", "label"]);
      return asama ? `Yeni aşama: ${String(asama)}` : "Dosyada yeni aşama";
    }
    case "ozet-guncellendi":
      return "Özet yenilendi";
    case "yeni": {
      const kaynak = changeSourceName(item);
      return kaynak ? `Bültene eklendi · ${kaynak}` : "Bültene eklendi";
    }
    default: {
      const n = typeof item.note === "string" ? item.note.trim() : "";
      return n || "Kayıt güncellendi";
    }
  }
}

/* ------------------------------------------------------------------ */
/* Haberi gizleme                                                      */
/* ------------------------------------------------------------------ */

/**
 * Gizleme sebepleri — backend ENUM'u ile BİREBİR aynı slug'lar.
 * Yeni bir değer eklemek backend'de ENUM değişikliği demektir.
 */
export const HIDE_REASONS = [
  "alakasiz",
  "sektorum-degil",
  "zaten-biliyorum",
  "cok-tekrar",
  "kaynak-guvenilmez",
  "diger",
] as const;
export type HideReason = (typeof HIDE_REASONS)[number];

export const HIDE_REASON_LABEL: Record<HideReason, string> = {
  alakasiz: "Konuyla alakasız",
  "sektorum-degil": "Sektörümle ilgili değil",
  "zaten-biliyorum": "Bunu zaten biliyorum",
  "cok-tekrar": "Aynı haber çok tekrarlanıyor",
  "kaynak-guvenilmez": "Kaynağı güvenilir bulmuyorum",
  diger: "Diğer",
};

/** Notun en fazla uzunluğu — backend'e gönderilmeden önce kırpılır. */
export const HIDE_NOTE_MAX = 200;

export interface HidePayload {
  reason: HideReason;
  note?: string;
}

/**
 * PUT /me/articles/:id/hide — haberi BU KULLANICININ panelinden çıkarır.
 * Veri SİLİNMEZ; başka kullanıcılar ve kurumun arşivi etkilenmez.
 */
export function hideArticle(
  articleId: number | string,
  input: HidePayload,
): Promise<ApiResult<{ hidden?: boolean }>> {
  return mutate<{ hidden?: boolean }>(
    "PUT",
    `/me/articles/${encodeURIComponent(String(articleId))}/hide`,
    {
      hidden: true,
      reason: input.reason,
      note: (input.note ?? "").trim().slice(0, HIDE_NOTE_MAX) || undefined,
    },
  );
}

/** PUT /me/articles/:id/hide — gizlemeyi geri alır (`hidden:false`). */
export function unhideArticle(
  articleId: number | string,
): Promise<ApiResult<{ hidden?: boolean }>> {
  return mutate<{ hidden?: boolean }>(
    "PUT",
    `/me/articles/${encodeURIComponent(String(articleId))}/hide`,
    { hidden: false },
  );
}

/* ------------------------------------------------------------------ */
/* Paylaşım metni ve kanal adresleri (saf fonksiyonlar)                */
/* ------------------------------------------------------------------ */

/**
 * Paylaşım için gereken en küçük haber şekli.
 * `Article`'ın tamamını istemek bileşeni gereksiz yere bağlar.
 */
export interface PaylasilacakHaber {
  id: number;
  title: string;
  url?: string | null;
  source?: { name?: string | null } | null;
  /** Türkçe özet — iletilen mesajın kendi başına anlaşılır olması için. */
  summary?: string | null;
  /** Anahtar maddeler — yalnızca e-postada, en çok 3 tanesi. */
  key_points?: string[] | null;
}

/**
 * Haber nesnesinden paylaşım girdisini çıkarır. Kartlar sunucu bileşeni,
 * eylem şeridi istemci bileşeni: sınırdan yalnızca bu küçük, düz nesne
 * geçsin (tüm haber nesnesi değil).
 */
export function paylasilacak(article: {
  id: number;
  title: string;
  url?: string | null;
  summary?: string | null;
  key_points?: string[] | null;
  source?: { name?: string | null } | null;
}): PaylasilacakHaber {
  return {
    id: article.id,
    title: article.title,
    url: article.url ?? null,
    source: article.source?.name ? { name: article.source.name } : null,
    summary: article.summary ?? null,
    key_points: Array.isArray(article.key_points) ? article.key_points.slice(0, 3) : null,
  };
}

/** Metni cümle sınırından kısaltır; cümle yoksa kelime sınırından. */
function kisaOzet(metin: string | null | undefined, sinir: number): string | null {
  const t = String(metin ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t.length <= sinir) return t;
  const kesit = t.slice(0, sinir);
  const cumle = kesit.lastIndexOf(". ");
  if (cumle > sinir * 0.5) return kesit.slice(0, cumle + 1);
  const kelime = kesit.lastIndexOf(" ");
  return `${kesit.slice(0, kelime > 0 ? kelime : sinir)}…`;
}

/**
 * Paylaşım metni: BAŞLIK + TEK CÜMLELİK TÜRKÇE ÖZET + KAYNAK + BAĞLANTI.
 *
 * Önceki sürümde özet KASITLI olarak yoktu ("WhatsApp'ta mesajı okunmaz
 * yapıyor"). Persona testinde iki ayrı kullanıcı bunun tersini söyledi:
 * genel müdür haberi mali işler direktörüne, ihracat müdürü satış ekibine
 * iletiyor ve alıcının çoğu İngilizce kaynağı açmıyor. Yalnızca başlık +
 * yabancı bağlantı iletilemez bir mesaj. Uzunluk sorunu KISALTARAK
 * çözüldü: WhatsApp'ta en çok ~220 karakterlik tek cümle.
 *
 * Bağlantı kaynağın KENDİ adresi: panel kapalı, oturumu olmayan alıcı
 * /haber/:id açarsa giriş sayfası görür.
 */
export function paylasimMetni(
  haber: PaylasilacakHaber,
  baglanti: string,
): string {
  const kaynak = haber.source?.name?.trim();
  const ozet = kisaOzet(haber.summary, 220);
  return [
    `*${haber.title}*`,
    ozet,
    kaynak ? `Kaynak: ${kaynak}` : null,
    baglanti,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * E-posta gövdesi: WhatsApp'tan daha uzun — tam özet ve en çok üç
 * anahtar madde. E-postayı alan kişi masasında okuyor.
 */
export function epostaGovdesi(
  haber: PaylasilacakHaber,
  baglanti: string,
): string {
  const kaynak = haber.source?.name?.trim();
  const ozet = kisaOzet(haber.summary, 900);
  const maddeler = (haber.key_points ?? [])
    .map((m) => String(m).trim())
    .filter(Boolean)
    .slice(0, 3);
  return [
    haber.title,
    "",
    ozet,
    maddeler.length ? "" : null,
    ...maddeler.map((m) => `• ${m}`),
    "",
    kaynak ? `Kaynak: ${kaynak}` : null,
    baglanti,
    "",
    "— İSO · İSOV Dış Kaynak İzleme",
  ]
    .filter((x) => x !== null)
    .join("\n");
}

/** Kanal adresleri — UI yalnızca açar, kurgu burada tek yerde durur. */
export function paylasimAdresleri(
  haber: PaylasilacakHaber,
  baglanti: string,
): Record<"whatsapp" | "linkedin" | "mailto", string> {
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(paylasimMetni(haber, baglanti))}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(baglanti)}`,
    mailto: `mailto:?subject=${encodeURIComponent(haber.title)}&body=${encodeURIComponent(epostaGovdesi(haber, baglanti))}`,
  };
}

/* ------------------------------------------------------------------ */
/* Paylaşım kaydı                                                      */
/* ------------------------------------------------------------------ */

/** Paylaşım kanalı — backend `article_shares.channel` ile aynı slug'lar. */
export type ShareChannel =
  | "whatsapp"
  | "eposta"
  | "linkedin"
  | "baglanti"
  | "cihaz";

export const SHARE_CHANNEL_LABEL: Record<ShareChannel, string> = {
  whatsapp: "WhatsApp",
  eposta: "E-posta",
  linkedin: "LinkedIn",
  baglanti: "Bağlantı kopyalandı",
  cihaz: "Cihaz paylaşımı",
};

/**
 * PUT /me/articles/:id/share — paylaşım kaydı.
 *
 * `to` verilirse backend e-postayı KENDİSİ gönderir (SMTP gerekir);
 * verilmezse yalnızca kayıt atılır.
 */
export function recordShare(
  articleId: number | string,
  channel: ShareChannel,
  to?: string,
): Promise<ApiResult<{ sent?: boolean }>> {
  return mutate<{ sent?: boolean }>(
    "PUT",
    `/me/articles/${encodeURIComponent(String(articleId))}/share`,
    to ? { channel, to } : { channel },
  );
}

/**
 * Kayıt atmayı DENER ve sonucu yutar.
 *
 * Tarayıcı tarafı paylaşım (WhatsApp, mailto, kopyala) kaydın başarısına
 * BAĞLI DEĞİL: uç nokta 501 dönse bile kullanıcının paylaşımı çalışmıştır,
 * bu yüzden hata gösterilmez. Sunucudan e-posta göndermek başka iştir —
 * orada hata AÇIKÇA gösterilir (`recordShare` doğrudan kullanılır).
 */
export async function recordShareQuietly(
  articleId: number | string,
  channel: ShareChannel,
): Promise<void> {
  try {
    await recordShare(articleId, channel);
  } catch {
    /* Kayıt tutulamadı; kullanıcının paylaşımı yine de gerçekleşti. */
  }
}
