/**
 * Tipli API istemcisi.
 *
 * Sunucu tarafında `API_BASE_URL` (ör. http://isov-backend:5005/api),
 * tarayıcı tarafında `NEXT_PUBLIC_API_BASE_URL` (ör. /api) kullanılır.
 *
 * ÖNEMLİ: Hiçbir fonksiyon exception fırlatmaz. Backend geç ayağa kalkarsa
 * ya da hata dönerse `ApiResult` içinde `ok:false` döner ve sayfalar
 * "Veri kaynağına ulaşılamadı" durumunu gösterir.
 */

import type {
  Article,
  ArticleDetail,
  ArticleQuery,
  Cluster,
  Paginated,
  Report,
  Source,
  SourceCreate,
  SourcePatch,
  SourceSuggestion,
  SourceSuggestionCreate,
  SourceWatchBulk,
  StatsOverview,
  SuggestionStatus,
  Tag,
} from "./types";

/**
 * Başarılı ya da hatalı sonucu taşıyan sarmalayıcı.
 * Hata durumunda `status` varsa HTTP kodudur (ör. 409 = çakışma); ağ hatası
 * ya da zaman aşımında tanımsız kalır. Çağıran taraf mesajı doğrudan
 * kullanıcıya gösterebilir — hepsi Türkçe ve tam cümledir.
 */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number; data: null };

/** İstek zaman aşımı (ms) — demo sırasında sayfa asılı kalmasın. */
const TIMEOUT_MS = 8000;

/** Ortama göre doğru API tabanını seçer. */
export function apiBase(): string {
  // Sunucu tarafı (Server Component / Route Handler)
  if (typeof window === "undefined") {
    return (
      process.env.API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      "http://localhost:5005/api"
    );
  }
  // Tarayıcı tarafı
  return process.env.NEXT_PUBLIC_API_BASE_URL || "/api";
}

/** Sorgu parametrelerini temizleyip querystring üretir. */
export function buildQuery(params: Record<string, unknown> = {}): string {
  const sp = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (raw === undefined || raw === null) continue;
    const value = String(raw).trim();
    if (value === "" || value === "TUMU" || value === "ALL") continue;
    sp.set(key, value);
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Sunucu tarafi render'da gelen istegin oturum cerezini API'ye ILETIR.
 *
 * ZORUNLU: panel kapali oldugu icin /articles, /stats, /reports hepsi oturum
 * istiyor. Sunucu bileseni kendi basina cerez gondermez — tarayicidan gelen
 * istegin cerezini acikca aktarmak gerekir. Bu olmadan API 401 doner ve
 * kullanici giris yapmis olsa bile sayfa BOS kalir (olculdu: bulten sayfasi
 * 0 haber, 25 KB).
 *
 * `next/headers` yalnizca sunucuda var; modul tepesinde ice aktarilirsa
 * istemci paketi kirilir, bu yuzden dinamik import ve window kontrolu.
 */
async function serverCookieHeader(): Promise<Record<string, string>> {
  if (typeof window !== "undefined") return {};
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    const raw = jar.toString();
    return raw ? { cookie: raw } : {};
  } catch {
    // Istek baglami yoksa (build sirasi, birim testi) sessizce gec.
    return {};
  }
}

/** Düşük seviye fetch — timeout'lu, no-store, asla fırlatmaz. */
async function request<T>(path: string): Promise<ApiResult<T>> {
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

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `Sunucu ${res.status} yanıtı döndürdü.`,
        data: null,
      };
    }

    const json = (await res.json()) as T;
    return { ok: true, data: json };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Veri kaynağı zaman aşımına uğradı."
        : "Veri kaynağına ulaşılamadı.";
    return { ok: false, error: message, data: null };
  } finally {
    clearTimeout(timer);
  }
}

/** Backend liste yanıtını normalize eder (düz dizi de gelebilir). */
function normalizeList<T>(
  raw: unknown,
  fallbackLimit = 20,
): Paginated<T> {
  if (Array.isArray(raw)) {
    return {
      data: raw as T[],
      page: 1,
      limit: raw.length || fallbackLimit,
      total: raw.length,
      totalPages: 1,
    };
  }
  const obj = (raw ?? {}) as Record<string, unknown>;
  const data = Array.isArray(obj.data)
    ? (obj.data as T[])
    : Array.isArray(obj.items)
      ? (obj.items as T[])
      : [];
  const total = Number(obj.total ?? data.length) || data.length;
  const limit = Number(obj.limit ?? fallbackLimit) || fallbackLimit;
  const page = Number(obj.page ?? 1) || 1;
  const totalPages =
    Number(obj.totalPages ?? Math.max(1, Math.ceil(total / Math.max(1, limit)))) ||
    1;
  return { data, page, limit, total, totalPages };
}

/** Boş sayfalı sonuç — hata durumlarında UI'yı beslemek için. */
export function emptyPage<T>(limit = 20): Paginated<T> {
  return { data: [], page: 1, limit, total: 0, totalPages: 0 };
}

/* ------------------------------------------------------------------ */
/* Uç noktalar                                                         */
/* ------------------------------------------------------------------ */

/** GET /health */
export function getHealth(): Promise<ApiResult<{ ok: boolean; db?: boolean }>> {
  return request<{ ok: boolean; db?: boolean }>("/health");
}

/** GET /articles — filtreli, sayfalı haber listesi. */
export async function getArticles(
  query: ArticleQuery = {},
): Promise<ApiResult<Paginated<Article>>> {
  const res = await request<unknown>(`/articles${buildQuery({ ...query })}`);
  if (!res.ok) return res;
  return { ok: true, data: normalizeList<Article>(res.data, query.limit ?? 20) };
}

/** GET /articles/:id — detay + küme üyeleri + etiketler. */
export async function getArticle(
  id: string | number,
): Promise<ApiResult<ArticleDetail>> {
  const res = await request<unknown>(`/articles/${encodeURIComponent(String(id))}`);
  if (!res.ok) return res;
  // Backend {data:{...}} ya da doğrudan obje döndürebilir.
  const raw = res.data as Record<string, unknown>;
  const article = (raw && typeof raw === "object" && "data" in raw && raw.data
    ? raw.data
    : raw) as ArticleDetail;
  if (!article || typeof article.id === "undefined") {
    return { ok: false, error: "Haber bulunamadı.", data: null };
  }
  return { ok: true, data: article };
}

/** GET /clusters/:id — küme ve tüm üyeleri. */
export async function getCluster(
  id: string | number,
): Promise<ApiResult<Cluster>> {
  const res = await request<unknown>(`/clusters/${encodeURIComponent(String(id))}`);
  if (!res.ok) return res;
  const raw = res.data as Record<string, unknown>;
  const cluster = (raw && typeof raw === "object" && "data" in raw && raw.data
    ? raw.data
    : raw) as Cluster;
  return { ok: true, data: cluster };
}

/** GET /tags — etiketler + kullanım sayısı. */
export async function getTags(): Promise<ApiResult<Tag[]>> {
  const res = await request<unknown>("/tags");
  if (!res.ok) return res;
  return { ok: true, data: normalizeList<Tag>(res.data, 500).data };
}

/** GET /sources — kaynak listesi. */
export async function getSources(): Promise<ApiResult<Source[]>> {
  const res = await request<unknown>("/sources");
  if (!res.ok) return res;
  return { ok: true, data: normalizeList<Source>(res.data, 200).data };
}

/** GET /stats/overview — dağılımlar ve günlük seri. */
export async function getStatsOverview(): Promise<ApiResult<StatsOverview>> {
  const res = await request<unknown>("/stats/overview");
  if (!res.ok) return res;
  const raw = res.data as Record<string, unknown>;
  const stats = (raw && typeof raw === "object" && "data" in raw && raw.data
    ? raw.data
    : raw) as StatsOverview;
  return { ok: true, data: stats ?? {} };
}

/** GET /reports — rapor listesi. */
export async function getReports(): Promise<ApiResult<Report[]>> {
  const res = await request<unknown>("/reports");
  if (!res.ok) return res;
  return { ok: true, data: normalizeList<Report>(res.data, 100).data };
}

/** GET /reports/:id — rapor + içindeki haberler. */
export async function getReport(
  id: string | number,
): Promise<ApiResult<Report>> {
  const res = await request<unknown>(`/reports/${encodeURIComponent(String(id))}`);
  if (!res.ok) return res;
  const raw = res.data as Record<string, unknown>;
  const report = (raw && typeof raw === "object" && "data" in raw && raw.data
    ? raw.data
    : raw) as Report;
  if (!report || typeof report.id === "undefined") {
    return { ok: false, error: "Rapor bulunamadı.", data: null };
  }
  return { ok: true, data: report };
}

/* ------------------------------------------------------------------ */
/* Yazma işlemleri                                                     */
/*                                                                     */
/* Bu uç noktalar tarayıcıdan çağrılır ve `NEXT_PUBLIC_API_BASE_URL`   */
/* (varsayılan `/api`) tabanını kullanır. Ters vekil (proxy) `/api`    */
/* yolunu backend'e yönlendirmiyorsa istek 404 döner; o durumda        */
/* kullanıcıya "Sunucuya ulaşılamadı." denir — sessizce başarısız      */
/* olunmaz. Okuma fonksiyonları gibi bunlar da ASLA fırlatmaz.         */
/* ------------------------------------------------------------------ */

/** Backend hata gövdesinden okunur mesaj çıkarır: {error:{code,message}}. */
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
 * Yazma isteği — timeout'lu, JSON gövdeli, asla fırlatmaz.
 *
 * DISA ACIK: yeni uç grupları (auth, me, admin) kendi istemci dosyalarını
 * yazarken bu fonksiyonu içe aktarır. Herkesin lib/api.ts'i düzenlemesi
 * paralel çalışmada çakışma üretiyordu; tek yazma yolu burada durur.
 *
 * credentials:"include" — oturum httpOnly çerezle taşınıyor, çerezin
 * gönderilmesi ZORUNLU. Bu olmadan giriş yapılsa bile sonraki istekler
 * oturumsuz görünür.
 */
export async function mutate<T>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body: unknown,
  messages: { conflict?: string } = {},
): Promise<ApiResult<T>> {
  const url = `${apiBase().replace(/\/+$/, "")}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method,
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(await serverCookieHeader()),
      },
      body: method === "DELETE" && body == null ? undefined : JSON.stringify(body ?? {}),
    });

    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (!res.ok) {
      const detail = errorMessageFrom(payload);

      // 404: uç nokta yok ya da /api vekili tanımlı değil. Kaydın kendisi
      // bulunamadıysa backend anlamlı bir mesaj gönderir, onu öne alırız.
      if (res.status === 404) {
        return {
          ok: false,
          status: 404,
          error:
            "Sunucuya ulaşılamadı. Bu işlem için gereken uç nokta yayında değil.",
          data: null,
        };
      }
      if (res.status === 409) {
        return {
          ok: false,
          status: 409,
          error: messages.conflict ?? detail ?? "Bu kayıt zaten mevcut.",
          data: null,
        };
      }
      // 401/403: oturum yok ya da yetki yetersiz. Panel tamamen kapalı
      // olduğu için bu iki durum sık görülecek; çağıran taraf status'a
      // bakıp giriş sayfasına yönlendirebilsin diye ayrı ele alınıyor.
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
      if (res.status === 429) {
        return {
          ok: false,
          status: 429,
          error: detail ?? "Çok fazla deneme yapıldı. Lütfen biraz bekleyin.",
          data: null,
        };
      }
      if (res.status === 400 || res.status === 422) {
        return {
          ok: false,
          status: res.status,
          error: detail ?? "Gönderilen bilgiler geçersiz.",
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

    // Backend {data:{...}} sarmalayabilir ya da düz obje döndürebilir.
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
 * PATCH /sources/:id — kaynağın adını ya da otorite ağırlığını güncelle.
 * İzleme durumu buradan DEĞİŞTİRİLMEZ; `setSourceWatched` kullanılır.
 */
export function patchSource(
  id: string | number,
  patch: SourcePatch,
): Promise<ApiResult<Source>> {
  return mutate<Source>(
    "PATCH",
    `/sources/${encodeURIComponent(String(id))}`,
    patch,
  );
}

/**
 * PUT /sources/:id/watch — kaynağı bu kurumun panelinde izle / izleme.
 *
 * ÇOK KİRACILI DAVRANIŞ: izlemeyi bırakmak toplamayı durdurmaz ve hiçbir
 * haberi silmez. Yalnızca bu kiracının panelinde o kaynağın haberleri
 * gizlenir; aynı kaynağı izleyen diğer kurumlar etkilenmez.
 */
export function setSourceWatched(
  id: string | number,
  isWatched: boolean,
): Promise<ApiResult<Source>> {
  return mutate<Source>(
    "PUT",
    `/sources/${encodeURIComponent(String(id))}/watch`,
    { is_watched: isWatched },
  );
}

/**
 * PUT /sources/watch/bulk — birden çok kaynağın izleme durumunu tek istekte
 * değiştirir (81 kaynakta "tümünü seç" gibi işlemler için).
 *
 * Backend güncellenen kayıtları `{data:[...]}` içinde döndürür; `mutate`
 * sarmalayıcıyı açtığı için burada doğrudan dizi gelir. Dizi gelmezse
 * çağıran taraf yerel durumu kendi bilgisiyle güncellemeye devam eder.
 */
export function setSourcesWatchedBulk(
  sourceIds: number[],
  isWatched: boolean,
): Promise<ApiResult<Source[]>> {
  const body: SourceWatchBulk = { source_ids: sourceIds, is_watched: isWatched };
  return mutate<Source[]>("PUT", "/sources/watch/bulk", body);
}

/** POST /sources — yeni kaynak ekle. */
export function createSource(input: SourceCreate): Promise<ApiResult<Source>> {
  return mutate<Source>("POST", "/sources", input, {
    conflict: "Bu kaynak zaten kayıtlı.",
  });
}

/** GET /source-suggestions — önerilen kaynaklar (opsiyonel durum filtresi). */
export async function getSourceSuggestions(
  status?: SuggestionStatus | "TUMU",
): Promise<ApiResult<SourceSuggestion[]>> {
  const res = await request<unknown>(
    `/source-suggestions${buildQuery({ status })}`,
  );
  if (!res.ok) {
    // Uç nokta henüz yayında değilse 404 döner; ham kodu kullanıcıya
    // göstermek yerine ne olduğunu açıkça söyleriz.
    if (res.status === 404) {
      return {
        ok: false,
        status: 404,
        error: "Kaynak önerileri servisine ulaşılamadı.",
        data: null,
      };
    }
    return res;
  }
  return {
    ok: true,
    data: normalizeList<SourceSuggestion>(res.data, 200).data,
  };
}

/** POST /source-suggestions — kaynak öner. Aynı adres ikinci kez gelirse 409. */
export function createSourceSuggestion(
  input: SourceSuggestionCreate,
): Promise<ApiResult<SourceSuggestion>> {
  return mutate<SourceSuggestion>("POST", "/source-suggestions", input, {
    conflict: "Bu kaynak zaten önerilmiş.",
  });
}

/** PATCH /source-suggestions/:id — öneri durumunu değiştir. */
export function patchSourceSuggestion(
  id: string | number,
  status: SuggestionStatus,
): Promise<ApiResult<SourceSuggestion>> {
  return mutate<SourceSuggestion>(
    "PATCH",
    `/source-suggestions/${encodeURIComponent(String(id))}`,
    { status },
  );
}
