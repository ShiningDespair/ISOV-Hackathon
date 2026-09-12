// ---------------------------------------------------------------------
// GET /api/stats/overview — panel ust bandi icin toplu istatistik
//
// Tek uc noktada topluyoruz cunku frontend acilista 6 ayri istek atmak
// yerine tek cagri ile tum sayaclari dolduruyor.
// ---------------------------------------------------------------------
import { Router } from 'express';
import { query } from '../lib/db.js';
import { asyncHandler } from '../lib/http.js';
import { formatTrtDate, toIso } from '../lib/serialize.js';
import { BANDS, REGIONS } from './articles.js';

const router = Router();

const SERIES_DAYS = 14;

/** Gunluk seride bos gunleri 0 ile doldurur — grafik kopuk cizilmesin. */
function fillDailySeries(rows, days = SERIES_DAYS) {
  // Gun anahtarlari TRT takvimine gore uretilir; sunucu UTC olsa bile
  // seri ile MySQL'in DATE() gruplamasi ayni gune dusmeli.
  const byDate = new Map();
  for (const r of rows) {
    const key = typeof r.day === 'string' ? r.day.slice(0, 10) : formatTrtDate(r.day);
    if (key) byDate.set(key, r);
  }

  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const key = formatTrtDate(d);
    const row = byDate.get(key);
    out.push({
      date: key,
      count: Number(row?.cnt ?? 0),
      critical_count: Number(row?.critical_cnt ?? 0),
    });
  }
  return out;
}

/** Eksik ENUM degerlerini 0 ile tamamlar, sirayi sabit tutar. */
function fillBuckets(rows, keys, keyField) {
  const byKey = new Map(rows.map((r) => [r[keyField], Number(r.cnt)]));
  return keys.map((k) => ({ key: k, count: byKey.get(k) ?? 0 }));
}

router.get('/overview', asyncHandler(async (req, res) => {
  const [
    totals,
    regionRows,
    bandRows,
    categoryRows,
    seriesRows,
    sourceCount,
    clusterStats,
    lastRun,
  ] = await Promise.all([
    query(`SELECT COUNT(*) AS total,
                  SUM(CASE WHEN is_duplicate = 1 THEN 1 ELSE 0 END) AS duplicates,
                  SUM(CASE WHEN is_duplicate = 0 THEN 1 ELSE 0 END) AS uniques,
                  MAX(published_at) AS last_published_at
             FROM articles`),
    query(`SELECT region, COUNT(*) AS cnt FROM articles
            WHERE is_duplicate = 0 GROUP BY region`),
    query(`SELECT importance_band, COUNT(*) AS cnt FROM articles
            WHERE is_duplicate = 0 GROUP BY importance_band`),
    query(`SELECT category, COUNT(*) AS cnt FROM articles
            WHERE is_duplicate = 0 AND category IS NOT NULL AND category <> ''
            GROUP BY category ORDER BY cnt DESC, category ASC LIMIT 10`),
    query(`SELECT DATE(published_at) AS day, COUNT(*) AS cnt,
                  SUM(CASE WHEN importance_band = 'KRITIK' THEN 1 ELSE 0 END) AS critical_cnt
             FROM articles
            WHERE is_duplicate = 0
              AND published_at >= DATE_SUB(CURDATE(), INTERVAL ${SERIES_DAYS - 1} DAY)
            GROUP BY DATE(published_at) ORDER BY day ASC`),
    query('SELECT COUNT(*) AS cnt, SUM(is_active) AS active FROM sources'),
    query(`SELECT COUNT(*) AS cnt,
                  SUM(CASE WHEN member_count > 1 THEN 1 ELSE 0 END) AS multi,
                  COALESCE(AVG(member_count), 0) AS avg_members
             FROM clusters`),
    query(`SELECT id, started_at, finished_at, trigger_type,
                  fetched_count, new_count, duplicate_count, error_count
             FROM collection_runs ORDER BY started_at DESC LIMIT 1`),
  ]);

  const t = totals[0] || {};
  const totalArticles = Number(t.total ?? 0);
  const duplicates = Number(t.duplicates ?? 0);
  const uniques = Number(t.uniques ?? 0);

  res.json({
    totals: {
      articles: totalArticles,
      unique_articles: uniques,
      duplicates,
      sources: Number(sourceCount[0]?.cnt ?? 0),
      active_sources: Number(sourceCount[0]?.active ?? 0),
      clusters: Number(clusterStats[0]?.cnt ?? 0),
      multi_source_clusters: Number(clusterStats[0]?.multi ?? 0),
      avg_cluster_size: Number(Number(clusterStats[0]?.avg_members ?? 0).toFixed(2)),
      // Tekillestirme orani: kac haber tekrar diye elendi (0..1)
      dedup_ratio: totalArticles > 0
        ? Number((duplicates / totalArticles).toFixed(4))
        : 0,
      last_published_at: toIso(t.last_published_at),
    },
    by_region: fillBuckets(regionRows, REGIONS, 'region'),
    by_band: fillBuckets(bandRows, BANDS, 'importance_band'),
    top_categories: categoryRows.map((r) => ({
      key: r.category,
      count: Number(r.cnt),
    })),
    daily: fillDailySeries(seriesRows),
    last_run: lastRun[0] ? {
      id: Number(lastRun[0].id),
      trigger_type: lastRun[0].trigger_type,
      started_at: toIso(lastRun[0].started_at),
      finished_at: toIso(lastRun[0].finished_at),
      fetched_count: Number(lastRun[0].fetched_count),
      new_count: Number(lastRun[0].new_count),
      duplicate_count: Number(lastRun[0].duplicate_count),
      error_count: Number(lastRun[0].error_count),
    } : null,
  });
}));

export default router;
