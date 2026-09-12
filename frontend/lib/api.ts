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
  StatsOverview,
  Tag,
} from "./types";

/** Başarılı ya da hatalı sonucu taşıyan sarmalayıcı. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; data: null };

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

/** Düşük seviye fetch — timeout'lu, no-store, asla fırlatmaz. */
async function request<T>(path: string): Promise<ApiResult<T>> {
  const url = `${apiBase().replace(/\/+$/, "")}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return {
        ok: false,
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
