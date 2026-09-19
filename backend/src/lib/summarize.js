// ---------------------------------------------------------------------
// VAKIT KADEMELERI ve CUMLE AYIRMA — TEK EV
//
// METIN URETILMEZ. Bu dosya mevcut alanlardan (summary, key_points,
// summary_short, summary_medium) SECIM yapar. Uretim LLM'in isi;
// anahtar yokken uydurma ozet yazmak, kullaniciya yalan soylemektir.
//
// `firstSentence()` / `leadSentence()` frontend/components/DigestCard.tsx'ten
// AYNEN tasindi. O surum bu korpusun hata kiplerini cozmus durumda:
// Turkce kisaltmalar ("Md. 5", "vb."), tarih/madde dizileri ("2026/2022",
// "12 Eylul 2026'da"). Yeniden yazmak ayni hatalari bastan yapmak olurdu.
// Backend'de llm.js'in kaba splitSentences()'i buraya devreder — tek
// uygulama, iki cagiran.
//
// SAF: DB/IO yok.
// ---------------------------------------------------------------------
import { DENSITY, densityOf, normalizeTimeBudget } from './positions.js';

/** Kartta/2 dk kademesinde gosterilecek tek cumlenin ust siniri (karakter). */
export const SENTENCE_MAX = 150;

/**
 * Turkce metinde cumle sonu sayilmamasi gereken kisaltmalar.
 * Nokta her zaman cumle bitirmez: "Md. 5", "bkz. tablo", "vb." gibi.
 */
const ABBREVIATIONS = new Set([
  'vb', 'vs', 'örn', 'bkz', 'md', 'mad', 'no', 'sy', 'yy',
  'dr', 'doç', 'prof', 'av', 'sn', 'mio', 'milyar', 'a.ş', 'ltd', 'şti',
]);

/** Coklu bosluklari tek bosluga indirir. */
export function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Bir noktalama isaretinin gercekten cumle sonu olup olmadigini soyler.
 * Uc koruma (DigestCard.tsx ile birebir):
 *   1) noktadan onceki sozcuk sayi ile bitiyorsa (tarih/madde no) atlanir,
 *   2) bilinen kisaltmalarda atlanir,
 *   3) noktadan sonraki sozcuk kucuk harfle basliyorsa cumle bitmemistir.
 */
function isBoundary(text, index, matchLength) {
  const head = text.slice(0, index);
  const lastWord = (head.split(' ').pop() ?? '').toLocaleLowerCase('tr-TR');
  const nextChar = text.charAt(index + matchLength);

  if (/\d$/.test(lastWord)) return false;
  if (ABBREVIATIONS.has(lastWord)) return false;
  if (nextChar && nextChar === nextChar.toLocaleLowerCase('tr-TR')) return false;
  return true;
}

/**
 * Metnin ilk cumlesini dondurur.
 *
 * Saf `split('.')` KULLANILMIYOR: korpustaki ozetler "2026/2022",
 * "yuzde 44-51", "12 Eylul 2026'da", "Md. 5" gibi diziler tasiyor ve naif
 * bolme cumleyi ortasindan kesiyordu.
 */
export function firstSentence(value) {
  const text = clean(value);
  if (!text) return '';

  const boundary = /([.!?…])\s+/g;
  let match;
  while ((match = boundary.exec(text)) !== null) {
    if (!isBoundary(text, match.index, match[0].length)) continue;
    return `${text.slice(0, match.index)}${match[1]}`;
  }
  return text;
}

/**
 * Metni cumlelere ayirir — `firstSentence()` ile AYNI sinir kurallariyla.
 *
 * llm.js'in eski surumu `split(/(?<=[.!?])\s+(?=[A-ZCGIOSU0-9])/)` ile
 * boluyordu; "Md. 5" ve "2026/2022" gibi dizilerde cumleyi ortadan kesiyor,
 * ayrica rakamla baslayan devam parcasini yeni cumle sayiyordu. Iki farkli
 * bolucu tutmak iki farkli hata kipi demek: tek uygulamaya indirildi.
 */
export function splitSentences(value) {
  const text = clean(value);
  if (!text) return [];

  const out = [];
  const boundary = /([.!?…])\s+/g;
  let start = 0;
  let match;
  while ((match = boundary.exec(text)) !== null) {
    if (!isBoundary(text, match.index, match[0].length)) continue;
    const piece = text.slice(start, match.index + 1).trim();
    if (piece) out.push(piece);
    start = match.index + match[0].length;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/**
 * Metni `max` karakterde, sozcuk ortasindan kesmeden kirpar.
 * frontend/lib/format.ts `truncate()` ile ayni davranis (tek ev kurali
 * frontend tarafinda ayri bir dosyada; ikisi de ayni sozlesmeyi uygular).
 */
export function truncate(value, max = 220) {
  const t = clean(value);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** key_points alanini savunmaci sekilde temiz bir diziye cevirir. */
export function keyPointsOf(article) {
  const raw = article?.key_points;
  const list = Array.isArray(raw) ? raw : [];
  return list.map((p) => clean(p)).filter(Boolean);
}

/**
 * Haberin TEK CUMLESI: ozetin ilk cumlesi ile ilk anahtar maddeden KISA olani.
 * Sozlesme geregi ikisi de Turkcedir. Hicbiri yoksa BOS doner ve cagiran
 * yalnizca basligi basar — yer tutucu cumle UYDURULMAZ.
 */
export function leadSentence(article) {
  const candidates = [];

  const fromSummary = firstSentence(article?.summary);
  if (fromSummary) candidates.push(fromSummary);

  const firstPoint = keyPointsOf(article)[0];
  if (firstPoint) candidates.push(firstSentence(firstPoint));

  if (candidates.length === 0) return '';
  const shortest = candidates.reduce((a, b) => (b.length < a.length ? b : a));
  return truncate(shortest, SENTENCE_MAX);
}

// ---------------------------------------------------------------------
// OKUMA YOLU: onceden uretilmis kolonlar -> anlik yardimci
//
// `articles.summary_short` / `summary_medium` bugun heuristik doldurulur
// (jobs/build-summaries.js). Anahtar geldiginde bir is bunlari uretilmis
// metinle ezer ve `summary_source='llm'` olur; OKUMA YOLU DEGISMEZ.
// Kolon bossa asagidaki yardimcilar anlik hesaplar.
// ---------------------------------------------------------------------

/** summary_medium bicimi: satir basina bir madde (COALESCE ile okunur). */
export const MEDIUM_SEPARATOR = '\n';

export function parseMedium(value) {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((s) => clean(s).replace(/^[-•*]\s*/, ''))
    .filter(Boolean);
}

export function formatMedium(bullets) {
  return (Array.isArray(bullets) ? bullets : [])
    .map((b) => clean(b))
    .filter(Boolean)
    .join(MEDIUM_SEPARATOR);
}

/** 2 dk kademesinin tek cumlesi. Kolon varsa o, yoksa anlik yardimci. */
export function shortOf(article) {
  const stored = clean(article?.summary_short);
  if (stored) return truncate(stored, SENTENCE_MAX);
  return leadSentence(article);
}

/**
 * Maddeler. `count` kadar madde doner.
 *
 * KAYNAK SECIMI, 5 dk ile 15 dk ARASINDAKI FARK:
 * `summary_medium` kolonu 5 DK KADEMESI icin uretildi ve TAM 3 madde tasir.
 * 15 dk kademesinin ilk 10 haberi ise "tam ozet + TUM maddeler" demek
 * (CONTRACT.md); korpusta haber basina 4-6 anahtar madde var. Kolonu o
 * kademede kaynak almak sessizce 3'e kirpardi — sozlesmenin "tum maddeler"
 * hukmunu kolonun bicimi yuzunden kaybetmek olurdu.
 * Bu yuzden 3'ten fazla madde istendiginde `key_points` ONCE okunur.
 */
export function bulletsOf(article, count = 3) {
  const wanted = Math.max(0, count);
  const points = keyPointsOf(article);
  const stored = parseMedium(article?.summary_medium);
  const source = wanted > stored.length && points.length ? points : (stored.length ? stored : points);
  const list = source.length ? source : splitSentences(article?.summary);
  return list.slice(0, wanted).map((b) => truncate(b, 240));
}

/** 15 dk kademesinin ilk 10 haberindeki tam ozet. */
export function fullOf(article) {
  return clean(article?.summary) || shortOf(article);
}

/**
 * Bir haberin vakit kademesine gore gosterim seklini uretir.
 *
 * @param {object} article
 * @param {object} opts
 * @param {number} opts.timeBudget  2 | 5 | 15
 * @param {number} opts.index       0 tabanli sira (15 dk kademesi icin sart)
 */
export function shapeArticle(article, { timeBudget = 5, index = 0 } = {}) {
  const density = densityOf(timeBudget);
  const base = { id: Number(article?.id), title: clean(article?.title) };

  if (density.style === 'tek-cumle') {
    return { ...base, bicim: 'tek-cumle', sentence: shortOf(article) };
  }
  if (density.style === 'madde') {
    return { ...base, bicim: 'madde', bullets: bulletsOf(article, density.bullets) };
  }
  // KADEMELI (15 dk): ilk `full` haber tam ozet + TUM maddeler,
  // kalanlar uc madde. Duz "30 tam ozet" ~23 dk surer, yani vakit
  // butcesi hakkinda YALAN olurdu (bkz. positions.js DENSITY yorumu).
  if (index < density.full) {
    return {
      ...base,
      bicim: 'tam',
      summary: fullOf(article),
      bullets: bulletsOf(article, Number.POSITIVE_INFINITY),
    };
  }
  return { ...base, bicim: 'madde', bullets: bulletsOf(article, density.bullets) };
}

/**
 * Vakit butcesine gore ozet paketi. Haber sayisi DENSITY'den gelir;
 * cagiran tarafin listeyi kirpmasi GEREKMEZ, burada kirpiliyor.
 */
export function buildDigest(articles, timeBudget = 5) {
  const budget = normalizeTimeBudget(timeBudget);
  const density = densityOf(budget);
  const list = (Array.isArray(articles) ? articles : []).slice(0, density.items);
  return {
    time_budget_min: budget,
    density: { ...density },
    count: list.length,
    items: list.map((a, i) => shapeArticle(a, { timeBudget: budget, index: i })),
  };
}

export { DENSITY, densityOf, normalizeTimeBudget };
