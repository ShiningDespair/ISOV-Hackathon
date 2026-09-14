// ---------------------------------------------------------------------
// RAPOR SERVISI — donemsel bulten uretimi
//
// POST /reports/generate ve seeder ayni fonksiyonu kullanir.
// Idempotent: ayni (period_start, period_end, period_type) ucluisu icin
// yeni satir acmak yerine mevcut raporu gunceller; boylece seed iki kez
// kosunca rapor listesi kopyalanmaz.
// ---------------------------------------------------------------------
import { pool } from '../lib/db.js';
import { toMysqlDate } from '../lib/http.js';
import { toDateOnly, toIso, parseJsonColumn } from '../lib/serialize.js';
import { isAvailable, summarizeArticle } from './llm.js';

/** Bolum sirasi: panelde ve basili gazetede bu sirayla gosterilir. */
export const SECTION_ORDER = ['TURKIYE', 'AVRUPA', 'KURESEL', 'AMERIKA', 'ASYA', 'DIGER'];

const DEFAULT_TOTAL_LIMIT = 40;
const DEFAULT_SECTION_LIMIT = 12;

// Kullaniciya gorunen basliklar - duzgun Turkce imla ile.
const PERIOD_LABELS = {
  gunluk: 'Günlük Bülten',
  haftalik: 'Haftalık Bülten',
  aylik: 'Aylık Bülten',
  ozel: 'Özel Rapor',
};

function fmtDate(d) {
  const s = toDateOnly(d);
  if (!s) return '';
  const [y, m, day] = s.split('-');
  return `${day}.${m}.${y}`;
}

/**
 * Deterministik yonetici ozeti sablonu.
 * LLM anahtari yokken de rapor "dolu" gorunsun diye gercek sayilarla yazilir.
 */
export function buildTemplateSummary({ scanned, clusters, duplicates, topTitles, periodStart, periodEnd }) {
  const dateRange = `${fmtDate(periodStart)} - ${fmtDate(periodEnd)}`;
  const parts = [];
  parts.push(
    `${dateRange} döneminde ${scanned} haber tarandı, ` +
    `${clusters} kümede toplandı ve ${duplicates} tekrar eden kayıt elendi.`,
  );
  if (topTitles.length) {
    parts.push(`En kritik başlıklar: ${topTitles.slice(0, 5).map((t) => `“${t}”`).join('; ')}.`);
  } else {
    parts.push('Bu dönemde öne çıkan kritik başlık tespit edilmedi.');
  }
  parts.push('Ayrıntılı liste ve kaynak dağılımı raporun devamındadır.');
  return parts.join(' ');
}

/** LLM varsa daha akici bir ozet dener; her durumda bir metin doner. */
async function buildExecutiveSummary(context) {
  const template = buildTemplateSummary(context);
  if (!isAvailable()) return template;

  const body = [
    `Dönem: ${fmtDate(context.periodStart)} - ${fmtDate(context.periodEnd)}`,
    `Taranan haber: ${context.scanned}, küme: ${context.clusters}, elenen tekrar: ${context.duplicates}`,
    'Öne çıkan başlıklar:',
    ...context.topTitles.map((t, i) => `${i + 1}. ${t}`),
  ].join('\n');

  const result = await summarizeArticle({
    title: 'İSO/İSOV dönem raporu yönetici özeti',
    body,
    language: 'tr',
  });
  // LLM yolu basarisizsa summarizeArticle heuristige duser; o cikti burada
  // sablondan daha kotu olacagi icin available bayragina bakiyoruz.
  return result.available && result.summary ? result.summary : template;
}

/**
 * Rapor uretir/gunceller.
 *
 * @param {object} params
 * @param {string|Date} params.period_start
 * @param {string|Date} params.period_end
 * @param {'gunluk'|'haftalik'|'aylik'|'ozel'} [params.period_type='haftalik']
 * @param {string} [params.title]
 * @param {number} [params.limit]         rapora girecek toplam haber sayisi
 * @param {number} [params.section_limit] bolum basina azami haber
 * @param {object} [params.conn]          mevcut transaction baglantisi
 */
export async function generateReport(params = {}) {
  const conn = params.conn || await pool.getConnection();
  const ownConnection = !params.conn;

  try {
    const periodStart = toMysqlDate(params.period_start);
    const periodEnd = toMysqlDate(params.period_end);
    if (!periodStart || !periodEnd) {
      throw new Error('Geçersiz dönem aralığı');
    }

    const periodType = PERIOD_LABELS[params.period_type] ? params.period_type : 'haftalik';
    const totalLimit = clampInt(params.limit, DEFAULT_TOTAL_LIMIT, 1, 200);
    const sectionLimit = clampInt(params.section_limit, DEFAULT_SECTION_LIMIT, 1, 100);

    // 1) Donemdeki TEKILLESTIRILMIS haberler, onem sirasiyla.
    const [rows] = await conn.execute(
      `SELECT a.id, a.title, a.region, a.category, a.importance_score, a.importance_band, a.cluster_id,
              a.published_at, s.slug AS source_slug
         FROM articles a
         JOIN sources s ON s.id = a.source_id
        WHERE a.is_duplicate = 0
          AND a.published_at >= ?
          AND a.published_at < DATE_ADD(?, INTERVAL 1 DAY)
        ORDER BY a.importance_score DESC, a.published_at DESC, a.id ASC`,
      [`${periodStart} 00:00:00`, periodEnd],
    );

    // Donemin ham sayaclari (tekrarlar dahil) — ozet metninde kullanilacak.
    const [scanRows] = await conn.execute(
      `SELECT COUNT(*) AS scanned,
              SUM(CASE WHEN is_duplicate = 1 THEN 1 ELSE 0 END) AS duplicates,
              COUNT(DISTINCT cluster_id) AS clusters
         FROM articles
        WHERE published_at >= ? AND published_at < DATE_ADD(?, INTERVAL 1 DAY)`,
      [`${periodStart} 00:00:00`, periodEnd],
    );
    const scanned = Number(scanRows[0]?.scanned ?? 0);
    const duplicates = Number(scanRows[0]?.duplicates ?? 0);
    const clusterCount = Number(scanRows[0]?.clusters ?? 0);

    // 2) Bolgeye gore bolumlere ayir, her bolumden en onemlileri al.
    const bySection = new Map(SECTION_ORDER.map((k) => [k, []]));
    for (const row of rows) {
      const key = bySection.has(row.region) ? row.region : 'DIGER';
      const bucket = bySection.get(key);
      if (bucket.length < sectionLimit) bucket.push(row);
    }

    // 3) Toplam limiti asmadan, onem sirasini koruyarak duzlestir.
    const selected = [];
    for (const section of SECTION_ORDER) {
      for (const row of bySection.get(section) || []) {
        selected.push({ ...row, section });
      }
    }
    selected.sort((a, b) => Number(b.importance_score) - Number(a.importance_score));
    const items = selected.slice(0, totalLimit);

    // 4) Yonetici ozeti.
    const topTitles = items.slice(0, 5).map((r) => r.title);
    const executiveSummary = await buildExecutiveSummary({
      scanned, clusters: clusterCount, duplicates, topTitles,
      periodStart, periodEnd,
    });

    // 5) Istatistik JSON'u.
    const stats = buildStats({ rows, items, scanned, duplicates, clusterCount });

    const title = params.title
      || `İSO/İSOV ${PERIOD_LABELS[periodType]} — ${fmtDate(periodStart)} - ${fmtDate(periodEnd)}`;

    // 6) Upsert: ayni donem + tip icin tek rapor.
    const [existing] = await conn.execute(
      `SELECT id FROM reports
        WHERE period_start = ? AND period_end = ? AND period_type = ?
        ORDER BY id ASC LIMIT 1`,
      [periodStart, periodEnd, periodType],
    );

    let reportId;
    if (existing[0]) {
      reportId = existing[0].id;
      await conn.execute(
        `UPDATE reports SET title = ?, executive_summary = ?, stats = ? WHERE id = ?`,
        [title, executiveSummary, JSON.stringify(stats), reportId],
      );
      await conn.execute('DELETE FROM report_items WHERE report_id = ?', [reportId]);
    } else {
      const [ins] = await conn.execute(
        `INSERT INTO reports (title, period_start, period_end, period_type, executive_summary, stats)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [title, periodStart, periodEnd, periodType, executiveSummary, JSON.stringify(stats)],
      );
      reportId = ins.insertId;
    }

    for (let i = 0; i < items.length; i++) {
      await conn.execute(
        `INSERT INTO report_items (report_id, article_id, rank_order, section)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE rank_order = VALUES(rank_order), section = VALUES(section)`,
        [reportId, items[i].id, i + 1, items[i].section],
      );
    }

    return {
      id: Number(reportId),
      title,
      period_start: periodStart,
      period_end: periodEnd,
      period_type: periodType,
      executive_summary: executiveSummary,
      stats,
      item_count: items.length,
    };
  } finally {
    if (ownConnection) conn.release();
  }
}

function buildStats({ rows, items, scanned, duplicates, clusterCount }) {
  const byRegion = {};
  const byBand = { KRITIK: 0, YUKSEK: 0, ORTA: 0, DUSUK: 0 };
  const byCategory = {};
  const sources = new Set();

  for (const row of rows) {
    byRegion[row.region] = (byRegion[row.region] || 0) + 1;
    // Band artik yuzdelik tabanli ve korpus geneli hesaplaniyor; tek dogruluk
    // kaynagi DB'deki deger. Burada skordan yeniden turetmek YANLIS sonuc verir
    // (bandOf cutoffs olmadan her zaman DUSUK doner).
    if (row.importance_band in byBand) byBand[row.importance_band] += 1;
    if (row.category) byCategory[row.category] = (byCategory[row.category] || 0) + 1;
    if (row.source_slug) sources.add(row.source_slug);
  }

  const topCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([key, count]) => ({ key, count }));

  return {
    scanned,
    unique: rows.length,
    duplicates,
    clusters: clusterCount,
    dedup_ratio: scanned > 0 ? Number((duplicates / scanned).toFixed(4)) : 0,
    sources: sources.size,
    selected: items.length,
    by_region: byRegion,
    by_band: byBand,
    top_categories: topCategories,
    generated_at: new Date().toISOString(),
  };
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** Rapor satirini API sekline cevirir. */
export function serializeReportRow(row) {
  return {
    id: Number(row.id),
    title: row.title,
    period_start: toDateOnly(row.period_start),
    period_end: toDateOnly(row.period_end),
    period_type: row.period_type,
    executive_summary: row.executive_summary,
    stats: parseJsonColumn(row.stats, {}),
    created_at: toIso(row.created_at),
    item_count: row.item_count !== undefined ? Number(row.item_count) : undefined,
  };
}
