// ---------------------------------------------------------------------
// HTTP yardimcilari: hata tipi, async sarmalayici, sorgu parametresi
// temizligi ve siralama allow-list'i.
//
// Not: `sort` gibi SQL'e dogrudan giren parcalar ASLA kullanicidan gelen
// string ile birlestirilmez; sadece buradaki sabit tablodan secilir.
// ---------------------------------------------------------------------

/** Uygulama hatasi — merkezi error handler {error:{code,message}} uretir. */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
  static badRequest(message = 'Gecersiz istek', details) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }
  static notFound(message = 'Kayit bulunamadi') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static internal(message = 'Sunucu hatasi') {
    return new ApiError(500, 'INTERNAL_ERROR', message);
  }
  /** 409 — kayit zaten var (ayni slug / ayni URL). */
  static conflict(message = 'Kayıt zaten mevcut', details) {
    return new ApiError(409, 'CONFLICT', message, details);
  }
}

/** async route handler'larinda try/catch tekrarini onler. */
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** Query string tek deger olarak okunur (dizi gelirse ilkini alir). */
export function qs(value) {
  if (value === undefined || value === null) return undefined;
  const v = Array.isArray(value) ? value[0] : value;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

/** Virgulle ayrilmis coklu deger -> temiz dizi. */
export function qsList(value, { max = 20 } = {}) {
  const s = qs(value);
  if (!s) return [];
  return [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))].slice(0, max);
}

export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 20;

/**
 * page/limit temizligi: NaN, negatif, 0 ve asiri buyuk degerler
 * guvenli araliga cekilir (limit tavani 100).
 */
export function parsePagination(query = {}) {
  const rawPage = Number.parseInt(qs(query.page) ?? '', 10);
  const rawLimit = Number.parseInt(qs(query.limit) ?? '', 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  let limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  return { page, limit, offset: (page - 1) * limit };
}

/** Sadece listede olan degeri kabul eder; aksi halde varsayilana duser. */
export function pickFromAllowList(value, allowList, fallback = null) {
  const v = qs(value);
  if (!v) return fallback;
  const upper = v.toUpperCase();
  const found = allowList.find((x) => x === v || x === upper || x.toUpperCase() === upper);
  return found ?? fallback;
}

/** 'YYYY-MM-DD' veya ISO tarih dogrulama — gecersizse undefined. */
export function parseDateParam(value) {
  const v = qs(value);
  if (!v) return undefined;
  const d = new Date(v.length === 10 ? `${v}T00:00:00+03:00` : v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** MySQL DATETIME formati ('YYYY-MM-DD HH:MM:SS') — pool timezone'u +03:00. */
export function toMysqlDateTime(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** MySQL DATE formati. */
export function toMysqlDate(date) {
  const dt = toMysqlDateTime(date);
  return dt ? dt.slice(0, 10) : null;
}

/**
 * Yol parametresinden pozitif tam sayi kimlik okur.
 * Gecersizse verilen mesajla 400 firlatir.
 */
export function parseIdParam(value, message = 'Geçersiz kimlik') {
  const id = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(id) || id <= 0) throw ApiError.badRequest(message);
  return id;
}

/**
 * Gevsek boolean okuma: true/1/yes/evet/acik -> true,
 * false/0/no/hayir/kapali -> false, tanimsiz -> undefined.
 * JSON govdesinden gercek boolean gelirse oldugu gibi kullanilir.
 */
export function toBool(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const s = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'evet', 'acik', 'açık'].includes(s)) return true;
  if (['0', 'false', 'no', 'hayir', 'hayır', 'kapali', 'kapalı'].includes(s)) return false;
  return undefined;
}

/**
 * Yalnizca http(s) adresi kabul eder; normalize edilmis URL string'i doner.
 * Gecersizse null. (javascript:, data:, ftp: ve bos deger reddedilir.)
 */
export function normalizeHttpUrl(value, { maxLength = 500 } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  let parsed;
  try { parsed = new URL(raw); } catch { return null; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.hostname || !parsed.hostname.includes('.')) return null;
  const out = parsed.toString();
  return out.length > maxLength ? null : out;
}

/** IN (?, ?, ?) icin guvenli yer tutucu uretimi. */
export function placeholders(count) {
  return new Array(count).fill('?').join(', ');
}
