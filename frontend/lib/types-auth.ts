/**
 * KULLANICI SISTEMI TIPLERI
 *
 * Sozlesme: docs/CONTRACT.md -> "KULLANICI SISTEMI ve KISISELLESTIRME (v2)".
 *
 * NEDEN AYRI DOSYA: `lib/types.ts` haber/kaynak tiplerinin evi ve baska
 * ajanlar tarafindan duzenleniyor. Auth tipleri ayri dosyada durur, paralel
 * calismada catisma uretmez.
 *
 * TOLERANSLI TIPLER: pozisyon/sektor/duzen kodlari `string` genisletmesiyle
 * yazildi (`PositionCode | (string & {})` DEGIL, dogrudan union + normalize
 * fonksiyonu). Backend taksonomiye yeni kalem eklerse arayuz kirilmaz;
 * bilinmeyen deger normalize edilirken guvenli varsayilana duser.
 */

/* ------------------------------------------------------------------ */
/* Pozisyon, duzen, vakit                                             */
/* ------------------------------------------------------------------ */

/** 8 pozisyon — backend `lib/positions.js` POSITIONS ile birebir. */
export const POSITION_CODES = [
  "ust-yonetim",
  "strateji",
  "tesvik-finansman",
  "dis-ticaret",
  "uretim-operasyon",
  "enerji-surdurulebilirlik",
  "mevzuat-hukuk",
  "medya-iletisim",
] as const;

export type PositionCode = (typeof POSITION_CODES)[number];

/** 4 panel duzeni — pozisyondan TURETILIR, kullanici secmez. */
export const LAYOUT_CODES = ["ozet", "aksiyon", "operasyon", "takip"] as const;
export type LayoutCode = (typeof LAYOUT_CODES)[number];

/** Vakit butcesi (dakika). Sozlesme: 2 / 5 / 15. */
export const TIME_BUDGETS = [2, 5, 15] as const;
export type TimeBudget = (typeof TIME_BUDGETS)[number];

/**
 * Bulten sikligi — backend `NEWSLETTER_FREQ` ile birebir.
 * ABONELIK AYRI BIR ALAN DEGIL: "kapali" abonelikten cikmanin kendisidir.
 * Ayri bir `subscribed` bayragi tutmak iki dogruluk kaynagi uretirdi
 * (subscribed=false + frequency="gunluk" gibi celiskili durumlar).
 */
export type NewsletterFrequency = "kapali" | "gunluk" | "haftalik";

export type UserRole = "uye" | "editor" | "admin";

/* ------------------------------------------------------------------ */
/* Taksonomi (GET /meta/taxonomy, GET /meta/interests)                */
/* ------------------------------------------------------------------ */

/** Bir pozisyon secenegi — panel duzeni ve duzenin aciklamasi ile. */
export interface PositionOption {
  code: string;
  label: string;
  /** Pozisyondan turetilen panel duzeni kodu. */
  layout: string;
  /** Duzenin kullaniciya gosterilecek aciklamasi. */
  layoutLabel: string;
}

/** NACE bolumu secenegi. */
export interface SectorOption {
  code: string;
  label: string;
  /** Ayni aileden kalemler (arama/gruplama icin). */
  group?: string;
}

/** Vakit kademesi — SOMUT karsiligi ile (kac haber, hangi bicim). */
export interface TimeBudgetOption {
  minutes: number;
  /** Gosterilecek haber sayisi. */
  items: number;
  /** `tek-cumle` | `madde` | `kademeli` */
  style: string;
  /** "2 dakika" gibi kisa etiket. */
  label: string;
  /** "5 haber, her biri tek cumle" gibi somut aciklama. */
  detail: string;
}

export interface Taxonomy {
  positions: PositionOption[];
  /** duzen kodu -> aciklama. */
  layouts: Record<string, string>;
  sectors: SectorOption[];
  timeBudgets: TimeBudgetOption[];
}

/** Ilgi alani etiketi. `group` yalnizca arayuzde gruplamak icin. */
export interface InterestTag {
  slug: string;
  label: string;
  group?: string;
}

/* ------------------------------------------------------------------ */
/* Oturum ve profil                                                   */
/* ------------------------------------------------------------------ */

export interface SessionUser {
  id: number | string;
  email: string;
  full_name: string;
  title?: string | null;
  role: UserRole;
  status?: string | null;
  tenant_key?: string | null;
  /** Yonetici sifre sifirladiginda true doner — giris sonrasi zorunlu adim. */
  must_change_password?: boolean;
}

/**
 * Profil — ALAN ADLARI BACKEND SOZLESMESIYLE BIREBIR
 * (`time_budget_min`, `primary_sector_code`, `secondary_sector_codes`).
 *
 * NEDEN "daha okunakli" adlar kullanmiyoruz: `PUT /me/profile` tanimadigi
 * alanlari HATA VERMEDEN yok sayiyor (`body.X === undefined` -> eskisini
 * koru). `time_budget` yazmak, vakit secimini sessizce kaybetmek demekti.
 */
export interface UserProfile {
  position_code: string;
  primary_sector_code: string | null;
  secondary_sector_codes: string[];
  interest_tag_slugs: string[];
  time_budget_min: number;
  region_focus: string[];
  /** `yok` | `bekliyor` | `hazir` | `hata` — vektor arka planda dolduruluyor. */
  vector_status?: string | null;
}

export interface NewsletterSettings {
  frequency: NewsletterFrequency;
  /** 0–23 arasi yerel gonderim saati. */
  send_hour: number;
  /** 1–7 (1 = Pazartesi). Haftalik secilmisse anlamli. */
  send_weekday?: number | null;
}

/** GET /auth/me yaniti. `layout` pozisyondan TURETILIR (DB kolonu degil). */
export interface MeResponse {
  user: SessionUser;
  profile: UserProfile | null;
  layout: string | null;
  newsletter?: NewsletterSettings | null;
}

/* ------------------------------------------------------------------ */
/* Istek govdeleri                                                    */
/* ------------------------------------------------------------------ */

export interface RegisterInput {
  email: string;
  password: string;
  full_name: string;
  title?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

/** POST /auth/login yaniti — oturum cerezi ayrica Set-Cookie ile gelir. */
export interface LoginResult {
  user?: SessionUser;
  must_change_password?: boolean;
}

/** PUT /me/profile govdesi — alan adlari sozlesmeyle birebir. */
export interface ProfileInput {
  position_code: string;
  primary_sector_code: string | null;
  secondary_sector_codes: string[];
  interest_tag_slugs: string[];
  time_budget_min: number;
}

/* ------------------------------------------------------------------ */
/* Normalize ediciler                                                 */
/* ------------------------------------------------------------------ */

export function normalizePosition(value: unknown): PositionCode {
  const v = String(value ?? "");
  return (POSITION_CODES as readonly string[]).includes(v)
    ? (v as PositionCode)
    : "ust-yonetim";
}

/** 1–7 arasi haftanin gunu; disinda kalan her sey Pazartesi. */
export function normalizeWeekday(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 1 && n <= 7 ? n : 1;
}

export function normalizeTimeBudget(value: unknown): TimeBudget {
  const n = Number(value);
  return (TIME_BUDGETS as readonly number[]).includes(n)
    ? (n as TimeBudget)
    : 5;
}

export function normalizeFrequency(value: unknown): NewsletterFrequency {
  return value === "haftalik" || value === "kapali" ? value : "gunluk";
}

export function normalizeSendHour(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 && n <= 23 ? n : 8;
}

export function normalizeRole(value: unknown): UserRole {
  return value === "admin" || value === "editor" ? value : "uye";
}
