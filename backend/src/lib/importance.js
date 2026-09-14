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
 *
 * ONCEKI SURUM HATALIYDI: agirliklari toplayip 100'de kirpiyordu. Uc ya da
 * daha fazla etiketi olan her haber 200'u asip 100'e kirpildigi icin bilesen
 * doyuma ulasmisti - gercek veride ortalamasi 93,4 cikti ve hicbir ayirt etme
 * gucu kalmamisti. Bir metrigin her habere ayni puani vermesi, o metrigi
 * agirlikli toplamda sabit terime dondurur.
 *
 * Yerine azalan getirili harman: baskin etiket agirligin cogunu tasir, kalan
 * etiketler katki verir ama doyurmaz. En guclu uc etiketin ortalamasi
 * kullanilir ki bir yigin zayif etiket tek bir kritik etiketi golgelemesin
 * (asil amac buydu) - ama tersi de olmasin, tek kritik etiket tek basina
 * tavana vurmasin.
 *
 * Aralik: en zayif etiket agirligi .. en guclu etiket agirligi (10..95).
 */
export function computeKeyword(tagWeights = []) {
  if (!Array.isArray(tagWeights) || tagWeights.length === 0) return DEFAULT_FACTOR;
  const weights = tagWeights
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  if (weights.length === 0) return DEFAULT_FACTOR;

  const top = weights.slice(0, 3);
  const topMean = top.reduce((a, w) => a + w, 0) / top.length;
  return clamp100(0.65 * weights[0] + 0.35 * topMean, DEFAULT_FACTOR);
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
 * BANT ATAMA — YUZDELIK TABANLI
 *
 * Sabit esikler (once 80/60/35, sonra 78/70/62) iki kez kaydi ve iki kez
 * bandi ise yaramaz hale getirdi:
 *  - Ilk korpusta haberlerin %80'i tek banda yigildi, alt bant hic kullanilmadi.
 *  - Esikler kalibre edildikten iki gun sonra, sadece takvim ilerledigi icin
 *    recency bileseni tum skorlari asagi cekti (ortalama 71,7 -> 65,6) ve
 *    bu kez KRITIK 15'ten 2'ye dustu.
 * Sabit esik, skor dagilimi zamanla kaydigi icin yapisal olarak kirilgan.
 *
 * Cozum: bant, korpus icindeki SIRALAMADAN turetilir. Skorun kendisi mutlak
 * ve aciklanabilir kalir (importance_factors degismiyor); bant ise "bu
 * donemin en onemlileri" sorusunu yanitlar. Bir haber bulteni icin dogru
 * soru zaten budur - editor mutlak bir barajin ustundekileri degil, bu
 * haftanin one cikanlarini arar.
 *
 * Bedeli: bant GORECELIdir. Sakin bir haftada da KRITIK haber cikar.
 * Mutlak siddet gerektiginde importance_score okunmali (?reveal=1).
 */
export const BAND_QUANTILES = Object.freeze({
  KRITIK: 0.12,   // ust %12
  YUKSEK: 0.40,   // sonraki %28
  ORTA: 0.75,     // sonraki %35, kalan %25 DUSUK
});

/**
 * Korpusun skorlarindan bant esiklerini cikarir.
 * Esit skorlar ayni banda duser (esik skor degeriyle karsilastirilir).
 */
export function bandCutoffs(scores = []) {
  const sorted = scores.map(Number).filter(Number.isFinite).sort((a, b) => b - a);
  if (sorted.length === 0) {
    return { KRITIK: Infinity, YUKSEK: Infinity, ORTA: Infinity };
  }
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1))];
  return { KRITIK: at(BAND_QUANTILES.KRITIK), YUKSEK: at(BAND_QUANTILES.YUKSEK), ORTA: at(BAND_QUANTILES.ORTA) };
}

/**
 * Bandi verir. `cutoffs` bandCutoffs() ciktisidir.
 * Cutoffs verilmezse tek basina anlamli bir bant uretilemez (yuzdelik icin
 * korpus gerekir) - bu durumda DUSUK doner; cagiran taraf DB'deki
 * articles.importance_band degerini okumalidir.
 */
export function bandOf(score, cutoffs) {
  const s = Number(score);
  if (!Number.isFinite(s) || !cutoffs) return 'DUSUK';
  if (s >= cutoffs.KRITIK) return 'KRITIK';
  if (s >= cutoffs.YUKSEK) return 'YUKSEK';
  if (s >= cutoffs.ORTA) return 'ORTA';
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
