// SIKILASTIRMA SONRASI DOSYA TESPITI — ELLE INCELEME DOKUMU
import { pool, query } from '/srv/projects/hackathon/backend/src/lib/db.js';
import { runPipeline } from '/srv/projects/hackathon/backend/src/services/pipeline.js';

const c1 = await query('SELECT COUNT(*) c FROM article_changes');
const conn = await pool.getConnection();
let out;
try { out = await runPipeline(conn); } finally { conn.release(); }
console.log('THREAD ISTATISTIK:', JSON.stringify(out.changes.threads, null, 2));
console.log('DEGISIKLIK:', JSON.stringify({ ...out.changes, threads: undefined }));
const c2 = await query('SELECT COUNT(*) c FROM article_changes');
console.log(`article_changes ${c1[0].c} -> ${c2[0].c}`);

const threads = await query(`SELECT id,thread_key,label,kind,anchor_tag_slug,ref_code,member_count,is_confirmed FROM topic_threads ORDER BY id`);
for (const t of threads) {
  console.log(`\n### DOSYA #${t.id} [${t.kind}] kimlik=${t.ref_code || t.anchor_tag_slug} uye=${t.member_count} onayli=${t.is_confirmed}`);
  console.log(`    etiket: ${t.label}`);
  const items = await query(`SELECT tti.article_id,tti.similarity,tti.prev_article_id,tti.join_reason,a.title,a.published_at,s.slug src
    FROM topic_thread_items tti JOIN articles a ON a.id=tti.article_id JOIN sources s ON s.id=a.source_id
    WHERE tti.thread_id=? ORDER BY a.published_at ASC`, [t.id]);
  for (const it of items) console.log(`    #${it.article_id} [${it.src}] ${new Date(it.published_at).toISOString().slice(0,10)} kos=${it.similarity ?? '-'} onc=${it.prev_article_id ?? '-'} (${it.join_reason}) ${String(it.title).slice(0,80)}`);
}
const ev = await query(`SELECT ac.article_id, ac.thread_id, JSON_EXTRACT(ac.detail,'$.prev_article_id') prev FROM article_changes ac WHERE ac.change_type='dosya-gelismesi' ORDER BY ac.id`);
console.log(`\ndosya-gelismesi olaylari: ${ev.length}`);
for (const e of ev) console.log(`   dosya#${e.thread_id}: #${e.prev} -> #${e.article_id}`);
await pool.end();
