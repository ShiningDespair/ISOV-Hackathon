// ---------------------------------------------------------------------
// BULTEN GONDERIM ISI
//
//   npm run send-digest -- --dry-run          (hicbir sey gondermez)
//   npm run send-digest -- --force            (saat/gun kontrolunu atla)
//   npm run send-digest -- --user=3,7         (yalnizca bu kullanicilar)
//   npm run send-digest -- --limit=50
//
// IS DESENI (src/jobs/fetch-images.js ile ayni sozlesme):
//   * Es zamanlilik siniri (DIGEST_CONCURRENCY, varsayilan 3)
//   * Konsola ozet basar
//   * ASLA COKMEZ: tek kullanicinin hatasi toplu isi dusurmez, surec
//     exitCode ile biter ve havuz/kaynaklar duzgun kapatilir.
//
// Ayni mantik POST /api/admin/digest/send ucundan da tetiklenebilir; bu
// yuzden is `digestService.runDigest()` icinde, CLI kismi dosyanin sonunda.
// ---------------------------------------------------------------------
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { pool } from '../lib/db.js';
import { runDigest } from '../services/digestService.js';
import { closeTransport, mailStatus } from '../services/mailService.js';
import { closeBrowser, pdfStatus } from '../services/pdfService.js';

/** Konsol ozeti — fetch-images.js printSummary'sinin kardesi. */
export function printSummary(ozet) {
  console.log('');
  console.log('--- BÜLTEN GÖNDERİM ÖZETİ -----------------------------------');
  console.log(`TRT zamanı         : ${ozet.trt} (gün ${ozet.weekday})`);
  console.log(`Mod                : ${ozet.dry_run ? 'DENEME (gönderim yok)' : 'gerçek gönderim'}${ozet.force ? ' + force' : ''}`);
  console.log(`Aday kullanıcı     : ${ozet.candidates}`);
  console.log(`Gönderilen         : ${ozet.sent}`);
  console.log(`Atlanan            : ${ozet.skipped}`);
  console.log(`Hata               : ${ozet.errors}`);
  console.log(`PDF eki eklenen    : ${ozet.pdf_attached}`);
  console.log(`Sıralama           : kişisel=${ozet.ranking?.kisisel ?? 0}  global=${ozet.ranking?.global ?? 0}`);
  if (Object.keys(ozet.reasons || {}).length) {
    console.log(`Sonuç dağılımı     : ${Object.entries(ozet.reasons).map(([k, v]) => `${k}=${v}`).join('  ')}`);
  }
  console.log(`Süre               : ${(ozet.duration_ms / 1000).toFixed(1)} sn`);
  if (ozet.error) console.log(`İŞ HATASI          : ${ozet.error}`);

  if (ozet.results?.length) {
    console.log('');
    console.log('Kullanıcı bazlı sonuç:');
    for (const r of ozet.results.slice(0, 50)) {
      const bayrak = r.ok ? 'OK ' : (r.reason === 'hata' ? 'HATA' : 'ATLA');
      console.log(`  ${bayrak}  #${String(r.user_id).padStart(4)}  ${String(r.email).padEnd(34)}`
        + `  ${String(r.item_count).padStart(2)} haber  ${r.reason}`
        + `${r.pdf ? `  pdf:${r.pdf}` : ''}${r.error ? `  — ${r.error}` : ''}`);
    }
    if (ozet.results.length > 50) console.log(`  ... ve ${ozet.results.length - 50} kayıt daha`);
  }
  console.log('-------------------------------------------------------------');
}

/** Kosum oncesi bagimlilik durumu — "neden gitmedi" sorusunu onceden yanitlar. */
export async function printPreflight() {
  const mail = await mailStatus();
  const pdf = pdfStatus();
  console.log('--- BAĞIMLILIK DURUMU ---------------------------------------');
  console.log(`SMTP     : ${mail.available ? 'hazır' : 'YOK'}`
    + `  kaynak=${mail.source ?? '-'}  sunucu=${mail.host ?? '-'}`
    + `${mail.error ? `  (${mail.error})` : ''}`);
  console.log(`Chromium : ${pdf.available ? 'hazır' : 'YOK'}  yol=${pdf.chromium_path ?? '-'}`);
  console.log('-------------------------------------------------------------');
}

// --- CLI ---------------------------------------------------------------
const calistirilanDosya = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === calistirilanDosya) {
  const argv = process.argv.slice(2);
  const deger = (ad) => {
    const bulunan = argv.find((a) => a.startsWith(`--${ad}=`));
    return bulunan ? bulunan.split('=').slice(1).join('=') : null;
  };

  const dryRun = argv.includes('--dry-run') || argv.includes('--deneme');
  const force = argv.includes('--force') || argv.includes('--zorla');
  const limitArg = deger('limit');
  const userArg = deger('user') || deger('kullanici');
  const userIds = userArg
    ? userArg.split(',').map((x) => Number(x.trim())).filter(Number.isFinite)
    : null;

  (async () => {
    await printPreflight();
    const ozet = await runDigest({
      dryRun,
      force,
      userIds,
      limit: limitArg ? Number(limitArg) : undefined,
    });
    printSummary(ozet);
    if (ozet.errors > 0) process.exitCode = 1;
  })()
    .catch((err) => {
      // runDigest zaten yutuyor; buraya ancak preflight hatasi duser.
      console.error('[bulten] is basarisiz:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      closeTransport();
      await closeBrowser('is bitti');
      try { await pool.end(); } catch { /* yoksay */ }
    });
}

export default { printSummary, printPreflight };
