import { pool, query } from '/srv/projects/hackathon/backend/src/lib/db.js';
import { refCodesOf } from '/srv/projects/hackathon/backend/src/lib/refCodes.js';
const rows = await query('SELECT id,title,summary,body FROM articles WHERE is_duplicate=0');
const df = new Map();
for (const r of rows) for (const c of refCodesOf(r)) {
  if (!df.has(c)) df.set(c, []);
  df.get(c).push(r.id);
}
const sorted = [...df.entries()].sort((a,b)=>b[1].length-a[1].length);
console.log(`toplam ${rows.length} haber, ${sorted.length} tekil kod, kodu olan haber sayisi: ${new Set(sorted.flatMap(([,v])=>v)).size}`);
for (const [c,v] of sorted) console.log(`${String(v.length).padStart(3)}  ${c.padEnd(16)} ${v.slice(0,12).join(',')}`);
await pool.end();
