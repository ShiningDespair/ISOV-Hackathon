// ---------------------------------------------------------------------
// LLM SERVISI — Anthropic Claude ile ozetleme / etiketleme
//
// TASARIM KARARI: bu servis ASLA hata firlatmaz.
// Hackathon demosu anahtarsiz makinede de calismak zorunda oldugu icin
// ANTHROPIC_API_KEY yoksa `available:false` doner ve cagiran taraf
// deterministik heuristige (ilk 2 cumle + anahtar kelime) duser.
// Ayni sebeple SDK dinamik import ediliyor: paket kurulu degilse bile
// API ayaga kalkar.
// ---------------------------------------------------------------------
import {
  TR_STOPWORDS, normalizeText, tokenize,
} from '../lib/dedup.js';
// Cumle ayirma TEK EVDE: lib/summarize.js. Buradaki eski surum
// `split(/(?<=[.!?])\s+(?=[A-ZCGIOSU0-9])/)` ile boluyordu ve korpusun
// hata kiplerinde yaniliyordu: "Md. 5", "vb.", "2026/2022" gibi diziler
// cumleyi ortasindan kesiyor, rakamla baslayan devam parcasi yeni cumle
// sayiliyordu. Ayni metni iki farkli bolucuyle islemek, ozetin frontend'de
// ve backend'de FARKLI cikmasi demek. DigestCard.tsx'in cozdugu surum
// lib/summarize.js'e tasindi; bu dosya ona DEVREDIYOR.
import { splitSentences } from '../lib/summarize.js';

/** Model kimligi — CONTRACT geregi sabit, degistirmeyin. */
export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

const MAX_BODY_CHARS = 12000; // istek boyutunu makul tut (token maliyeti)

let clientPromise = null;

/** API anahtari var mi? Tek dogruluk noktasi. */
export function isAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** SDK'yi tembel yukler; paket/anahtar yoksa null doner. */
async function getClient() {
  if (!isAvailable()) return null;
  if (!clientPromise) {
    clientPromise = import('@anthropic-ai/sdk')
      .then((mod) => new (mod.default ?? mod.Anthropic)())
      .catch((err) => {
        console.warn('[llm] @anthropic-ai/sdk yuklenemedi, heuristige dusuluyor:', err.message);
        return null;
      });
  }
  return clientPromise;
}

// --- heuristik yedek ---------------------------------------------------

const CATEGORY_HINTS = [
  ['mevzuat', ['resmi gazete', 'yönetmelik', 'tebliğ', 'kanun', 'genelge', 'mevzuat', 'cumhurbaşkanı kararı']],
  ['tesvik', ['teşvik', 'destek', 'hibe', 'kosgeb', 'tübitak', 'kredi', 'fon']],
  ['ihracat', ['ihracat', 'gümrük', 'dış ticaret', 'ithalat', 'tarife', 'kota']],
  ['enerji', ['enerji', 'elektrik', 'doğal gaz', 'yenilenebilir', 'güneş', 'rüzgar']],
  ['vergi', ['vergi', 'kdv', 'ötv', 'stopaj', 'muafiyet', 'beyanname']],
  ['istihdam', ['asgari ücret', 'istihdam', 'sgk', 'işçi', 'çalışan', 'sendika']],
  ['surdurulebilirlik', ['karbon', 'cbam', 'yeşil', 'sürdürülebilir', 'emisyon', 'iklim']],
  ['finans', ['faiz', 'merkez bankası', 'enflasyon', 'kur', 'döviz', 'borsa']],
];

const REGION_HINTS = [
  ['TURKIYE', ['türkiye', 'ankara', 'istanbul', 'tbmm', 'resmi gazete', 'kosgeb', 'tcmb']],
  // DIKKAT: kisa ek 'ab' kullanilmaz — 'ABD' icinde geciyor ve bolgeyi
  // yanlis tahmin ettiriyor. Ayirt edici ifadeler tercih edildi.
  ['AVRUPA', ['avrupa', 'avrupa birliği', 'ab komisyonu', 'brüksel', 'euro', 'cbam', 'eur-lex']],
  ['AMERIKA', ['abd', 'amerika', 'washington', 'fed', 'new york']],
  ['ASYA', ['çin', 'japonya', 'hindistan', 'kore', 'asya']],
  ['KURESEL', ['küresel', 'dünya', 'imf', 'wto', 'birleşmiş milletler', 'oecd']],
];

/**
 * Ipucu listeleri okunakli olsun diye aksanli yazilir; karsilastirma
 * normalizeText ciktisina (aksansiz, kucuk harf) karsi yapildigi icin
 * yukleme aninda ayni normalizasyondan geciriyoruz. Aksi halde "teşvik"
 * ipucu "tesvik" metnini hicbir zaman yakalayamaz.
 */
function normalizeHints(pairs) {
  return pairs.map(([value, needles]) => [value, needles.map((n) => normalizeText(n))]);
}

const NEGATIVE_HINTS = ['zam', 'kriz', 'daralma', 'azalış', 'ceza', 'yasak', 'kısıtlama', 'düşüş', 'iflas'];
const POSITIVE_HINTS = ['destek', 'teşvik', 'artış', 'büyüme', 'anlaşma', 'yatırım', 'muafiyet', 'indirim'];

const CATEGORY_RULES = normalizeHints(CATEGORY_HINTS);
const REGION_RULES = normalizeHints(REGION_HINTS);
const NEGATIVE_RULES = NEGATIVE_HINTS.map((h) => normalizeText(h));
const POSITIVE_RULES = POSITIVE_HINTS.map((h) => normalizeText(h));

function guessFrom(hints, haystack, fallback) {
  for (const [value, needles] of hints) {
    if (needles.some((n) => haystack.includes(n))) return value;
  }
  return fallback;
}

/**
 * LLM'siz deterministik ozet/etiket uretimi.
 * Disari acik: seeder ve rapor servisi ayni fonksiyonu kullanabilsin.
 */
export function heuristicSummary({ title = '', body = '', language = 'tr' } = {}) {
  const sentences = splitSentences(body);
  const summary = sentences.slice(0, 2).join(' ') || String(title || '').trim();

  // Anahtar kelime: durak kelimeler haric, en sik gecen 8 token.
  const freq = new Map();
  for (const token of tokenize(`${title} ${body}`)) {
    if (token.length < 4 || TR_STOPWORDS.has(token)) continue;
    freq.set(token, (freq.get(token) || 0) + 1);
  }
  const keywords = [...freq.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))
    .slice(0, 8)
    .map(([t]) => t);

  const hay = normalizeText(`${title} ${body}`);
  const negative = NEGATIVE_RULES.filter((h) => hay.includes(h)).length;
  const positive = POSITIVE_RULES.filter((h) => hay.includes(h)).length;

  return {
    summary: summary.slice(0, 1000),
    key_points: sentences.slice(0, 3).map((s) => s.slice(0, 240)),
    entities: { kurum: [], kisi: [], sektor: [] },
    category: guessFrom(CATEGORY_RULES, hay, 'gundem'),
    sentiment: positive > negative ? 'POZITIF' : (negative > positive ? 'NEGATIF' : 'NOTR'),
    tags: keywords.slice(0, 5).map(slugifyTag),
    region: guessFrom(REGION_RULES, hay, 'DIGER'),
    language,
    source: 'heuristic',
  };
}

/** Turkce karakterleri sadelestirip slug uretir (CONTRACT: tire ayrac, TR harf yok). */
export function slugifyTag(value) {
  const map = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', İ: 'i', I: 'i' };
  return String(value || '')
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüİI]/g, (m) => map[m] ?? m)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// --- LLM yolu ----------------------------------------------------------

// Istem duzgun Turkce imla ile yazilir: modele hangi dilde yazmasini
// istiyorsak ornegi o dilde vermek ciktinin imlasini da belirliyor.
// ASCII'ye katlanmis Turkce ile yazilmis bir istem, katlanmis ozetler uretir.
// ENUM degerleri (KURESEL, TURKIYE, tesvik ...) sema kodu oldugu icin
// ASCII kalir - bunlar ekranda gosterilen metin degil, veritabani degeri.
const SYSTEM_PROMPT = `Sen İstanbul Sanayi Odası (İSO) ve İSOV için çalışan bir haber analistisin.
Sana verilen haberi Türkçe özetle ve sınıflandır.
Özet, bir sanayiciye "bu haber beni nasıl etkiler" sorusunu yanıtlamalı.

Türkçe imla kurallarına harfiyen uy: ç, ğ, ı, İ, ö, ş, ü harflerini doğru kullan.
Kurum adlarını tam yaz (Türkiye İstatistik Kurumu, Avrupa Komisyonu, Resmî Gazete).
Sayılarda ondalık ayracı virgül, binlik ayracı noktadır: 4,2 ve 1.250.

YALNIZCA geçerli JSON döndür, kod bloğu veya açıklama ekleme.

JSON şeması:
{
  "summary": "2-4 cümlelik Türkçe özet",
  "key_points": ["madde", "madde", "madde"],
  "entities": {"kurum": [], "kisi": [], "sektor": []},
  "category": "mevzuat|tesvik|ihracat|enerji|vergi|istihdam|surdurulebilirlik|finans|gundem",
  "sentiment": "POZITIF|NOTR|NEGATIF",
  "tags": ["slug-formatinda", "en-fazla-5"],
  "region": "KURESEL|TURKIYE|AMERIKA|AVRUPA|ASYA|DIGER"
}

Not: category, sentiment, tags ve region alanlari sema kodudur; yukaridaki
listelerden birebir secilir ve Turkce karakter icermez. Metin alanlari
(summary, key_points, entities) tam Turkce imla ile yazilir.`;

const VALID_REGIONS = new Set(['KURESEL', 'TURKIYE', 'AMERIKA', 'AVRUPA', 'ASYA', 'DIGER']);
const VALID_SENTIMENTS = new Set(['POZITIF', 'NOTR', 'NEGATIF']);

/** Model ciktisini semaya zorlar; eksik alan varsa heuristikten tamamlanir. */
function coerceResult(parsed, fallback) {
  const out = { ...fallback, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  out.summary = String(out.summary || fallback.summary || '').slice(0, 1000);
  out.key_points = Array.isArray(out.key_points)
    ? out.key_points.map((k) => String(k).slice(0, 240)).slice(0, 6)
    : fallback.key_points;
  out.entities = (out.entities && typeof out.entities === 'object') ? out.entities : fallback.entities;
  out.category = String(out.category || fallback.category || 'gundem').slice(0, 60);
  out.sentiment = VALID_SENTIMENTS.has(out.sentiment) ? out.sentiment : fallback.sentiment;
  out.region = VALID_REGIONS.has(out.region) ? out.region : fallback.region;
  out.tags = Array.isArray(out.tags)
    ? [...new Set(out.tags.map(slugifyTag).filter(Boolean))].slice(0, 5)
    : fallback.tags;
  return out;
}

/** Yanit metninden JSON blogunu ayiklar (model bazen ``` ile sarabiliyor). */
function extractJson(text) {
  const raw = String(text || '').trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Bir haberi ozetler ve siniflandirir.
 * Anahtar/paket/ag yoksa veya model hata verirse heuristik sonucu doner —
 * cagiran taraf `available` alanina bakarak hangi yolun kullanildigini bilir.
 *
 * @returns {Promise<{available:boolean, summary:string, key_points:string[],
 *   entities:object, category:string, sentiment:string, tags:string[], region:string}>}
 */
export async function summarizeArticle({ title = '', body = '', language = 'tr' } = {}) {
  const fallback = heuristicSummary({ title, body, language });

  const client = await getClient();
  if (!client) return { available: false, ...fallback };

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      // Ozetleme agir dusunme gerektirmiyor; dusuk efor hem ucuz hem hizli.
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `BASLIK: ${title}\n\nMETIN:\n${String(body || '').slice(0, MAX_BODY_CHARS)}`,
      }],
    });

    const text = (response.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    const parsed = extractJson(text);
    if (!parsed) {
      console.warn('[llm] JSON ayristirilamadi, heuristige dusuluyor');
      return { available: false, ...fallback };
    }

    return { available: true, source: 'llm', ...coerceResult(parsed, fallback) };
  } catch (err) {
    // Kota/ag/model hatasi demoyu durdurmasin.
    console.warn('[llm] cagri basarisiz, heuristige dusuluyor:', err.message);
    return { available: false, ...fallback };
  }
}

/** Toplu ozetleme — sirayla, kota dostu. */
export async function summarizeMany(items = []) {
  const results = [];
  for (const item of items) {
    results.push(await summarizeArticle(item));
  }
  return results;
}

export default { MODEL, isAvailable, summarizeArticle, summarizeMany, heuristicSummary, slugifyTag };
