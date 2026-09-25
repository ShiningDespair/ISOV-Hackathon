// ---------------------------------------------------------------------
// POST /api/collect/run — toplama calistir (demo: idempotent)
//
// Demo ortaminda "toplama" = seed klasorunu yeniden oku + hatti calistir.
// url_hash zaten varsa makale atlandigi icin arka arkaya cagrilmasi
// veriyi bozmaz; sadece kumeler ve skorlar tazelenir.
// ---------------------------------------------------------------------
import { Router } from 'express';
import { requireRole } from '../middleware/session.js';
import { pool } from '../lib/db.js';
import { asyncHandler } from '../lib/http.js';
import { toIso } from '../lib/serialize.js';
import { ingestFromSeed, DEFAULT_SEED_DIR } from '../services/ingestService.js';
import { runPipeline } from '../services/pipeline.js';

const router = Router();

// YALNIZCA admin. Toplama tum kiracilarin paylastigi haber tablosuna
// YAZIYOR. Onceden yalnizca oturum isteniyordu, yani herhangi bir uye
// hesabi veri alimini tetikleyebiliyordu (persona testi sirasinda fark
// edildi, ayni sinifta /reports/generate de acikti).
router.post('/run', requireRole('admin'), asyncHandler(async (req, res) => {
  const startedAt = new Date();
  const conn = await pool.getConnection();

  // collection_runs kaydi transaction DISINDA acilir: hat ortasinda hata
  // olsa bile calisma izi kalsin (izlenebilirlik > atomiklik).
  const [runIns] = await conn.execute(
    `INSERT INTO collection_runs (started_at, trigger_type, notes)
     VALUES (?, 'manuel', ?)`,
    [startedAt, 'POST /api/collect/run'],
  );
  const runId = runIns.insertId;

  try {
    await conn.beginTransaction();

    const ingest = await ingestFromSeed(conn, { dir: DEFAULT_SEED_DIR });
    const pipeline = await runPipeline(conn);

    await conn.commit();

    await conn.execute(
      `UPDATE collection_runs
          SET finished_at = NOW(), fetched_count = ?, new_count = ?,
              duplicate_count = ?, error_count = ?, notes = ?
        WHERE id = ?`,
      [
        ingest.fetched,
        ingest.inserted,
        pipeline.duplicates,
        ingest.errors.length,
        JSON.stringify({
          seed_dir: ingest.dir,
          files: ingest.files,
          skipped: ingest.skipped,
          clusters: pipeline.clusters,
          scored: pipeline.updated,
        }).slice(0, 2000),
        runId,
      ],
    );

    res.json({
      run_id: Number(runId),
      started_at: toIso(startedAt),
      finished_at: new Date().toISOString(),
      seed_dir: ingest.dir,
      seed_missing: ingest.missing,
      fetched: ingest.fetched,
      inserted: ingest.inserted,
      skipped: ingest.skipped,
      clusters: pipeline.clusters,
      duplicates: pipeline.duplicates,
      scored: pipeline.updated,
      bands: pipeline.bands,
      errors: ingest.errors.slice(0, 20),
    });
  } catch (err) {
    try { await conn.rollback(); } catch { /* yoksay */ }
    await conn.execute(
      `UPDATE collection_runs SET finished_at = NOW(), error_count = 1, notes = ? WHERE id = ?`,
      [String(err.message).slice(0, 2000), runId],
    ).catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}));

export default router;
