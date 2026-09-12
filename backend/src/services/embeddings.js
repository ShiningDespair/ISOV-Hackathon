// ---------------------------------------------------------------------
// YEREL EMBEDDING SERVISI (cok dilli, CPU, API ANAHTARI YOK)
//
// NEDEN VAR: lib/dedup.js sozcuksel calisiyor (content_hash -> simhash ->
// jaccard). Ayni dildeki haberlerde dogru sonuc veriyor ama ayni olayin
// farkli dillerdeki anlatimlarini kaciriyor: "ECB politika faizini 25 baz
// puan artirdi" ile "ECB hikes rates to 2.5%" HIC ortak token paylasmaz.
// Bu modul o bosluga semantik bir sinyal ekler.
//
// SOZLESME: model yuklenemezse (ag yok, disk yok, paket yok) HATA FIRLATMAZ.
// `available:false` doner ve sistem embedding olmadan eskisi gibi calisir.
// ---------------------------------------------------------------------
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Model dosyalari repoya girmesin diye backend/.cache altina inilir (.gitignore'da). */
const DEFAULT_CACHE_DIR = path.resolve(HERE, '../../.cache/models');

/**
 * Varsayilan model: Xenova/multilingual-e5-base (768 boyut).
 * 131 haberlik canli veri uzerinde olculdu; alternatiflerine gore bilinen
 * dogru ciftleri gurultuden en iyi ayiran model bu cikti (bkz. CONTRACT.md).
 */
export const DEFAULT_EMBEDDING_MODEL = 'Xenova/multilingual-e5-base';

/** Model indirme/yukleme icin ust sinir; ag yavassa seeder sonsuza kadar beklemesin. */
const DEFAULT_LOAD_TIMEOUT_MS = 300000;

/** Tek seferde kac metin tokenize edilip ileri beslenecek. */
const BATCH_SIZE = 8;

// Yukleme bir kez denenir; sonucu (basarili ya da basarisiz) hatirlanir.
let loadPromise = null;
let lastError = null;

function modelId() {
  return String(process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL).trim()
    || DEFAULT_EMBEDDING_MODEL;
}

function cacheDir() {
  return String(process.env.EMBEDDING_CACHE_DIR || DEFAULT_CACHE_DIR);
}

function loadTimeoutMs() {
  const n = Number(process.env.EMBEDDING_LOAD_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LOAD_TIMEOUT_MS;
}

/**
 * e5 ailesi egitim sirasinda "query: " / "passage: " onekleriyle calisiyor.
 * Onek verilmezse skorlar sistematik olarak kayar ve kalibre edilen esik
 * anlamsizlasir. Simetrik benzerlikte her iki tarafa da "query: " konur.
 */
export function inputPrefix(model = modelId()) {
  return /e5/i.test(model) ? 'query: ' : '';
}

/**
 * Modeli (tembel) yukler. Ikinci cagrida ayni sonucu doner.
 * @returns {Promise<{available:boolean, model:string, dim:number|null, pipe:Function|null, error:string|null}>}
 */
async function loadPipeline() {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const model = modelId();
    try {
      // Dinamik import: paket kurulu degilse bile modulun kendisi cokmez.
      const tf = await import('@huggingface/transformers');
      const { env, pipeline } = tf;

      env.cacheDir = cacheDir();
      // Repoda yerel model klasoru yok; gereksiz dosya sistemi aramasini kapat.
      env.allowLocalModels = false;

      const pipe = await withTimeout(
        pipeline('feature-extraction', model, { dtype: 'fp32' }),
        loadTimeoutMs(),
        `model yuklenemedi (zaman asimi ${loadTimeoutMs()} ms)`,
      );

      // Boyutu modelden ogren — vektor deposu koleksiyonunu buna gore acacagiz.
      const probe = await pipe(['test'], { pooling: 'mean', normalize: true });
      const dim = probe.dims[probe.dims.length - 1];

      return { available: true, model, dim, pipe, error: null };
    } catch (err) {
      lastError = err?.message || String(err);
      return { available: false, model, dim: null, pipe: null, error: lastError };
    }
  })();

  return loadPromise;
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

/** Model yuklenebiliyor mu? Hicbir kosulda hata firlatmaz. */
export async function isAvailable() {
  const state = await loadPipeline();
  return state.available;
}

/** Yuklenmis modelin bilgisi (tanilama ve /health icin). */
export async function describe() {
  const state = await loadPipeline();
  return { available: state.available, model: state.model, dim: state.dim, error: state.error };
}

/**
 * Metinleri L2-normalize edilmis vektorlere cevirir (mean pooling + normalize).
 *
 * @param {string[]} texts
 * @returns {Promise<{available:boolean, model:string, dim:number|null, vectors:number[][], error:string|null}>}
 */
export async function embed(texts) {
  const list = Array.isArray(texts) ? texts : [];
  const state = await loadPipeline();
  if (!state.available) {
    return { available: false, model: state.model, dim: null, vectors: [], error: state.error };
  }
  if (list.length === 0) {
    return { available: true, model: state.model, dim: state.dim, vectors: [], error: null };
  }

  const prefix = inputPrefix(state.model);
  const vectors = [];
  try {
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE)
        .map((t) => prefix + String(t ?? '').trim())
        // Bos metin tokenizer'i sasirtiyor; tek bosluk guvenli taban.
        .map((t) => (t.trim() ? t : `${prefix}-`));
      const out = await state.pipe(batch, { pooling: 'mean', normalize: true });
      const dim = out.dims[out.dims.length - 1];
      for (let k = 0; k < out.dims[0]; k++) {
        vectors.push(Array.from(out.data.slice(k * dim, (k + 1) * dim)));
      }
    }
  } catch (err) {
    // Calisma aninda hata (bellek, bozuk girdi): sessizce degrade et.
    return {
      available: false, model: state.model, dim: state.dim, vectors: [],
      error: err?.message || String(err),
    };
  }

  return { available: true, model: state.model, dim: state.dim, vectors, error: null };
}

/**
 * Bir haberden embedlenecek metni uretir.
 *
 * NEDEN "baslik + ozet": ozetler sozlesme geregi HEP Turkce, basliklar
 * kaynagin orijinal dilinde. Ikisini birlikte vermek hem olayin kimligini
 * (baslik, rakamlar, ozel isimler) hem de ortak dildeki anlam yuzeyini
 * (ozet) tasiyor; olculdugunde tek basina baslik veya tek basina ozetten
 * belirgin sekilde iyi ayrim verdi.
 */
export function buildEmbeddingText(article) {
  const title = String(article?.title ?? '').trim();
  const summary = String(article?.summary ?? '').trim();
  if (title && summary) return `${title}. ${summary}`;
  return title || summary;
}

/** Test/yeniden yapilandirma icin yukleme onbellegini bosaltir. */
export function resetForTests() {
  loadPromise = null;
  lastError = null;
}
