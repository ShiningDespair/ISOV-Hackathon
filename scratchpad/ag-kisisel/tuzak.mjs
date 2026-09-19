import { pool, query } from '/srv/projects/hackathon/backend/src/lib/db.js';
import { runPipeline } from '/srv/projects/hackathon/backend/src/services/pipeline.js';
const rank = { DUSUK:0, ORTA:1, YUKSEK:2, KRITIK:3 };

async function bandSnapshot() {
  const r = await query('SELECT id, importance_band b FROM articles WHERE is_duplicate=0');
  return new Map(r.map(x=>[x.id,x.b]));
}
async function kos(etiket, opts) {
  const conn = await pool.getConnection();
  let out; try { out = await runPipeline(conn, opts); } finally { conn.release(); }
  return out;
}
// Korpus 2026-08/09 tarihli; bugun 2026-09-19 -> hepsi 7 gunden eski,
// recency SABIT 10. Tuzagi gorebilmek icin saati GERIYE alip recency'nin
// gercekten degistigi bir gune gidiyoruz.
const gun = (s) => new Date(`${s}T09:00:00+03:00`);
for (const d of ['2026-09-12','2026-09-14','2026-09-16']) {
  const once = await bandSnapshot();
  const out = await kos(d, { now: gun(d) });
  const sonra = await bandSnapshot();
  let up=0, down=0;
  for (const [id,b] of sonra) { const o=once.get(id); if(!o) continue; if(rank[b]>rank[o])up++; else if(rank[b]<rank[o])down++; }
  const rows = await query("SELECT COUNT(*) c FROM article_changes WHERE change_type='band-yukseldi'");
  console.log(`now=${d}: bant YUKARI kayan ${String(up).padStart(3)} / ASAGI kayan ${String(down).padStart(3)} haber`
    + ` -> naif dedektor ${up} olay yazardi; korumali dedektor ${out.changes['band-yukseldi']} yazdi (tablo toplami ${rows[0].c})`);
}
// GERCEK ZAMANA GERI DON: DB tutarsiz kalmasin.
const son = await kos('geri', {});
const rows = await query("SELECT change_type,COUNT(*) c FROM article_changes GROUP BY change_type");
console.log(`\ngercek zamana donuldu. bantlar ${JSON.stringify(son.bands)} | olaylar ${rows.map(r=>`${r.change_type}=${r.c}`).join(' ')}`);
await pool.end();
