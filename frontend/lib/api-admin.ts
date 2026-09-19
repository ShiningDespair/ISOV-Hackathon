/**
 * YÖNETİM PANELİ İSTEMCİSİ — `/api/admin/*`
 *
 * `lib/api.ts` DÜZENLENMEZ: yazma yolu orada bir kez çözüldü ve `mutate()`
 * dışa açıldı. Bu dosya onu içe aktarır; okuma için `credentials:"include"`
 * taşıyan kendi yardımcısını kullanır (`lib/api.ts`'teki `request()` çerez
 * göndermiyor — açık uçlar için doğru karar, ama yönetim uçları oturum ister).
 *
 * DÖRT KURAL (lib/api.ts ile aynı):
 *  1. Hiçbir fonksiyon EXCEPTION FIRLATMAZ — hepsi `ApiResult<T>` döner.
 *  2. Her istek `credentials:"include"` taşır (oturum httpOnly çerezle).
 *  3. Zaman aşımı 8 sn.
 *  4. Mesajlar Türkçe ve tam cümle; doğrudan kullanıcıya gösterilebilir.
 *
 * 401 ile 403 AYRI SEYLER ve panel bu ayrımı kullanır:
 *   401 = oturum yok/süresi doldu -> "giriş yapın"
 *   403 = oturum var ama rol yetersiz -> "yetkiniz yok" sayfası
 * `lib/api.ts`'teki `mutate()` ikisini ayrı `status` ile döndürüyor;
 * okuma yardımcısı da aynısını yapar.
 *
 * SIR SÖZLEŞMESİ: SMTP şifresi bu tiplerde YOKTUR. Backend yalnızca
 * `password_tanimli: boolean` döner. Arayüz "••••" gösterip alanı
 * yeniden yazılabilir bırakır; şifreyi okuyup geri gönderemez.
 */

import { apiBase, mutate, type ApiResult } from "./api";

/** İstek zaman aşımı (ms) — lib/api.ts ile aynı değer. */
const TIMEOUT_MS = 8000;

/* ------------------------------------------------------------------ */
/* Tipler                                                              */
/* ------------------------------------------------------------------ */

export type AdminRole = "uye" | "editor" | "admin";
export type AdminStatus = "beklemede" | "aktif" | "askida" | "pasif";
export type EmailStatus = "kuyrukta" | "gonderildi" | "hata" | "iptal";
export type EmailKind =
  | "dogrulama" | "sifre-sifirlama" | "bulten" | "davet"
  | "paylasim" | "uyari" | "test";

export const ROL_ETIKET: Record<AdminRole, string> = {
  uye: "Üye",
  editor: "Editör",
  admin: "Yönetici",
};

export const DURUM_ETIKET: Record<AdminStatus, string> = {
  beklemede: "Beklemede",
  aktif: "Aktif",
  askida: "Askıda",
  pasif: "Pasif",
};

export const EPOSTA_DURUM_ETIKET: Record<EmailStatus, string> = {
  kuyrukta: "Kuyrukta",
  gonderildi: "Gönderildi",
  hata: "Hata",
  iptal: "İptal",
};

export const EPOSTA_TUR_ETIKET: Record<EmailKind, string> = {
  dogrulama: "Doğrulama",
  "sifre-sifirlama": "Şifre sıfırlama",
  bulten: "Bülten",
  davet: "Davet",
  paylasim: "Paylaşım",
  uyari: "Uyarı",
  test: "Test",
};

/** SETTINGS_SECRET durumu — arayüz SMTP şifre alanını buna göre kilitler. */
export interface SirAnahtariDurumu {
  available: boolean;
  reason: string | null;
  kod: "yok" | "gecersiz" | "hazir" | string | null;
}

export interface AdminOverview {
  kullanicilar: {
    toplam: number;
    role_gore: Record<string, number>;
    duruma_gore: Record<string, number>;
    son_girisler: {
      id: number;
      email: string;
      full_name: string | null;
      role: AdminRole;
      status: AdminStatus;
      last_login_at: string | null;
      last_seen_at: string | null;
    }[];
  };
  korpus: {
    haber: number;
    tekil_haber: number;
    son_yayin: string | null;
    kaynak: number;
    etkin_kaynak: number;
    kume: number;
  };
  son_toplama: {
    id: number;
    started_at: string | null;
    finished_at: string | null;
    trigger_type: string | null;
    fetched_count: number;
    new_count: number;
    duplicate_count: number;
    error_count: number;
  } | null;
  eposta: Record<EmailStatus, number>;
  ayarlar: {
    smtp_hazir: boolean;
    smtp_sunucu: string | null;
    smtp_sifre_tanimli: boolean;
    sir_anahtari: SirAnahtariDurumu;
    kisiselestirme_acik: boolean;
    bulten_acik: boolean;
    kayit_acik: boolean;
  };
}

/** SMTP ayarı — `password` alanı KASTEN yok (bkz. dosya başı). */
export interface SmtpAyari {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from_name: string;
  from_email: string;
  password_tanimli: boolean;
}

export interface AuthAyari {
  registration_open: boolean;
  allowed_email_domains: string[];
  min_password_length: number;
  session_ttl_hours: number;
}

export interface KisiselestirmeAyari {
  enabled: boolean;
  global_weight: number;
  personal_weight: number;
  pin_ratio: number;
}

export interface BultenAyari {
  enabled: boolean;
  default_hour: number;
  max_items: number;
}

export interface MarkaAyari {
  site_name: string;
  footer_note: string;
}

export interface AyarZarfi<T> {
  key: string;
  value: T;
  /** Satır yok, varsayılanlar geçerli. */
  varsayilan: boolean;
  updated_at: string | null;
  updated_by: number | null;
  sir_anahtari?: SirAnahtariDurumu;
}

export interface AyarPaketi {
  smtp: AyarZarfi<SmtpAyari>;
  auth: AyarZarfi<AuthAyari>;
  personalization: AyarZarfi<KisiselestirmeAyari>;
  digest: AyarZarfi<BultenAyari>;
  branding: AyarZarfi<MarkaAyari>;
}

export interface AdminUser {
  id: number;
  email: string;
  full_name: string | null;
  title: string | null;
  role: AdminRole;
  status: AdminStatus;
  tenant: { id: number; key: string; name: string } | null;
  last_login_at: string | null;
  last_seen_at: string | null;
  created_at: string | null;
  failed_login_count: number;
  locked_until: string | null;
  must_change_password: boolean;
  position_code: string | null;
  aktif_oturum: number;
}

export interface KullaniciSayfasi {
  data: AdminUser[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  meta: { roller: AdminRole[]; durumlar: AdminStatus[]; aktif_admin: number };
}

export interface SifirlamaBaglantisi {
  kullanici: { id: number; email: string; full_name: string | null };
  token: string;
  url: string;
  expires_at: string | null;
  gecerlilik_saat: number;
  uyari: string;
}

export interface SmtpTestSonucu {
  kuyruga_alindi: boolean;
  status: EmailStatus;
  email_log_id: number | null;
  to: string;
  aciklama: string;
  tani: {
    hazir: boolean;
    nodemailer: boolean;
    kaynak: string | null;
    sunucu: string | null;
    port: number | null;
    gonderen: string | null;
    eksik: string[];
    hata: string | null;
  } | null;
}

export interface BultenGonderimSonucu {
  /** Tarama sonucu aday bulunan kullanıcı sayısı. */
  aday: number;
  gonderildi: number;
  atlanan: number;
  hata: number;
  /** Gönderim eşzamanlı yapılıyor; alan posta katmanı kuyruğa geçerse diye duruyor. */
  kuyruga_alindi: number;
  aciklama: string;
  /** Atlama/hata nedenlerinin dökümü — "neden gitmedi" ekranda yazılı olsun. */
  nedenler: Record<string, number> | null;
}

export interface EpostaKaydi {
  id: number;
  user_id: number | null;
  user_name: string | null;
  to_email: string;
  kind: EmailKind;
  digest_date: string | null;
  subject: string | null;
  status: EmailStatus;
  error: string | null;
  provider_message_id: string | null;
  attempt_count: number;
  report_id: number | null;
  article_count: number;
  queued_at: string | null;
  sent_at: string | null;
}

export interface EpostaKaydiSayfasi {
  data: EpostaKaydi[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  meta: { durumlar: Record<EmailStatus, number>; turler: EmailKind[] };
}

export interface NaceKalemi {
  code: string;
  label: string;
  group: string;
  article_count: number;
  unique_count: number;
  bands: { KRITIK: number; YUKSEK: number; ORTA: number; DUSUK: number };
  last_published_at: string | null;
  matched_terms: { term: string; adet: number }[];
  durum: "yok" | "zayif" | "yeterli";
  zayif: boolean;
}

export interface NaceKapsamYaniti {
  data: NaceKalemi[];
  ozet: {
    nace_kalem_sayisi: number;
    haber: number;
    tekil_haber: number;
    sektor_bilgisi_olan: number;
    sektor_bilgisi_olmayan: number;
    kapsanan_kalem: number;
    bos_kalem: string[];
    zayif_kalem: string[];
    kesisen_haber: number;
    zayif_esik: number;
  };
  eslesmeyen_terimler: { term: string; adet: number }[];
}

/* ------------------------------------------------------------------ */
/* Düşük seviye okuma                                                  */
/* ------------------------------------------------------------------ */

/** Backend hata gövdesinden okunur mesaj çıkarır: {error:{code,message}}. */
function hataMesaji(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const err = obj.error;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object") {
    const msg = (err as Record<string, unknown>).message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return null;
}

/**
 * Yönetim uçlarından okuma. Çerezli, zaman aşımlı, ASLA fırlatmaz.
 * `status` her zaman doldurulur (ağ hatası dışında) — panel 401/403
 * ayrımını buna göre yapar.
 */
export async function adminGet<T>(path: string): Promise<ApiResult<T>> {
  const url = `${apiBase().replace(/\/+$/, "")}/admin${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (!res.ok) {
      const detay = hataMesaji(payload);
      if (res.status === 401) {
        return {
          ok: false,
          status: 401,
          error: detay ?? "Oturumunuz sona ermiş. Yeniden giriş yapın.",
          data: null,
        };
      }
      if (res.status === 403) {
        return {
          ok: false,
          status: 403,
          error: detay ?? "Bu bölüm yalnızca yöneticilere açıktır.",
          data: null,
        };
      }
      if (res.status === 501) {
        return {
          ok: false,
          status: 501,
          error: detay ?? "Bu uç nokta henüz uygulanmadı.",
          data: null,
        };
      }
      if (res.status === 404) {
        return {
          ok: false,
          status: 404,
          error:
            "Sunucuya ulaşılamadı. Bu bölüm için gereken uç nokta yayında değil.",
          data: null,
        };
      }
      return {
        ok: false,
        status: res.status,
        error: detay ?? `Sunucu ${res.status} yanıtı döndürdü.`,
        data: null,
      };
    }

    return { ok: true, data: (payload ?? {}) as T };
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

/* ------------------------------------------------------------------ */
/* Uç noktalar                                                         */
/* ------------------------------------------------------------------ */

/** GET /admin/overview */
export function getAdminOverview(): Promise<ApiResult<AdminOverview>> {
  return adminGet<AdminOverview>("/overview");
}

/** GET /admin/settings — beş anahtarın tamamı tek istekte. */
export async function getAdminSettings(): Promise<ApiResult<AyarPaketi>> {
  const res = await adminGet<{ data: AyarPaketi }>("/settings");
  if (!res.ok) return res;
  const paket = res.data?.data;
  if (!paket || typeof paket !== "object") {
    return { ok: false, error: "Ayarlar okunamadı.", data: null };
  }
  return { ok: true, data: paket };
}

/**
 * PUT /admin/settings/:key — KISMİ gövde kabul eder.
 * SMTP şifresi gönderilmezse mevcut değer korunur; boş string gönderilirse
 * silinir. `SETTINGS_SECRET` yoksa şifre yazma denemesi 400 döner ve
 * hiçbir alan kaydedilmez — mesaj doğrudan gösterilebilir.
 */
export function putAdminSetting<T>(
  key: keyof AyarPaketi,
  patch: Record<string, unknown>,
): Promise<ApiResult<AyarZarfi<T>>> {
  return mutate<AyarZarfi<T>>("PUT", `/admin/settings/${key}`, patch);
}

/** POST /admin/settings/smtp/test — sonuç her zaman 200; içerik durumu söyler. */
export function sendSmtpTest(to?: string): Promise<ApiResult<SmtpTestSonucu>> {
  return mutate<SmtpTestSonucu>("POST", "/admin/settings/smtp/test", to ? { to } : {});
}

export interface KullaniciSorgusu {
  q?: string;
  role?: AdminRole | "";
  status?: AdminStatus | "";
  sort?: string;
  page?: number;
  limit?: number;
}

/** GET /admin/users */
export function getAdminUsers(
  sorgu: KullaniciSorgusu = {},
): Promise<ApiResult<KullaniciSayfasi>> {
  const sp = new URLSearchParams();
  if (sorgu.q?.trim()) sp.set("q", sorgu.q.trim());
  if (sorgu.role) sp.set("role", sorgu.role);
  if (sorgu.status) sp.set("status", sorgu.status);
  if (sorgu.sort) sp.set("sort", sorgu.sort);
  if (sorgu.page && sorgu.page > 1) sp.set("page", String(sorgu.page));
  if (sorgu.limit) sp.set("limit", String(sorgu.limit));
  const qs = sp.toString();
  return adminGet<KullaniciSayfasi>(`/users${qs ? `?${qs}` : ""}`);
}

/**
 * PATCH /admin/users/:id — {role, status}
 * `mutate()` `{data:...}` zarfını açtığı için doğrudan kullanıcı döner.
 * Son yönetici koruması 400 + Türkçe açıklama ile gelir.
 */
export function patchAdminUser(
  id: number,
  patch: { role?: AdminRole; status?: AdminStatus },
): Promise<ApiResult<AdminUser>> {
  return mutate<AdminUser>("PATCH", `/admin/users/${id}`, patch);
}

/** POST /admin/users/:id/reset-link — bağlantı YANITTA döner (bilinçli karar). */
export function createResetLink(
  id: number,
): Promise<ApiResult<SifirlamaBaglantisi>> {
  return mutate<SifirlamaBaglantisi>("POST", `/admin/users/${id}/reset-link`, {});
}

/** POST /admin/digest/send */
export function sendDigestNow(): Promise<ApiResult<BultenGonderimSonucu>> {
  return mutate<BultenGonderimSonucu>("POST", "/admin/digest/send", {});
}

export interface EpostaSorgusu {
  status?: EmailStatus | "";
  kind?: EmailKind | "";
  q?: string;
  page?: number;
  limit?: number;
}

/** GET /admin/email-log */
export function getAdminEmailLog(
  sorgu: EpostaSorgusu = {},
): Promise<ApiResult<EpostaKaydiSayfasi>> {
  const sp = new URLSearchParams();
  if (sorgu.status) sp.set("status", sorgu.status);
  if (sorgu.kind) sp.set("kind", sorgu.kind);
  if (sorgu.q?.trim()) sp.set("q", sorgu.q.trim());
  if (sorgu.page && sorgu.page > 1) sp.set("page", String(sorgu.page));
  if (sorgu.limit) sp.set("limit", String(sorgu.limit));
  const qs = sp.toString();
  return adminGet<EpostaKaydiSayfasi>(`/email-log${qs ? `?${qs}` : ""}`);
}

/** GET /admin/nace-coverage */
export function getAdminNaceCoverage(): Promise<ApiResult<NaceKapsamYaniti>> {
  return adminGet<NaceKapsamYaniti>("/nace-coverage");
}
