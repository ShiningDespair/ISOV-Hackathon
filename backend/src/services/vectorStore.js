// ---------------------------------------------------------------------
// QDRANT VEKTOR DEPOSU (ince REST istemcisi)
//
// Agir bir SDK eklemiyoruz; Node 22'nin yerlesik fetch'i yeterli.
// Qdrant REST yuzeyinin sadece dort ucunu kullaniyoruz:
//   GET  /collections/<c>                -> var mi?
//   PUT  /collections/<c>                -> olustur
//   PUT  /collections/<c>/points         -> upsert
//   POST /collections/<c>/points/search  -> komsu sorgusu
//
// SOZLESME: Qdrant erisilemezse HATA FIRLATMAZ. Her fonksiyon `ok:false`
// doner, cagiran taraf semantik katmani atlar ve sistem eskisi gibi calisir.
// ---------------------------------------------------------------------

export const DEFAULT_COLLECTION = 'isov_articles';
const DEFAULT_URL = 'http://qdrant:6333';
const DEFAULT_TIMEOUT_MS = 8000;

export function qdrantUrl() {
  return String(process.env.QDRANT_URL || DEFAULT_URL).replace(/\/+$/, '');
}

export function collectionName() {
  return String(process.env.QDRANT_COLLECTION || DEFAULT_COLLECTION);
}

function timeoutMs() {
  const n = Number(process.env.QDRANT_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

/**
 * Tek noktadan HTTP: hata hicbir zaman disari sizmaz, {ok, status, body} doner.
 * 404 de "hata" degil bilgidir — koleksiyon yoklugu bununla anlasiliyor.
 */
async function request(method, pathname, body) {
  const url = `${qdrantUrl()}${pathname}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(process.env.QDRANT_API_KEY ? { 'api-key': process.env.QDRANT_API_KEY } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs()),
    });
    let payload = null;
    try { payload = await res.json(); } catch { payload = null; }
    return { ok: res.ok, status: res.status, body: payload, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, status: 0, body: null, error: err?.message || String(err) };
  }
}

/** Qdrant ayakta mi? */
export async function isAvailable() {
  const res = await request('GET', '/collections');
  return res.ok;
}

/**
 * Koleksiyonu (yoksa) acar. Boyut cagirandan gelir — model degisince
 * boyut da degisir; uyusmazlikta koleksiyon YENIDEN yaratilir, cunku
 * farkli boyutlu vektorler ayni koleksiyonda anlamsizdir.
 *
 * @param {number} size vektor boyutu
 * @returns {Promise<{ok:boolean, created:boolean, error:string|null}>}
 */
export async function ensureCollection(size, { distance = 'Cosine' } = {}) {
  const dim = Number(size);
  if (!Number.isFinite(dim) || dim <= 0) {
    return { ok: false, created: false, error: 'gecersiz vektor boyutu' };
  }
  const name = collectionName();

  const info = await request('GET', `/collections/${encodeURIComponent(name)}`);
  if (info.ok) {
    const params = info.body?.result?.config?.params?.vectors;
    const current = Number(params?.size);
    if (current === dim) return { ok: true, created: false, error: null };
    // Boyut degistiyse temiz baslangic: eski vektorler artik gecersiz.
    const dropped = await request('DELETE', `/collections/${encodeURIComponent(name)}`);
    if (!dropped.ok) return { ok: false, created: false, error: dropped.error };
  } else if (info.status === 0) {
    // Ag/servis yok — sessizce degrade.
    return { ok: false, created: false, error: info.error };
  }

  const created = await request('PUT', `/collections/${encodeURIComponent(name)}`, {
    vectors: { size: dim, distance },
  });
  return { ok: created.ok, created: created.ok, error: created.error };
}

/**
 * Haberleri (id + vektor + payload) yazar. Buyuk listeleri parcalar.
 * @param {Array<{id:number, vector:number[], payload?:object}>} points
 */
export async function upsertArticles(points, { batchSize = 128 } = {}) {
  const list = Array.isArray(points) ? points.filter((p) => p && Array.isArray(p.vector)) : [];
  if (list.length === 0) return { ok: true, upserted: 0, error: null };

  const name = collectionName();
  let upserted = 0;
  for (let i = 0; i < list.length; i += batchSize) {
    const chunk = list.slice(i, i + batchSize).map((p) => ({
      id: Number(p.id),
      vector: p.vector,
      payload: p.payload || {},
    }));
    const res = await request(
      'PUT',
      `/collections/${encodeURIComponent(name)}/points?wait=true`,
      { points: chunk },
    );
    if (!res.ok) return { ok: false, upserted, error: res.error };
    upserted += chunk.length;
  }
  return { ok: true, upserted, error: null };
}

/**
 * Bir vektorun komsularini getirir.
 * @returns {Promise<{ok:boolean, hits:Array<{id:number, score:number, payload:object}>, error:string|null}>}
 */
export async function searchNeighbors(vector, { limit = 10, scoreThreshold = null } = {}) {
  if (!Array.isArray(vector) || vector.length === 0) {
    return { ok: false, hits: [], error: 'bos vektor' };
  }
  const name = collectionName();
  const body = { vector, limit: Math.max(1, Number(limit) || 10), with_payload: true };
  if (scoreThreshold !== null && Number.isFinite(Number(scoreThreshold))) {
    body.score_threshold = Number(scoreThreshold);
  }
  const res = await request(
    'POST',
    `/collections/${encodeURIComponent(name)}/points/search`,
    body,
  );
  if (!res.ok) return { ok: false, hits: [], error: res.error };
  const hits = Array.isArray(res.body?.result)
    ? res.body.result.map((h) => ({ id: Number(h.id), score: Number(h.score), payload: h.payload || {} }))
    : [];
  return { ok: true, hits, error: null };
}

/** Koleksiyondaki artik kayitlari siler (DB'den dusen haberler icin). */
export async function deletePoints(ids) {
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isFinite);
  if (list.length === 0) return { ok: true, deleted: 0, error: null };
  const name = collectionName();
  const res = await request(
    'POST',
    `/collections/${encodeURIComponent(name)}/points/delete?wait=true`,
    { points: list },
  );
  return { ok: res.ok, deleted: res.ok ? list.length : 0, error: res.error };
}
