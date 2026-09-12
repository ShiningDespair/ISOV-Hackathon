#!/usr/bin/env node
// ---------------------------------------------------------------------
// SEEDER — `npm run seed`
//
// seed/*.json -> sources/tags upsert -> articles insert (url_hash ile
// idempotent) -> kumeleme -> onem skoru -> collection_runs -> haftalik rapor.
//
// IDEMPOTENT: iki kez calistirildiginda yeni kayit eklenmez, kume
// anahtarlari ayni kalir, skorlar ayni sonuca yakinsar.
// ---------------------------------------------------------------------
import 'dotenv/config';
import { pool, closePool } from '../lib/db.js';
import { toMysqlDate } from '../lib/http.js';
import {
  DEFAULT_SEED_DIR, ingestFromSeed, readSeedFiles,
} from '../services/ingestService.js';
import { runPipeline } from '../services/pipeline.js';
import { generateReport } from '../services/reportService.js';
import { isAvailable as llmAvailable } from '../services/llm.js';

// Proje bastan sona TRT varsayar (docker-compose: TZ=Europe/Istanbul).
// Ortamda TZ tanimli degilse de ayni davranalim; aksi halde gun bazli
// filtreler ve rapor donemleri UTC sunucuda bir gun kayar.
process.env.TZ = process.env.TZ || 'Europe/Istanbul';

const SEED_DIR = process.argv[2] || DEFAULT_SEED_DIR;

/** Kullaniciya duzgun mesaj basip cikar — stack trace ile korkutma. */
function fail(message, hint) {
  console.error(`\n  HATA: ${message}`);
  if (hint) console.error(`  ${hint}`);
  console.error('');
  return 1;
}

function line(char = '-') {
  return char.repeat(62);
}

async function main() {
  console.log(`\n${line('=')}`);
  console.log('  ISOV SEEDER');
  console.log(`  Kaynak klasor : ${SEED_DIR}`);
  console.log(`  LLM anahtari  : ${llmAvailable() ? 'var (Claude)' : 'yok (heuristik mod)'}`);
  console.log(line('='));

  // 1) On kontrol: klasor ve dosyalar gercekten var mi?
  const probe = await readSeedFiles(SEED_DIR);
  if (probe.missing) {
    return fail(
      `Seed klasoru bulunamadi: ${SEED_DIR}`,
      'Toplama ajanlari JSON dosyalarini bu klasore yazmali. SEED_DIR ile yol verebilirsiniz.',
    );
  }
  if (probe.files.length === 0) {
    const detail = probe.errors?.length
      ? `Okunamayan dosyalar: ${probe.errors.map((e) => e.file).join(', ')}`
      : 'Klasorde hic .json dosyasi yok.';
    return fail(`Seed klasoru bos: ${SEED_DIR}`, detail);
  }

  console.log(`\n  ${probe.files.length} dosya bulundu:`);
  for (const f of probe.files) {
    const p = f.payload || {};
    console.log(`    - ${f.file}  (kaynak: ${(p.sources || []).length}, haber: ${(p.articles || []).length})`);
  }

  // 2) Veritabani erisimi
  const conn = await pool.getConnection();
  const startedAt = new Date();
  let runId = null;

  try {
    const [runIns] = await conn.execute(
      `INSERT INTO collection_runs (started_at, trigger_type, notes) VALUES (?, 'seed', ?)`,
      [startedAt, `seed: ${SEED_DIR}`],
    );
    runId = runIns.insertId;

    await conn.beginTransaction();

    // 3) Alim
    console.log('\n  [1/4] Kaynaklar, etiketler ve haberler yaziliyor...');
    const ingest = await ingestFromSeed(conn, { dir: SEED_DIR });

    // 4) Kumeleme + skorlama (SIRA ONEMLI: corroboration kumeden gelir)
    console.log('  [2/4] Tekillestirme kumeleri kuruluyor...');
    console.log('  [3/4] Onem skorlari hesaplaniyor...');
    const pipeline = await runPipeline(conn);

    await conn.commit();

    // 5) Calisma kaydini kapat
    await conn.execute(
      `UPDATE collection_runs
          SET finished_at = NOW(), fetched_count = ?, new_count = ?,
              duplicate_count = ?, error_count = ?, notes = ?
        WHERE id = ?`,
      [
        ingest.fetched, ingest.inserted, pipeline.duplicates, ingest.errors.length,
        JSON.stringify({
          seed_dir: ingest.dir,
          files: ingest.files,
          skipped: ingest.skipped,
          clusters: pipeline.clusters,
        }).slice(0, 2000),
        runId,
      ],
    );

    // 6) Son 7 gunluk haftalik rapor
    console.log('  [4/4] Haftalik rapor uretiliyor...');
    const end = new Date();
    const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
    const report = await generateReport({
      period_start: toMysqlDate(start),
      period_end: toMysqlDate(end),
      period_type: 'haftalik',
    });

    // 7) Ozet — DB'den okunan gercek sayilar
    const [[counts]] = await conn.query(
      `SELECT
         (SELECT COUNT(*) FROM sources)  AS sources,
         (SELECT COUNT(*) FROM tags)     AS tags,
         (SELECT COUNT(*) FROM articles) AS articles,
         (SELECT COUNT(*) FROM articles WHERE is_duplicate = 1) AS duplicates,
         (SELECT COUNT(*) FROM clusters) AS clusters,
         (SELECT COUNT(*) FROM clusters WHERE member_count > 1) AS multi_clusters`,
    );
    const [bandRows] = await conn.query(
      `SELECT importance_band, COUNT(*) AS cnt FROM articles
        WHERE is_duplicate = 0 GROUP BY importance_band`,
    );
    const bands = { KRITIK: 0, YUKSEK: 0, ORTA: 0, DUSUK: 0 };
    for (const r of bandRows) bands[r.importance_band] = Number(r.cnt);

    const total = Number(counts.articles);
    const dupRatio = total > 0 ? ((Number(counts.duplicates) / total) * 100).toFixed(1) : '0.0';

    console.log(`\n${line('=')}`);
    console.log('  SEED TAMAMLANDI');
    console.log(line('-'));
    console.log(`  Okunan dosya        : ${ingest.files}`);
    console.log(`  Kaynak (sources)    : ${counts.sources}`);
    console.log(`  Etiket (tags)       : ${counts.tags}`);
    console.log(`  Gelen haber         : ${ingest.fetched}`);
    console.log(`    yeni eklenen      : ${ingest.inserted}`);
    console.log(`    zaten vardi       : ${ingest.skipped}   (idempotent atlama)`);
    console.log(`  Toplam haber        : ${counts.articles}`);
    console.log(`  Kume (clusters)     : ${counts.clusters}  (cok kaynakli: ${counts.multi_clusters})`);
    console.log(`  Elenen tekrar       : ${counts.duplicates}  (%${dupRatio})`);
    console.log(line('-'));
    console.log('  Band dagilimi (tekillestirilmis):');
    console.log(`    KRITIK  : ${bands.KRITIK}`);
    console.log(`    YUKSEK  : ${bands.YUKSEK}`);
    console.log(`    ORTA    : ${bands.ORTA}`);
    console.log(`    DUSUK   : ${bands.DUSUK}`);
    console.log(line('-'));
    console.log(`  Rapor #${report.id}: ${report.title}`);
    console.log(`    kalem sayisi      : ${report.item_count}`);
    console.log(`  collection_runs #${runId}`);

    if (ingest.errors.length) {
      console.log(line('-'));
      console.log(`  UYARI: ${ingest.errors.length} kayit islenemedi:`);
      for (const e of ingest.errors.slice(0, 10)) {
        console.log(`    - ${e.file || ''} ${e.url || ''}: ${e.message}`);
      }
    }
    console.log(`${line('=')}\n`);

    return 0;
  } catch (err) {
    try { await conn.rollback(); } catch { /* yoksay */ }
    if (runId) {
      await conn.execute(
        'UPDATE collection_runs SET finished_at = NOW(), error_count = 1, notes = ? WHERE id = ?',
        [String(err.message).slice(0, 2000), runId],
      ).catch(() => {});
    }
    return fail(
      `Seed sirasinda hata: ${err.message}`,
      'Veritabani ayaga kalkti mi ve .env degerleri dogru mu kontrol edin.',
    );
  } finally {
    conn.release();
  }
}

main()
  .then(async (code) => {
    await closePool().catch(() => {});
    process.exit(code ?? 0);
  })
  .catch(async (err) => {
    // Buraya dusmemeli; yine de stack yerine okunakli mesaj basiyoruz.
    console.error(`\n  BEKLENMEYEN HATA: ${err?.message || err}\n`);
    if (process.env.NODE_ENV !== 'production') console.error(err);
    await closePool().catch(() => {});
    process.exit(1);
  });
