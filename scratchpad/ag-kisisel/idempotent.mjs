import { pool, query } from '/srv/projects/hackathon/backend/src/lib/db.js';
import { runPipeline } from '/srv/projects/hackathon/backend/src/services/pipeline.js';
async function kos(etiket) {
  const conn = await pool.getConnection();
  let out; try { out = await runPipeline(conn); } finally { conn.release(); }
  const c = await query('SELECT COUNT(*) c FROM article_changes');
  const t = await query('SELECT COUNT(*) c FROM topic_threads');
  const i = await query('SELECT COUNT(*) c FROM topic_thread_items');
  const byType = await query('SELECT change_type,COUNT(*) c FROM article_changes GROUP BY change_type ORDER BY change_type');
  console.log(`${etiket}: article_changes=${c[0].c} topic_threads=${t[0].c} items=${i[0].c} yeni_eklenen=${JSON.stringify({...out.changes, threads:undefined, incelendi:undefined, skipped:undefined})}`);
  console.log(`   tur dagilimi: ${byType.map(r=>`${r.change_type}=${r.c}`).join(' ')}`);
  return Number(c[0].c);
}
const a = await kos('KOSUM-1');
const b = await kos('KOSUM-2');
console.log(a === b ? `IDEMPOTENT: satir sayisi ARTMADI (${a} = ${b})` : `HATA: ${a} -> ${b} ARTTI`);
await pool.end();
