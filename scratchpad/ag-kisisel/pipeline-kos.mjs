import { pool, query } from '/srv/projects/hackathon/backend/src/lib/db.js';
import { runPipeline } from '/srv/projects/hackathon/backend/src/services/pipeline.js';

const before = await query('SELECT COUNT(*) c FROM article_changes');
const beforeT = await query('SELECT COUNT(*) c FROM topic_threads');
const conn = await pool.getConnection();
const t0 = Date.now();
try {
  const out = await runPipeline(conn);
  console.log(JSON.stringify({
    refreshed: out.refreshed, clusters: out.clusters, duplicates: out.duplicates,
    multiSource: out.multiSource, updated: out.updated, bands: out.bands,
    semantic: out.semantic, changes: out.changes,
  }, null, 2));
} finally { conn.release(); }
const after = await query('SELECT COUNT(*) c FROM article_changes');
const afterT = await query('SELECT COUNT(*) c FROM topic_threads');
console.log(`sure ${Date.now() - t0} ms | article_changes ${before[0].c} -> ${after[0].c} | topic_threads ${beforeT[0].c} -> ${afterT[0].c}`);
await pool.end();
