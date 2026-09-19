import { pool, query } from '/srv/projects/hackathon/backend/src/lib/db.js';
import { runPipeline } from '/srv/projects/hackathon/backend/src/services/pipeline.js';
async function kos(etiket, opts = {}) {
  const conn = await pool.getConnection();
  let out; try { out = await runPipeline(conn, opts); } finally { conn.release(); }
  const byType = await query('SELECT change_type,COUNT(*) c FROM article_changes GROUP BY change_type ORDER BY change_type');
  console.log(`${etiket}\n  yeni olaylar: ${JSON.stringify({...out.changes, threads:undefined, incelendi:undefined, skipped:undefined})}`);
  console.log(`  bantlar: ${JSON.stringify(out.bands)}  |  toplam: ${byType.map(r=>`${r.change_type}=${r.c}`).join(' ')}`);
}
await kos('A) ozetler yeni dolduruldu -> ozet-guncellendi beklenir');
await kos('B) ayni kosum tekrar -> 0 beklenir');
// TUZAK TESTI: takvim 5 gun ilerlesin. recency her skoru degistirir, bant
// yuzdelik tabanli oldugu icin bantlar KAYAR. Naif dedektor burada 115
// haberin tamaminda tetiklenirdi.
const ileri = new Date(Date.now() + 5 * 86400000);
await kos(`C) TUZAK TESTI: now = ${ileri.toISOString().slice(0,10)} (+5 gun) -> band-yukseldi 0 beklenir`, { now: ileri });
const yukselen = await query("SELECT article_id, detail FROM article_changes WHERE change_type='band-yukseldi'");
console.log(`  band-yukseldi satiri: ${yukselen.length}`);
// Karsilastirma: ayni kosumda KAC haberin BANDI yukari kaydi (naif dedektorun
// tetiklenecegi sayi)?
const snap = await query(`SELECT a.id, a.importance_band band,
    JSON_UNQUOTE(JSON_EXTRACT(ac.detail,'$.band')) ilk
  FROM articles a JOIN article_changes ac ON ac.article_id=a.id AND ac.change_type='yeni'
  WHERE a.is_duplicate=0`);
const rank = { DUSUK:0, ORTA:1, YUKSEK:2, KRITIK:3 };
const naif = snap.filter(r => rank[r.band] > rank[r.ilk]).length;
const dusen = snap.filter(r => rank[r.band] < rank[r.ilk]).length;
console.log(`  KARSILASTIRMA: bandi yukari kayan haber ${naif}, asagi kayan ${dusen} -> naif "bant degisti" dedektoru ${naif} olay yazardi; cekirdek-skor korumasi 0 yazdi.`);
await pool.end();
