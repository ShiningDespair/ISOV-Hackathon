// ---------------------------------------------------------------------
// ISLEME HATTI: kumeleme + onem skoru yeniden hesabi
//
// Hem seeder hem POST /collect/run ayni kodu cagirir. Boylece "demo
// verisi" ile "canli toplama" arasinda davranis farki olusmaz.
//
// IDEMPOTENT: ayni veri uzerinde iki kez kosarsa ayni cluster_key'ler
// uretilir, upsert edilir ve skorlar ayni cikar.
// ---------------------------------------------------------------------
import {
  articleSimhash, clusterArticles, clusterKeyOf, contentHash, pickRepresentative, urlHash,
} from '../lib/dedup.js';
import { buildFactors, computeImportance } from '../lib/importance.js';
import { toMysqlDateTime } from '../lib/http.js';
import { buildEmbeddingText, embed } from './embeddings.js';
import * as vectorStore from './vectorStore.js';

/**
 * Parmak izlerini (content_hash + simhash) baslik/govdeden yeniden uretir.
 *
 * NEDEN: normalizasyon veya simhash algoritmasi degistiginde eski kayitlarin
 * imzalari bayatlar ve kumeleme sessizce bozulur. Her kosumda ucuz bir
 * dogrulama yapip sadece DEGISENLERI yaziyoruz — sistem kendi kendini onarir.
 */
export async function refreshFingerprints(conn) {
  const [rows] = await conn.query('SELECT id, title, body, content_hash, simhash FROM articles');
  let refreshed = 0;
  for (const row of rows) {
    const ch = contentHash(row.title, row.body);
    const sh = articleSimhash(row.title, row.body).toString();
    if (ch === row.content_hash && sh === String(row.simhash ?? '')) continue;
    await conn.execute(
      'UPDATE articles SET content_hash = ?, simhash = ? WHERE id = ?',
      [ch, sh, row.id],
    );
    refreshed += 1;
  }
  return refreshed;
}

/**
 * Tum makaleleri yeniden kumeler ve articles.cluster_id / is_duplicate /
 * duplicate_of_id alanlarini gunceller.
 *
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {object} [opts] dedup esikleri
 */
export async function recomputeClusters(conn, opts = {}) {
  const [rows] = await conn.query(
    `SELECT a.id, a.source_id, a.url_hash, a.title, a.body, a.summary, a.content_hash, a.simhash,
            a.published_at, s.authority_weight
       FROM articles a
       JOIN sources s ON s.id = a.source_id
      ORDER BY a.id ASC`,
  );

  if (rows.length === 0) {
    return { clusters: 0, duplicates: 0, multiSource: 0 };
  }

  // 1) Mevcut (sozcuksel) kumeleme — davranisi DEGISMEDI.
  const lexicalClusters = clusterArticles(rows, opts);
  // 2) EK katman: diller arasi semantik birlestirme. Basarisiz olursa
  //    sozcuksel sonuc oldugu gibi kullanilir.
  const semanticResult = await semanticMerge(lexicalClusters, rows, opts);
  const clusters = semanticResult.clusters;

  const usedClusterIds = [];
  let duplicates = 0;
  let multiSource = 0;

  for (const cluster of clusters) {
    const members = cluster.members;
    const rep = cluster.representative;

    const dates = members
      .map((m) => (m.published_at ? new Date(m.published_at) : null))
      .filter((d) => d && !Number.isNaN(d.getTime()));
    const firstSeen = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : new Date();
    const lastSeen = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date();

    // Once temsilcisiz ekle: representative_article_id FK'si var, ama
    // makaleler zaten mevcut oldugu icin dogrudan yazabiliyoruz.
    await conn.execute(
      `INSERT INTO clusters
         (cluster_key, representative_article_id, member_count, headline, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         representative_article_id = VALUES(representative_article_id),
         member_count = VALUES(member_count),
         headline = VALUES(headline),
         first_seen_at = VALUES(first_seen_at),
         last_seen_at = VALUES(last_seen_at)`,
      [
        cluster.cluster_key,
        rep.id,
        members.length,
        String(rep.title || '').slice(0, 400),
        toMysqlDateTime(firstSeen),
        toMysqlDateTime(lastSeen),
      ],
    );

    const [idRows] = await conn.execute(
      'SELECT id FROM clusters WHERE cluster_key = ? LIMIT 1',
      [cluster.cluster_key],
    );
    const clusterId = idRows[0]?.id;
    if (!clusterId) continue;
    usedClusterIds.push(clusterId);

    if (members.length > 1) multiSource += 1;

    for (const member of members) {
      const isDup = member.id !== rep.id;
      if (isDup) duplicates += 1;
      await conn.execute(
        `UPDATE articles
            SET cluster_id = ?, is_duplicate = ?, duplicate_of_id = ?
          WHERE id = ?`,
        [clusterId, isDup ? 1 : 0, isDup ? rep.id : null, member.id],
      );
    }
  }

  // Artik uyesi kalmayan kumeleri temizle — tekrar kosumlarda cop birikmesin.
  if (usedClusterIds.length) {
    const ph = usedClusterIds.map(() => '?').join(', ');
    await conn.execute(`DELETE FROM clusters WHERE id NOT IN (${ph})`, usedClusterIds);
  }

  return { clusters: clusters.length, duplicates, multiSource, semantic: semanticResult.stats };
}

/**
 * Onem skorlarini bastan hesaplar.
 * SIRA ONEMLI: kumeleme bittikten SONRA cagrilmali, cunku `corroboration`
 * kume uye sayisindan, `recency` de published_at'ten turetiliyor.
 */
export async function recomputeImportance(conn, { now = new Date() } = {}) {
  const [rows] = await conn.query(
    `SELECT a.id, a.published_at, a.importance_factors,
            s.authority_weight,
            COALESCE(c.member_count, 1) AS member_count
       FROM articles a
       JOIN sources s ON s.id = a.source_id
       LEFT JOIN clusters c ON c.id = a.cluster_id
      ORDER BY a.id ASC`,
  );
  if (rows.length === 0) return { updated: 0, bands: {} };

  // Etiket agirliklarini tek sorguda topla (N+1 sorgudan kacin).
  const [tagRows] = await conn.query(
    `SELECT at.article_id, t.weight
       FROM article_tags at JOIN tags t ON t.id = at.tag_id`,
  );
  const tagWeights = new Map();
  for (const r of tagRows) {
    const key = Number(r.article_id);
    if (!tagWeights.has(key)) tagWeights.set(key, []);
    tagWeights.get(key).push(Number(r.weight));
  }

  const bands = { KRITIK: 0, YUKSEK: 0, ORTA: 0, DUSUK: 0 };
  let updated = 0;

  for (const row of rows) {
    const base = typeof row.importance_factors === 'string'
      ? safeJson(row.importance_factors)
      : (row.importance_factors || {});

    const factors = buildFactors({
      baseFactors: base,
      authorityWeight: row.authority_weight,
      publishedAt: row.published_at,
      memberCount: row.member_count,
      tagWeights: tagWeights.get(Number(row.id)),
      now,
    });
    const score = computeImportance(factors);

    await conn.execute(
      `UPDATE articles
          SET importance_score = ?, importance_factors = ?,
              status = 'ISLENDI', processed_at = NOW()
        WHERE id = ?`,
      [score, JSON.stringify(factors), row.id],
    );
    updated += 1;

    // Band dagilimini rapor/ozet ciktisi icin sayiyoruz (DB'deki generated
    // kolonla ayni esikler importance.js'te tanimli).
    if (score >= 80) bands.KRITIK += 1;
    else if (score >= 60) bands.YUKSEK += 1;
    else if (score >= 35) bands.ORTA += 1;
    else bands.DUSUK += 1;
  }

  return { updated, bands };
}

function safeJson(value) {
  try { return JSON.parse(value) || {}; } catch { return {}; }
}

// =====================================================================
// SEMANTIK (DILLER ARASI) TEKILLESTIRME — EK KATMAN
//
// Sozcuksel kumeleme bittikten SONRA calisir ve sonucunun UZERINE YAZMAZ;
// yalnizca yeni birlestirmeler ekler. Kapaliysa ya da model/Qdrant yoksa
// hic devreye girmez ve sistem eskisi gibi calisir.
//
// Iki haber SADECE su kosullarin HEPSI saglanirsa birlestirilir:
//   1) kosinus benzerligi >= SEMANTIC_SIMILARITY_THRESHOLD
//   2) FARKLI kaynak — kumeleme "kac bagimsiz kaynak dogruladi" sorusunu
//      yanitlar; ayni kaynagin iki yazisini birlestirmek bu sayiyi sisirir
//   3) published_at farki <= SEMANTIC_MAX_DAY_GAP gun
//   4) sayisal uyum siniri (asagida) — ayni olay ayni mansetteki rakamlari
//      tasir; hicbir rakami ortusmeyen iki metin ayni olay degildir
// =====================================================================

/** Varsayilanlar canli veri uzerinde kalibre edildi (bkz. docs/CONTRACT.md). */
export const DEFAULT_SEMANTIC_THRESHOLD = 0.935;
export const DEFAULT_SEMANTIC_MAX_DAY_GAP = 4;
/** Her haber icin Qdrant'tan istenecek komsu sayisi. */
const SEMANTIC_NEIGHBOR_LIMIT = 12;

/**
 * Metindeki anlamli sayilarin kanonik kumesi.
 *
 * NEDEN: "4.476 dolar" ile "$4,476", "yuzde 2,50" ile "2.5%" ayni sayidir
 * ama farkli yazilir. Binlik ayraci atilir, ondalik virgul noktaya cevrilir.
 * Yillar (1900-2100) ve 0,1'den kucuk degerler ayirt edici olmadigi icin atilir.
 */
export function numericSignature(text) {
  const out = new Set();
  const str = String(text ?? '');
  const re = /\d[\d.,]*/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    let v = m[0].replace(/[.,]+$/, '');
    // 1.234,56 / 1,234.56 / 4.476 -> binlik ayraclarini kaldir
    if (/^\d{1,3}([.,]\d{3})+([.,]\d+)?$/.test(v)) {
      v = v.replace(/[.,](?=\d{3}(\D|$))/g, '');
    }
    v = v.replace(',', '.');
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    if (Number.isInteger(n) && n >= 1900 && n <= 2100) continue; // yil
    if (n < 0.1) continue;
    out.add(String(Math.round(n * 1000) / 1000));
  }
  return out;
}

/**
 * Sayisal uyum siniri.
 * Iki metinde de rakam varsa EN AZ BIRI ortusmeli. Taraflardan biri
 * rakamsizsa (yorum/analiz yazilari) sinir uygulanmaz — o durumda karari
 * tek basina semantik benzerlik verir.
 */
function numericAgreement(sigA, sigB) {
  if (sigA.size === 0 || sigB.size === 0) return true;
  for (const v of sigA) if (sigB.has(v)) return true;
  return false;
}

/** Semantik katman ayarlarini ortamdan okur. */
export function semanticOptionsFromEnv(overrides = {}) {
  const flag = String(process.env.SEMANTIC_DEDUP_ENABLED ?? 'true').toLowerCase();
  const enabled = !['0', 'false', 'off', 'no', 'hayir'].includes(flag);

  const thr = Number(process.env.SEMANTIC_SIMILARITY_THRESHOLD);
  const gap = Number(process.env.SEMANTIC_MAX_DAY_GAP);
  const guardFlag = String(process.env.SEMANTIC_REQUIRE_NUMERIC_AGREEMENT ?? 'true').toLowerCase();

  return {
    semanticEnabled: enabled,
    semanticThreshold: Number.isFinite(thr) && thr > 0 && thr <= 1 ? thr : DEFAULT_SEMANTIC_THRESHOLD,
    semanticMaxDayGap: Number.isFinite(gap) && gap >= 0 ? gap : DEFAULT_SEMANTIC_MAX_DAY_GAP,
    semanticNumericGuard: !['0', 'false', 'off', 'no', 'hayir'].includes(guardFlag),
    ...overrides,
  };
}

/** Basit union-find (dedup.js'teki ile ayni fikir, kume indeksleri uzerinde). */
function makeUnionFind(n) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) { const nx = parent[x]; parent[x] = r; x = nx; }
    return r;
  };
  return {
    find,
    union(a, b) {
      const ra = find(a); const rb = find(b);
      if (ra === rb) return false;
      parent[rb] = ra;
      return true;
    },
  };
}

/**
 * Sozcuksel kumelerin uzerine semantik birlestirmeleri ekler.
 *
 * @param {Array} lexicalClusters clusterArticles() ciktisi
 * @param {Array} rows makale satirlari (summary DAHIL)
 * @param {object} opts
 * @returns {Promise<{clusters:Array, stats:object}>}
 */
export async function semanticMerge(lexicalClusters, rows, opts = {}) {
  const cfg = semanticOptionsFromEnv(opts);
  const stats = {
    enabled: cfg.semanticEnabled,
    threshold: cfg.semanticThreshold,
    maxDayGap: cfg.semanticMaxDayGap,
    model: null,
    embedded: 0,
    edges: 0,
    merged: 0,
    skipped: null,
  };

  if (!cfg.semanticEnabled) {
    stats.skipped = 'SEMANTIC_DEDUP_ENABLED=false';
    return { clusters: lexicalClusters, stats };
  }
  if (!Array.isArray(rows) || rows.length < 2) {
    stats.skipped = 'yeterli veri yok';
    return { clusters: lexicalClusters, stats };
  }

  try {
    // --- 1) Embedding -------------------------------------------------
    const texts = rows.map((r) => buildEmbeddingText(r));
    const emb = await embed(texts);
    stats.model = emb.model;
    if (!emb.available || emb.vectors.length !== rows.length) {
      stats.skipped = `embedding yok: ${emb.error || 'bilinmeyen'}`;
      return { clusters: lexicalClusters, stats };
    }
    stats.embedded = emb.vectors.length;

    // --- 2) Vektor deposu ---------------------------------------------
    const ready = await vectorStore.ensureCollection(emb.dim);
    if (!ready.ok) {
      stats.skipped = `qdrant yok: ${ready.error || 'bilinmeyen'}`;
      return { clusters: lexicalClusters, stats };
    }

    const points = rows.map((r, i) => ({
      id: Number(r.id),
      vector: emb.vectors[i],
      payload: {
        article_id: Number(r.id),
        source_id: Number(r.source_id ?? 0),
        title: String(r.title || '').slice(0, 400),
        published_at: r.published_at ? new Date(r.published_at).toISOString() : null,
      },
    }));
    const wrote = await vectorStore.upsertArticles(points);
    if (!wrote.ok) {
      stats.skipped = `qdrant yazilamadi: ${wrote.error || 'bilinmeyen'}`;
      return { clusters: lexicalClusters, stats };
    }
    // NOT: DB'den dusmus haberlerin eski vektorleri koleksiyonda kalabilir;
    // komsu sonuclari `byId` uzerinden suzuldugu icin kumelemeyi etkilemezler.

    // --- 3) Komsu sorgulari -> aday kenarlar ---------------------------
    const byId = new Map(rows.map((r, i) => [Number(r.id), i]));
    const sigs = rows.map((r) => numericSignature(`${r.title || ''} ${r.summary || ''}`));
    const times = rows.map((r) => (r.published_at ? new Date(r.published_at).getTime() : NaN));
    const maxGapMs = cfg.semanticMaxDayGap * 86400000;

    // Makale id -> kume indeksi
    const clusterOf = new Map();
    lexicalClusters.forEach((c, ci) => {
      for (const m of c.members) clusterOf.set(Number(m.id), ci);
    });

    const uf = makeUnionFind(lexicalClusters.length);
    const seen = new Set();
    let merged = 0;
    let edges = 0;

    for (let i = 0; i < rows.length; i++) {
      const res = await vectorStore.searchNeighbors(emb.vectors[i], {
        limit: SEMANTIC_NEIGHBOR_LIMIT,
        scoreThreshold: cfg.semanticThreshold,
      });
      if (!res.ok) {
        stats.skipped = `qdrant sorgusu basarisiz: ${res.error || 'bilinmeyen'}`;
        return { clusters: lexicalClusters, stats };
      }

      for (const hit of res.hits) {
        const j = byId.get(hit.id);
        if (j === undefined || j === i) continue;
        const pairKey = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        // KOSUL 1: benzerlik (score_threshold zaten uyguladi, yine de dogrula)
        if (!(hit.score >= cfg.semanticThreshold)) continue;
        // KOSUL 2: farkli kaynak
        const sa = rows[i].source_id ?? null;
        const sb = rows[j].source_id ?? null;
        if (sa !== null && sb !== null && Number(sa) === Number(sb)) continue;
        // KOSUL 3: yayin tarihi yakinligi
        if (!Number.isNaN(times[i]) && !Number.isNaN(times[j])
          && Math.abs(times[i] - times[j]) > maxGapMs) continue;
        // KOSUL 4: sayisal uyum
        if (cfg.semanticNumericGuard && !numericAgreement(sigs[i], sigs[j])) continue;

        edges += 1;
        const ca = clusterOf.get(Number(rows[i].id));
        const cb = clusterOf.get(Number(rows[j].id));
        if (ca === undefined || cb === undefined) continue;
        if (uf.union(ca, cb)) merged += 1;
      }
    }

    stats.edges = edges;
    stats.merged = merged;
    if (merged === 0) return { clusters: lexicalClusters, stats };

    // --- 4) Kumeleri yeniden kur (anahtar + temsilci bastan hesaplanir) --
    const groups = new Map();
    lexicalClusters.forEach((c, ci) => {
      const root = uf.find(ci);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(...c.members);
    });

    const rebuilt = [];
    for (const members of groups.values()) {
      const key = clusterKeyOf(members.map((m) => m.url_hash || urlHash(m.url)));
      rebuilt.push({
        cluster_key: key,
        members,
        representative: pickRepresentative(members),
        member_count: members.length,
      });
    }
    rebuilt.sort((a, b) => (a.cluster_key < b.cluster_key ? -1 : 1));
    return { clusters: rebuilt, stats };
  } catch (err) {
    // Her turlu beklenmeyen hata: sozcuksel sonuca don, sistemi durdurma.
    stats.skipped = `hata: ${err?.message || String(err)}`;
    return { clusters: lexicalClusters, stats };
  }
}

/**
 * Dedup esiklerini ortamdan okur (.env ile ince ayar yapilabilsin diye);
 * gecersiz/eksik degerlerde dedup.js varsayilanlari gecerli kalir.
 */
export function thresholdsFromEnv(overrides = {}) {
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const out = {
    hammingThreshold: num(process.env.DEDUP_HAMMING_THRESHOLD),
    jaccardThreshold: num(process.env.DEDUP_JACCARD_THRESHOLD),
    bodyJaccardThreshold: num(process.env.DEDUP_BODY_JACCARD_THRESHOLD),
    strongTitleJaccard: num(process.env.DEDUP_STRONG_TITLE_JACCARD),
    relaxedHamming: num(process.env.DEDUP_RELAXED_HAMMING),
  };
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key];
  }
  return { ...out, ...overrides };
}

/** Parmak izi tazeleme + kumeleme + skorlama tek adimda. */
export async function runPipeline(conn, opts = {}) {
  const options = { ...thresholdsFromEnv(opts), ...semanticOptionsFromEnv(opts) };
  const refreshed = await refreshFingerprints(conn);
  const clustering = await recomputeClusters(conn, options);
  const scoring = await recomputeImportance(conn, options);
  return { refreshed, ...clustering, ...scoring };
}
