// ---------------------------------------------------------------------
// MEVZUAT REFERANS KODU CIKARIMI
//
// NEDEN AYRI DOSYA (ve neden numericSignature() DEGIL):
// pipeline.js icindeki `numericSignature()` "ayni olay mi" sorusunu
// yanitlamak icin yazildi ve YILLARI (1900-2100) KASTEN ATIYOR — cunku
// "2026'da" ifadesi iki haberi ayni olay yapmaz. Mevzuat referans kodlari
// ise TAM OLARAK yil gibi gorunur: "5510 sayili", "(AB) 2023/956",
// "2026/12 sayili Karar". O fonksiyonu gevsetmek tekillestirmeyi bozar;
// bu yuzden felsefesi (kanonik kume, ayrac normalizasyonu) odunc alinip
// AYRI TUTULDU.
//
// SAF: DB/IO yok, `now` gerekmiyor. Ayni girdi her zaman ayni ciktiyi verir.
// ---------------------------------------------------------------------

/**
 * Turkce kucultmenin ardindan 'sayılı' hem 'sayili' hem 'sayılı' yazilabilir
 * (kaynaklarin bir kismi aksansiz yaziyor). Ikisini de kabul ediyoruz.
 */
const SAYILI = '[Ss]ay[ıi]l[ıi]';

/**
 * Desenler. Her biri {re, kind, build} ucluisu:
 *   re    : eslesme deseni (global)
 *   kind  : threads.kind icin ipucu
 *   build : eslesmeden KANONIK kod uretir
 *
 * Kanonik bicim onekli: 'TR-5510', 'AB-2023/956', 'US-SECTION-232',
 * 'TR-2026/12'. Onek olmadan "2023/956" (AB tuzugu) ile "2023/956 sayili
 * Karar" (TR karari) ayni kod sayilirdi; bunlar ayni dosya DEGIL.
 */
const PATTERNS = Object.freeze([
  {
    // "5510 sayılı Kanun", "7524 sayili" — TR kanun/KHK numarasi.
    // 4-5 hane: 1000'in altindaki kanun numaralari korpusta yok ve
    // 3 haneye inmek "232 sayili" gibi Section-232 kirintilarini yakalar.
    re: new RegExp(`\\b(\\d{4,5})\\s*${SAYILI}\\b`, 'g'),
    kind: 'mevzuat',
    build: (m) => `TR-${m[1]}`,
  },
  {
    // "(AB) 2023/956", "(EU) 2023/956", "(AB) 2026/1234"
    re: /\((?:AB|EU)\)\s*(\d{4})\/(\d{2,4})/g,
    kind: 'mevzuat',
    build: (m) => `AB-${m[1]}/${Number(m[2])}`,
  },
  {
    // ABD Ticaret Genisletme Kanunu 232. madde ve akrabalari (301, 337).
    re: /\bSection\s?(\d{3})\b/gi,
    kind: 'mevzuat',
    build: (m) => `US-SECTION-${m[1]}`,
  },
  {
    // "2026/12 sayılı Karar", "2026/3 Tebliğ", "2025/7 Yönetmelik"
    re: new RegExp(
      `\\b(\\d{4})\\/(\\d{1,3})\\s*(?:${SAYILI}\\s*)?(Karar|Kararı|Tebliğ|Tebliği|Yönetmelik|Yönetmeliği)\\b`,
      'g',
    ),
    kind: 'mevzuat',
    build: (m) => `TR-${m[1]}/${Number(m[2])}`,
  },
]);

/**
 * Metinden kanonik mevzuat referans kodlarini cikarir.
 *
 * @param {string} text
 * @returns {Set<string>} kanonik kodlar ('TR-5510', 'AB-2023/956', ...)
 */
export function extractRefCodes(text) {
  const out = new Set();
  const str = String(text ?? '');
  if (!str) return out;

  for (const { re, build } of PATTERNS) {
    // Desenler modul seviyesinde global; lastIndex'i her cagrida sifirla
    // (aksi halde ikinci cagri metnin ortasindan baslar).
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(str)) !== null) {
      const code = build(m);
      if (code) out.add(code);
      // Sifir uzunlukta eslesme sonsuz donguye girmesin.
      if (m.index === re.lastIndex) re.lastIndex += 1;
    }
  }
  return out;
}

/**
 * Bir haberin referans kodlari. Baslik + ozet + govdenin bas kismi okunur.
 *
 * GOVDE SINIRI (4000 karakter): mevzuat haberlerinde kod ilk paragraflarda
 * geciyor; devaminda "ayrica bkz. 213 sayili VUK" gibi ILGISIZ atiflar
 * birikiyor ve dosya birlesmelerini kirletiyor. Sinirlamak precision'i
 * artiriyor, recall'u olcume gore etkilemiyor.
 */
export const BODY_SCAN_CHARS = 4000;

export function refCodesOf(article) {
  const title = String(article?.title ?? '');
  const summary = String(article?.summary ?? '');
  const body = String(article?.body ?? '').slice(0, BODY_SCAN_CHARS);
  return extractRefCodes(`${title}\n${summary}\n${body}`);
}

/** Iki kod kumesinin kesisimi (dosya birlesme kosulu iii). */
export function sharedRefCodes(a, b) {
  const out = [];
  if (!a || !b) return out;
  for (const code of a) if (b.has(code)) out.push(code);
  return out.sort();
}

/**
 * Kume icindeki en yayin kodu — dosyanin adini/kimligini verir.
 * Esitlikte alfabetik: thread_key deterministik olmali.
 */
export function dominantRefCode(codeSets) {
  const freq = new Map();
  for (const set of codeSets || []) {
    for (const code of set || []) freq.set(code, (freq.get(code) || 0) + 1);
  }
  if (freq.size === 0) return null;
  return [...freq.entries()]
    .sort((x, y) => (y[1] - x[1]) || (x[0] < y[0] ? -1 : 1))[0][0];
}
