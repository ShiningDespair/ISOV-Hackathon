/**
 * /durum SAYFASININ KENDI API ISTEMCISI
 *
 * Yalnizca `GET /meta/nace-coverage` ucunu okur. Ayri dosyada tutulmasinin
 * sebebi: `lib/api.ts` baska ajanlarin ortak dosyasi, /durum sayfasi onu
 * degistirmek zorunda kalmadan kendi ucunu cekebilsin.
 *
 * ILKELER
 *  - Hicbir fonksiyon exception firlatmaz. Uc yoksa (404 / 501), oturum
 *    istiyorsa (401 / 403) ya da backend tamamen kapaliysa `hazir: false`
 *    doner; /durum sayfasi o zaman bolumu BASMAZ, "kapsam verisi henuz hazir
 *    degil" yazar. SAYI UYDURULMAZ.
 *  - Yanit sekli esnek okunur: uc noktayi paralel bir ajan yaziyor, alan
 *    adlari (code/kod/nace, count/dogrudan/article_count...) farkli
 *    gelebilir. Normalizer bilinen tum yazimlari kabul eder; taniyamadigi
 *    sekli veri yokmus gibi degerlendirir — yanlis sayi basmaktan iyidir.
 */

import { apiBase } from "@/lib/api";

/** Tek bir NACE kalemi (sektor basligi) ve veri kalinligi. */
export interface NaceKalem {
  /** NACE kodu — ornek: "C18". Yoksa ad'dan uretilen anahtar. */
  kod: string;
  /** Okunabilir sektor adi. */
  ad: string;
  /** Bu koda DOGRUDAN eslenmis haber sayisi. */
  dogrudan: number;
  /** Dolayli (ilgili etiket / ust kirilim uzerinden) haber sayisi. */
  dolayli: number;
}

export interface NaceKapsami {
  kalemler: NaceKalem[];
  /** Toplam kalem sayisi. */
  kalemSayisi: number;
  /** `dogrudan > 0` olan kalem sayisi. */
  dogrudanEslesenSayisi: number;
  /** Dogrudan eslesmesi olmayan kalemler — "ince veri" olarak gosterilir. */
  eslesmeyenler: NaceKalem[];
  /** Tum kalemlerdeki dogrudan haber toplami. */
  dogrudanToplam: number;
}

export type NaceKapsamSonucu =
  | { hazir: true; veri: NaceKapsami }
  | { hazir: false; sebep: string };

const TIMEOUT_MS = 6000;

/** Sayiya cevirir; cevrilemezse 0. Negatif deger 0 sayilir. */
function sayi(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

/** Bir nesnede verilen adlardan ilk dolu olani dondurur. */
function ilkDolu(obj: Record<string, unknown>, adlar: string[]): unknown {
  for (const ad of adlar) {
    const v = obj[ad];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

const KOD_ADLARI = ["kod", "code", "nace", "nace_code", "naceCode", "sector_code", "key", "id"];
const AD_ADLARI = ["ad", "ad_tr", "name", "label", "title", "sector", "sektor", "description"];
const DOGRUDAN_ADLARI = [
  "dogrudan",
  "direct",
  "direct_count",
  "directCount",
  "direct_articles",
  "article_count",
  "articleCount",
  "articles",
  "haber_sayisi",
  "count",
  "n",
];
const DOLAYLI_ADLARI = [
  "dolayli",
  "indirect",
  "indirect_count",
  "indirectCount",
  "indirect_articles",
  "related",
  "related_count",
  "dolayli_sayisi",
];

/** Tek kalemi normalize eder. Kod da ad da yoksa null. */
function kalemOku(raw: unknown, anahtar?: string): NaceKalem | null {
  // { "C18": 53 } gibi duz sayi eslemesi
  if (typeof raw === "number") {
    if (!anahtar) return null;
    return { kod: anahtar, ad: anahtar, dogrudan: sayi(raw), dolayli: 0 };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const obj = raw as Record<string, unknown>;
  const kodRaw = ilkDolu(obj, KOD_ADLARI) ?? anahtar;
  const adRaw = ilkDolu(obj, AD_ADLARI) ?? kodRaw;
  if (kodRaw === undefined && adRaw === undefined) return null;

  const kod = String(kodRaw ?? adRaw ?? "").trim();
  const ad = String(adRaw ?? kod).trim();
  if (!kod && !ad) return null;

  return {
    kod: kod || ad,
    ad: ad || kod,
    dogrudan: sayi(ilkDolu(obj, DOGRUDAN_ADLARI)),
    dolayli: sayi(ilkDolu(obj, DOLAYLI_ADLARI)),
  };
}

/** Ham yanittan kalem dizisini cikarir. Tanimadigi sekilde bos dizi. */
function kalemleriCikar(raw: unknown): NaceKalem[] {
  if (Array.isArray(raw)) {
    return raw.map((r) => kalemOku(r)).filter((k): k is NaceKalem => k !== null);
  }
  if (!raw || typeof raw !== "object") return [];

  const obj = raw as Record<string, unknown>;
  for (const anahtar of ["data", "items", "coverage", "kapsam", "sectors", "sektorler", "nace"]) {
    const ic = obj[anahtar];
    if (Array.isArray(ic) || (ic && typeof ic === "object")) {
      const cikan = kalemleriCikar(ic);
      if (cikan.length > 0) return cikan;
    }
  }

  // { "C18": 53, "C10": 34 } ya da { "C18": {...} } seklinde esleme
  const esleme: NaceKalem[] = [];
  for (const [anahtar, deger] of Object.entries(obj)) {
    const k = kalemOku(deger, anahtar);
    if (k) esleme.push(k);
  }
  return esleme;
}

export function naceKapsamiOzetle(kalemler: NaceKalem[]): NaceKapsami {
  const eslesmeyenler = kalemler.filter((k) => k.dogrudan === 0);
  return {
    kalemler,
    kalemSayisi: kalemler.length,
    dogrudanEslesenSayisi: kalemler.length - eslesmeyenler.length,
    eslesmeyenler,
    dogrudanToplam: kalemler.reduce((t, k) => t + k.dogrudan, 0),
  };
}

/**
 * GET /meta/nace-coverage
 * Uc henuz yoksa ya da erisilemiyorsa `hazir: false` doner — sayfa 200 kalir.
 */
export async function getNaceKapsami(): Promise<NaceKapsamSonucu> {
  const url = `${apiBase().replace(/\/+$/, "")}/meta/nace-coverage`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      if (res.status === 404 || res.status === 501 || res.status === 405) {
        return { hazir: false, sebep: "Kapsam ucu henüz yazılmadı." };
      }
      if (res.status === 401 || res.status === 403) {
        return {
          hazir: false,
          sebep: "Kapsam ucu yönetici oturumu istiyor; bu sayfa oturumsuz açılıyor.",
        };
      }
      return { hazir: false, sebep: `Kapsam ucu ${res.status} yanıtı döndürdü.` };
    }

    const json: unknown = await res.json();
    const kalemler = kalemleriCikar(json);
    if (kalemler.length === 0) {
      return { hazir: false, sebep: "Kapsam ucu boş liste döndürdü." };
    }
    return { hazir: true, veri: naceKapsamiOzetle(kalemler) };
  } catch (err) {
    const sebep =
      err instanceof Error && err.name === "AbortError"
        ? "Kapsam ucu zaman aşımına uğradı."
        : "Kapsam verisine ulaşılamadı.";
    return { hazir: false, sebep };
  } finally {
    clearTimeout(timer);
  }
}
