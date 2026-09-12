// ---------------------------------------------------------------------
// ISLEME HATTI: kumeleme + onem skoru yeniden hesabi
//
// Hem seeder hem POST /collect/run ayni kodu cagirir. Boylece "demo
// verisi" ile "canli toplama" arasinda davranis farki olusmaz.
//
// IDEMPOTENT: ayni veri uzerinde iki kez kosarsa ayni cluster_key'ler
// uretilir, upsert edilir ve skorlar ayni cikar.
// ---------------------------------------------------------------------
import { articleSimhash, clusterArticles, contentHash } from '../lib/dedup.js';
import { buildFactors, computeImportance } from '../lib/importance.js';
import { toMysqlDateTime } from '../lib/http.js';

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
    `SELECT a.id, a.source_id, a.url_hash, a.title, a.body, a.content_hash, a.simhash,
            a.published_at, s.authority_weight
       FROM articles a
       JOIN sources s ON s.id = a.source_id
      ORDER BY a.id ASC`,
  );

  if (rows.length === 0) {
    return { clusters: 0, duplicates: 0, multiSource: 0 };
  }

  const clusters = clusterArticles(rows, opts);
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

  return { clusters: clusters.length, duplicates, multiSource };
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
  const options = thresholdsFromEnv(opts);
  const refreshed = await refreshFingerprints(conn);
  const clustering = await recomputeClusters(conn, options);
  const scoring = await recomputeImportance(conn, options);
  return { refreshed, ...clustering, ...scoring };
}
