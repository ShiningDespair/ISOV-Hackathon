// ---------------------------------------------------------------------
// GIZLI ONEM SKORU MOTORU
//
// Tasarim karari: bu dosyadaki her fonksiyon SAF'tir (DB/IO/tarih yan etkisi
// yok, `now` disaridan gecilir). Boylece hem seeder hem API ayni sonucu
// uretir ve birim testi icin sahte veri yeterlidir.
//
// CONTRACT.md agirliklari — degistirmeyin, frontend siralamasi buna bagli.
// ---------------------------------------------------------------------

export const WEIGHTS = Object.freeze({
  authority: 0.25,     // kaynak otoritesi (sources.authority_weight)
  impact: 0.25,        // ISO/ISOV uyesine dogrudan etki
  keyword: 0.20,       // tetikleyici etiket agirliklari toplami
  recency: 0.15,       // yayin tazeligi
  corroboration: 0.10, // kac bagimsiz kaynak dogrulamis
  reach: 0.05,         // kaynagin erisim/olcek tahmini
});

/** Faktor bilinmiyorsa "notr" kabul: ne odullendir ne cezalandir. */
export const DEFAULT_FACTOR = 50;

/** Tazelik sonumunun bittigi gun sayisi ve tabani (CONTRACT: 7 gunde 100 -> 20). */
export const RECENCY_WINDOW_DAYS = 7;
const RECENCY_START = 100;
const RECENCY_END = 20;
const RECENCY_STALE = 10; // 7 gunden eski her sey

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 0..100 araligina sikistirir; NaN/null gibi bozuk degerleri fallback'e cevirir. */
export function clamp100(value, fallback = DEFAULT_FACTOR) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

/** DECIMAL(5,2) ile birebir uyusmasi icin 2 ondaliga yuvarlar. */
export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Yayin tazeligi 0..100.
 * 0. gun = 100, 7. gun = 20 (dogrusal), 7 gunden eski = 10.
 * Gelecek tarihli yayinlar (saat farki/hatali veri) 100 kabul edilir.
 */
export function computeRecency(publishedAt, now = new Date()) {
  if (!publishedAt) return DEFAULT_FACTOR;
  const pub = publishedAt instanceof Date ? publishedAt : new Date(publishedAt);
  if (Number.isNaN(pub.getTime())) return DEFAULT_FACTOR;

  const ref = now instanceof Date ? now : new Date(now);
  const days = (ref.getTime() - pub.getTime()) / MS_PER_DAY;

  if (days <= 0) return RECENCY_START;
  if (days > RECENCY_WINDOW_DAYS) return RECENCY_STALE;

  const slope = (RECENCY_START - RECENCY_END) / RECENCY_WINDOW_DAYS; // gunde -11.43
  return round2(RECENCY_START - slope * days);
}

/**
 * Dogrulama (corroboration): ayni olayi kac bagimsiz kaynak yazmis.
 * Tek kaynak zayif sinyal, 5+ kaynak neredeyse kesinlik.
 */
export function computeCorroboration(memberCount) {
  const n = Number(memberCount);
  if (!Number.isFinite(n) || n <= 1) return 20;
  if (n === 2) return 45;
  if (n === 3) return 65;
  if (n === 4) return 80;
  return 95;
}

/**
 * Etiket agirliklarindan keyword bileseni.
 * tags.weight 0..100; toplam 100'de tavanlanir ki 10 zayif etiket
 * tek bir kritik etiketi golgede birakmasin.
 */
export function computeKeyword(tagWeights = []) {
  if (!Array.isArray(tagWeights) || tagWeights.length === 0) return DEFAULT_FACTOR;
  const total = tagWeights.reduce((acc, w) => acc + (Number.isFinite(Number(w)) ? Number(w) : 0), 0);
  return clamp100(total, DEFAULT_FACTOR);
}

/**
 * Ham faktorleri normalize eder: eksik olanlar 50, araliga sikistirilir.
 * importance_factors JSON'una yazilan sekil budur.
 */
export function normalizeFactors(factors = {}) {
  const src = factors && typeof factors === 'object' ? factors : {};
  const out = {};
  for (const key of Object.keys(WEIGHTS)) {
    out[key] = round2(clamp100(src[key], DEFAULT_FACTOR));
  }
  return out;
}

/**
 * Agirlikli toplam -> 0..100 arasi DECIMAL(5,2) uyumlu sayi.
 * Agirliklar toplami 1.00 oldugu icin ayrica normalizasyona gerek yok.
 */
export function computeImportance(factors = {}) {
  const f = normalizeFactors(factors);
  let score = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    score += f[key] * weight;
  }
  return round2(clamp100(score, 0));
}

/**
 * Bandi hesaplar. DB'de generated column var; burasi API/seed tarafinda
 * yazmadan once onizleme ve rapor istatistikleri icin kullanilir.
 * Esikler CONTRACT.md ve 01_schema.sql ile birebir ayni olmak ZORUNDA.
 */
export function bandOf(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return 'DUSUK';
  if (s >= 80) return 'KRITIK';
  if (s >= 60) return 'YUKSEK';
  if (s >= 35) return 'ORTA';
  return 'DUSUK';
}

/**
 * Bir makalenin tum faktorlerini tek adimda toparlar.
 * Seeder ve yeniden-skorlama isi ayni yolu kullansin diye burada duruyor.
 *
 * @param {object} input
 * @param {object} [input.baseFactors]    seed JSON'undan gelen ham faktorler
 * @param {number} [input.authorityWeight] sources.authority_weight
 * @param {Date|string} [input.publishedAt]
 * @param {number} [input.memberCount]    kume uye sayisi
 * @param {number[]} [input.tagWeights]   etiket agirliklari
 * @param {Date} [input.now]
 */
export function buildFactors({
  baseFactors = {},
  authorityWeight,
  publishedAt,
  memberCount,
  tagWeights,
  now = new Date(),
} = {}) {
  const base = baseFactors && typeof baseFactors === 'object' ? { ...baseFactors } : {};

  // Otorite her zaman kaynagin kendi agirligindan gelir (seed yanlis yazmissa duzeltiriz).
  if (Number.isFinite(Number(authorityWeight))) {
    base.authority = Number(authorityWeight);
  }
  // Tazelik yayin tarihinden turetilir; seed'in yazdigi statik deger bayatlar.
  if (publishedAt) {
    base.recency = computeRecency(publishedAt, now);
  }
  // Dogrulama ancak kumeleme bittikten SONRA bilinir.
  if (memberCount !== undefined && memberCount !== null) {
    base.corroboration = computeCorroboration(memberCount);
  }
  // Etiket agirliklari varsa keyword bilesenini onlardan uret.
  if (Array.isArray(tagWeights) && tagWeights.length > 0) {
    base.keyword = computeKeyword(tagWeights);
  }

  return normalizeFactors(base);
}
