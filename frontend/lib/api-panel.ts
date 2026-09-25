/**
 * KİŞİSEL PANEL İSTEMCİSİ — /auth/me, /articles?sort=kisisel, /changes
 *
 * Neden ayrı dosya: `lib/api.ts` paralel geliştirmede çakışma üretiyor ve
 * sözleşme gereği DÜZENLENMEZ. Buradaki okuma yolu iki noktada ondan
 * ayrılıyor:
 *
 *   1) `credentials: "include"` + sunucu tarafında `Cookie` başlığının ELLE
 *      iletilmesi. Oturum `isov_session` httpOnly çerezinde taşınıyor;
 *      Next.js sunucu bileşeninde `fetch` tarayıcı çerezini KENDİLİĞİNDEN
 *      taşımaz. `sort=kisisel` oturum gerektirdiği için çerez iletilmezse
 *      kişiselleştirme sessizce devre dışı kalırdı.
 *   2) HTTP kodunu çağırana taşıması. 404/501 "uç henüz yayında değil",
 *      401 "oturum yok" demektir ve panel bu ikisini kullanıcıya AYRI
 *      cümlelerle söyler; ikisini "hata" diye tek torbaya atmak yanlış
 *      bilgi vermek olurdu.
 *
 * Hiçbir fonksiyon exception fırlatmaz.
 */

import { apiBase, buildQuery, emptyPage } from "./api";
import type { Article, ArticleQuery, Paginated } from "./types";

/* ------------------------------------------------------------------ */
/* Sabitler — TEK KAYNAK backend/src/lib/positions.js                  */
/*                                                                     */
/* Buradaki değerler o dosyanın AYNADAKİ kopyasıdır. Panel düzeni       */
/* frontend'de TÜRETİLMEZ; `/auth/me` türetilmiş `layout` alanını       */
/* döndürür ve panel onu okur. Aşağıdaki etiketler yalnızca EKRANDA     */
/* gösterilecek Türkçe adlar ve yoğunluk sayıları içindir.              */
/* ------------------------------------------------------------------ */

export const PANEL_LAYOUTS = ["ozet", "aksiyon", "operasyon", "takip"] as const;
export type PanelLayout = (typeof PANEL_LAYOUTS)[number];

export const LAYOUT_LABELS: Record<PanelLayout, string> = {
  ozet: "Özet",
  aksiyon: "Aksiyon",
  operasyon: "Operasyon",
  takip: "Takip",
};

export const LAYOUT_HINTS: Record<PanelLayout, string> = {
  ozet: "3 gösterge ve 5 başlık — en kısa görünüm",
  aksiyon: "Son başvuru tarihli kalemler, geri sayımlı",
  operasyon: "Maliyet, tedarik ve emtia odaklı",
  takip: "Mevzuat takvimi ve değişiklik akışı",
};

export const POSITION_LABELS: Record<string, string> = {
  "ust-yonetim": "Üst Yönetim / Genel Müdür",
  strateji: "Strateji / İş Geliştirme",
  "tesvik-finansman": "Teşvik ve Finansman",
  "dis-ticaret": "Dış Ticaret / İhracat",
  "uretim-operasyon": "Üretim / Operasyon",
  "enerji-surdurulebilirlik": "Enerji / Sürdürülebilirlik",
  "mevzuat-hukuk": "Mevzuat / Hukuk",
  "medya-iletisim": "Medya / İletişim",
};

/**
 * Vakit bütçesi -> içerik yoğunluğu.
 * `backend/src/lib/positions.js` DENSITY sabitinin aynısı; sayılar okuma
 * süresi aritmetiğinden gelir (Türkçe ~200 kelime/dk) ve BURADA
 * DEĞİŞTİRİLMEZ.
 *
 * ÜÇÜNCÜ KADEME 15 DEĞİL 10 DAKİKA (bkz. docs/SADELESTIRME.md §4):
 * kullanıcı en uzun kademeyi 10 dakika istedi. 30 kalem / ilk 10'u tam
 * özet, 10 dakikada okunamıyordu — kademe adı ile içeriği birbirini
 * yalanlıyordu. Yeni kademe 20 kalem, ilk 6'sı tam özet.
 */
export const DENSITY = {
  2: { items: 5, full: 0, bullets: 0, style: "tek-cumle" },
  5: { items: 12, full: 0, bullets: 3, style: "madde" },
  10: { items: 20, full: 6, bullets: 3, style: "kademeli" },
} as const;

export type TimeBudget = 2 | 5 | 10;
export type DensityStyle = "tek-cumle" | "madde" | "kademeli";

export interface Density {
  items: number;
  full: number;
  bullets: number;
  style: DensityStyle;
}

export const TIME_BUDGETS: TimeBudget[] = [2, 5, 10];

/**
 * GERİYE UYUMLU: `user_profiles.time_budget_min` TINYINT ve eski kayıtlarda
 * 15 yazıyor olabilir (kademe 10'a inmeden önce kaydolan kullanıcılar).
 * 15'i "geçersiz" sayıp 5'e düşürmek, kullanıcının EN UZUN kademe seçimini
 * sessizce en kısaya yakın bir değere indirmek olurdu; bu yüzden 15 -> 10
 * eşlenir. Gerçekten tanınmayan değer (0, 7, "abc") -> 5, yani orta kademe.
 *
 * Not: `lib/types-auth.ts` içinde de bir `normalizeTimeBudget` var; o
 * dosya kayıt/profil akışının (Ajan F + backend) sözleşmesine bağlı ve
 * BURADAN import EDİLMEZ. İki kopya bilinçli: panel okuma yolu, profil
 * yazma yolunun kademe listesi değişse bile çalışmaya devam etmeli.
 */
export function normalizeTimeBudget(value: unknown): TimeBudget {
  const n = Number(value);
  if ((TIME_BUDGETS as number[]).includes(n)) return n as TimeBudget;
  if (n === 15) return 10;
  return 5;
}

export function densityOf(timeBudget: unknown): Density {
  return DENSITY[normalizeTimeBudget(timeBudget)] as Density;
}

export function isPanelLayout(value: unknown): value is PanelLayout {
  return (PANEL_LAYOUTS as readonly string[]).includes(String(value));
}

/* ------------------------------------------------------------------ */
/* Düşük seviye GET                                                    */
/* ------------------------------------------------------------------ */

const TIMEOUT_MS = 8000;

export type PanelResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; status?: number; data: null };

/** Oturum bilgisi — sunucu bileşeni `Cookie` başlığını elle taşır. */
export interface PanelAuth {
  cookie?: string;
}

async function getJson<T>(
  path: string,
  auth: PanelAuth = {},
): Promise<PanelResult<T>> {
  const url = `${apiBase().replace(/\/+$/, "")}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (auth.cookie) headers.Cookie = auth.cookie;

    const res = await fetch(url, {
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
      headers,
    });

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `Sunucu ${res.status} yanıtı döndürdü.`,
        data: null,
      };
    }

    return { ok: true, data: (await res.json()) as T, status: res.status };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && err.name === "AbortError"
          ? "Veri kaynağı zaman aşımına uğradı."
          : "Veri kaynağına ulaşılamadı.",
      data: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** `{data:{...}}` sarmalayıcısını açar. */
function unwrap(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  if ("data" in obj && obj.data && typeof obj.data === "object") {
    return obj.data as Record<string, unknown>;
  }
  return obj;
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* /auth/me                                                            */
/* ------------------------------------------------------------------ */

/**
 * Kişiselleştirmenin gerçek durumu.
 *
 * `uc-yok` ile `oturum-yok` KASITLI olarak ayrı: birincisi "bu özellik
 * henüz yayında değil", ikincisi "giriş yapmadınız". Kullanıcıya yanlış
 * olanı söylemek onu boş yere giriş ekranına yollar ya da tersine yayında
 * olmayan bir özelliği arattırır.
 */
export type PersonalizationStatus = "etkin" | "oturum-yok" | "uc-yok" | "hata";

export interface PanelMe {
  status: PersonalizationStatus;
  /** `/auth/me` türetilmiş `layout` döndürür; frontend HESAPLAMAZ. */
  layout: PanelLayout | null;
  positionCode: string | null;
  positionLabel: string | null;
  fullName: string | null;
  timeBudget: TimeBudget | null;
  /**
   * Profildeki ilgi alanı etiketleri ve odak bölgeleri.
   *
   * Neden burada: Bana Özel'in "Bugün Bilmeniz Gereken 3 Şey" bloğu her
   * kalem için "Neden sizin için" satırı basıyor ve o satır YALNIZCA
   * gerçek eşleşmeden yazılabilir (haberin etiketi ∩ bu liste). `/auth/me`
   * bu alanları zaten döndürüyor (ölçüldü: emre.tunc → 9 ilgi alanı,
   * region_focus []); ikinci bir istek atmak yerine aynı yanıttan okunur.
   * Profil yoksa ya da okunamadıysa BOŞ DİZİ — eşleşme uydurulmaz.
   */
  interestTagSlugs: string[];
  regionFocus: string[];
  /** Kullanıcıya gösterilecek açıklama (durum `etkin` değilse). */
  note: string | null;
}

/** Profil alanını dize dizisine indirger; dizi değilse boş dizi. */
function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v !== "");
}

const ME_NOTES: Record<Exclude<PersonalizationStatus, "etkin">, string> = {
  "uc-yok":
    "Kişiselleştirme henüz etkin değil: kullanıcı ve profil uçları yayında değil. Panel herkes için aynı genel sıralamayı gösteriyor.",
  "oturum-yok":
    "Oturum açılmadığı için kişiselleştirme uygulanmıyor. Genel önem sıralaması gösteriliyor.",
  hata: "Profil bilgisi okunamadı (veri kaynağına ulaşılamadı ya da beklenmeyen yanıt geldi). Panel genel sıralamayla çalışıyor.",
};

export async function getPanelMe(auth: PanelAuth = {}): Promise<PanelMe> {
  const res = await getJson<unknown>("/auth/me", auth);

  if (!res.ok) {
    const status: PersonalizationStatus =
      res.status === 404 || res.status === 501
        ? "uc-yok"
        : res.status === 401 || res.status === 403
          ? "oturum-yok"
          : "hata";
    return {
      status,
      layout: null,
      positionCode: null,
      positionLabel: null,
      fullName: null,
      timeBudget: null,
      interestTagSlugs: [],
      regionFocus: [],
      note: ME_NOTES[status],
    };
  }

  const root = unwrap(res.data);
  const user = (root.user && typeof root.user === "object"
    ? (root.user as Record<string, unknown>)
    : root) as Record<string, unknown>;
  const profile = (root.profile && typeof root.profile === "object"
    ? (root.profile as Record<string, unknown>)
    : root) as Record<string, unknown>;

  // Düzen SUNUCUDAN gelir. Gelmezse burada pozisyondan TÜRETİLMEZ —
  // eşleme tablosunu ikinci bir yerde tutmak, eşiklerin üç ayrı yerde
  // kopyalanıp birbirinden kayması hatasının aynısıdır.
  const rawLayout = pick(root, ["layout", "panel_layout", "duzen"]);
  const layout = isPanelLayout(rawLayout) ? rawLayout : null;

  const rawPosition = pick(profile, ["position_code", "position", "pozisyon"]);
  const positionCode = rawPosition ? String(rawPosition) : null;

  const rawBudget = pick(profile, [
    "time_budget",
    "time_budget_minutes",
    "time_budget_min",
    "vakit_dk",
    "vakit",
  ]);

  return {
    status: "etkin",
    layout,
    positionCode,
    positionLabel: positionCode
      ? (POSITION_LABELS[positionCode] ?? null)
      : null,
    fullName: (() => {
      const name = pick(user, ["full_name", "name", "ad_soyad"]);
      return name ? String(name) : null;
    })(),
    timeBudget: rawBudget === undefined ? null : normalizeTimeBudget(rawBudget),
    interestTagSlugs: stringList(profile.interest_tag_slugs),
    regionFocus: stringList(profile.region_focus),
    note:
      layout === null
        ? "Profil okundu ancak panel düzeni sunucudan gelmedi; varsayılan düzen gösteriliyor."
        : null,
  };
}

/* ------------------------------------------------------------------ */
/* /articles                                                           */
/* ------------------------------------------------------------------ */

/** Backend liste yanıtını normalize eder (düz dizi de gelebilir). */
function normalizeList(raw: unknown, fallbackLimit: number): Paginated<Article> {
  if (Array.isArray(raw)) {
    return {
      data: raw as Article[],
      page: 1,
      limit: raw.length || fallbackLimit,
      total: raw.length,
      totalPages: 1,
    };
  }
  const obj = (raw ?? {}) as Record<string, unknown>;
  const data = Array.isArray(obj.data)
    ? (obj.data as Article[])
    : Array.isArray(obj.items)
      ? (obj.items as Article[])
      : [];
  const total = Number(obj.total ?? data.length) || data.length;
  const limit = Number(obj.limit ?? fallbackLimit) || fallbackLimit;
  const page = Number(obj.page ?? 1) || 1;
  return {
    data,
    page,
    limit,
    total,
    totalPages:
      Number(obj.totalPages ?? Math.max(1, Math.ceil(total / Math.max(1, limit)))) ||
      1,
  };
}

/**
 * GET /articles — oturum çerezini taşıyan sürüm.
 *
 * SIRALAMA: dönen dizi OLDUĞU GİBİ kullanılır. Panelde hiçbir yerde
 * yeniden sıralanmaz; `is_pinned` ve kişisel skor backend'de uygulanıyor,
 * istemcide ikinci bir sıralama manşeti bozar (bir kez bozdu).
 */
export async function getPanelArticles(
  query: ArticleQuery = {},
  auth: PanelAuth = {},
): Promise<PanelResult<Paginated<Article>>> {
  const res = await getJson<unknown>(`/articles${buildQuery({ ...query })}`, auth);
  if (!res.ok) return res;
  return {
    ok: true,
    status: res.status,
    data: normalizeList(res.data, query.limit ?? 20),
  };
}

export function emptyArticlePage(limit = 20): Paginated<Article> {
  return emptyPage<Article>(limit);
}

/* ------------------------------------------------------------------ */
/* /me/changes  (yoksa /changes)                                       */
/* ------------------------------------------------------------------ */

export interface PanelChange {
  id: string;
  type: string;
  articleId: number | null;
  title: string | null;
  at: string | null;
  note: string | null;
}

export const CHANGE_LABELS: Record<string, string> = {
  yeni: "Yeni",
  "kume-buyudu": "Küme büyüdü",
  "band-yukseldi": "Bandı yükseldi",
  "dosya-gelismesi": "Dosya gelişmesi",
  "ozet-guncellendi": "Özet güncellendi",
};

export interface PanelChanges {
  available: boolean;
  items: PanelChange[];
  /** Erişilemiyorsa kullanıcıya söylenecek Türkçe cümle. */
  note: string | null;
}

/**
 * Değişiklik notunu okunur metne çevirir.
 *
 * ÖLÇÜLEN HATA (persona testi): backend `detail` alanını NESNE olarak
 * döndürüyor (`{label, similarity, is_confirmed, ...}`) ve burada
 * `String(detail)` yapılıyordu; Değişiklik Akışı'nın sekiz satırının
 * sekizinde de "[object Object]" basılıyordu. Nesneden insan okuyacağı
 * alan seçilir, bulunamazsa satır notsuz basılır — iç alanlar (benzerlik
 * skoru, thread anahtarı) kullanıcıya gösterilmez.
 */
function notMetni(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return null;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["note", "text", "message", "aciklama", "label", "summary"]) {
      const x = o[k];
      if (typeof x === "string" && x.trim()) return x.trim();
    }
  }
  return null;
}

function toChange(raw: unknown, index: number): PanelChange | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const type = pick(obj, ["change_type", "type", "tur"]);
  const articleRaw = obj.article;
  const article = (articleRaw && typeof articleRaw === "object"
    ? (articleRaw as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const articleId = pick(obj, ["article_id", "articleId"]) ?? article.id;
  const title = pick(obj, ["article_title", "title", "baslik"]) ?? article.title;
  const at = pick(obj, ["created_at", "detected_at", "changed_at", "at"]);
  const note = notMetni(pick(obj, ["note", "detail", "aciklama", "summary"]));

  return {
    id: String(pick(obj, ["id", "change_key"]) ?? `degisiklik-${index}`),
    type: String(type ?? "yeni"),
    articleId: articleId === undefined ? null : Number(articleId) || null,
    title: title === undefined ? null : String(title),
    at: at === undefined ? null : String(at),
    note,
  };
}

/**
 * Değişiklik akışı. İki uç denenir: önce kullanıcıya özel `/me/changes`,
 * o yoksa genel `/changes`. İkisi de yayında değilse UYDURULMAZ — panel
 * bölümü "uç yayında değil" notuyla görünür kalır.
 */
export async function getPanelChanges(
  auth: PanelAuth = {},
  limit = 8,
): Promise<PanelChanges> {
  for (const path of ["/me/changes", "/changes"]) {
    const res = await getJson<unknown>(`${path}${buildQuery({ limit })}`, auth);
    if (!res.ok) {
      if (res.status === 404 || res.status === 501) continue;
      if (res.status === 401 || res.status === 403) {
        return {
          available: false,
          items: [],
          note: "Değişiklik akışı için oturum gerekiyor.",
        };
      }
      continue;
    }
    const raw = res.data;
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as Record<string, unknown>)?.data)
        ? ((raw as Record<string, unknown>).data as unknown[])
        : Array.isArray((raw as Record<string, unknown>)?.items)
          ? ((raw as Record<string, unknown>).items as unknown[])
          : [];
    const items = list
      .map((row, i) => toChange(row, i))
      .filter((c): c is PanelChange => c !== null)
      .slice(0, limit);
    return { available: true, items, note: null };
  }

  return {
    available: false,
    items: [],
    note: "Değişiklik akışı ucu (/changes) henüz yayında değil. Bölüm veri geldiğinde kendiliğinden dolar.",
  };
}
