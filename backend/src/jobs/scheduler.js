// ---------------------------------------------------------------------
// BULTEN ZAMANLAYICISI — AYRI SUREC
//
//   npm run scheduler
//
// NEDEN AYRI SUREC, server.js'e tek satir DEGIL:
//   server.js baska bir ajanin dosyasi (kimlik dogrulama katmani). Ayni
//   dosyayi iki ajanin duzenlemesi catisma uretir. Ayri surec ayrica
//   operasyonel olarak da daha iyi: zamanlayiciyi yeniden baslatmak API'yi
//   kesintiye ugratmaz ve `docker compose logs` ciktilari karismaz.
//
// NEDEN CRON DEGIL:
//   Tek konteyner icin cron (veya node-cron gibi bir paket) gereksiz. Basit
//   bir `setInterval` DAKIKADA BIR kontrol ediyor; TRT saati bir
//   kullanicinin `send_hour` degerine esitse o kullaniciya bulten gider.
//   "Bugun gonderildi mi" sorusunun cevabi email_log'da (+ uq_email_once
//   sema kisiti), yani zamanlayici durum TUTMUYOR — iki kez tetiklenmesi
//   ikinci bir e-posta uretmiyor. Cron eklemek bir bagimlilik ve bir
//   yapilandirma dosyasi daha demekti, kazanci yoktu.
//
// VARSAYILAN KAPALI — DIGEST_SCHEDULER_ENABLED:
//   Demo sirasinda istenmeyen gonderim olmasin. Env tanimli DEGILSE ya da
//   'true' DEGILSE surec neden kapali oldugunu soyleyip 0 ile cikar.
//   Acmak icin: DIGEST_SCHEDULER_ENABLED=true
// ---------------------------------------------------------------------
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { pingDb, pool } from '../lib/db.js';
import { runDigest, trtNow } from '../services/digestService.js';
import { closeTransport, mailStatus } from '../services/mailService.js';
import { closeBrowser } from '../services/pdfService.js';

process.env.TZ = process.env.TZ || 'Europe/Istanbul';

/** Kontrol araligi (ms). Dakikada bir yeterli: en kucuk zamanlama birimi saat. */
export const TICK_MS = Math.max(10_000, Number(process.env.DIGEST_TICK_MS || 60_000));

/** Zamanlayici acik mi? TEK DOGRULUK NOKTASI — varsayilan KAPALI. */
export function isSchedulerEnabled() {
  return String(process.env.DIGEST_SCHEDULER_ENABLED || '').toLowerCase() === 'true';
}

/** Zamanlayici durumu — tani ve testler icin. */
export function schedulerStatus() {
  return {
    enabled: isSchedulerEnabled(),
    tick_ms: TICK_MS,
    env_value: process.env.DIGEST_SCHEDULER_ENABLED ?? null,
    default: 'kapali',
  };
}

let running = false;   // ayni anda iki kosum olmasin
let timer = null;
let stopping = false;

/**
 * Bir tur: su anki TRT saatine denk gelen kullanicilara bulten gonderir.
 * ASLA THROW ETMEZ — zamanlayici tek bir hatali turda olmemeli.
 */
export async function tick({ now = new Date() } = {}) {
  if (running) {
    // Onceki tur hala suruyor (buyuk gonderim). Bu turu atla; bir sonraki
    // dakikada yine denenecek ve email_log tekrari engelliyor.
    return { skipped: true, reason: 'onceki-tur-suruyor' };
  }
  running = true;
  try {
    const ozet = await runDigest({ now });
    if (ozet.candidates > 0 || ozet.error) {
      const t = trtNow(now);
      console.log(`[scheduler] ${t.date} ${String(t.hour).padStart(2, '0')}:`
        + `${String(t.minute).padStart(2, '0')} — aday=${ozet.candidates} `
        + `gonderilen=${ozet.sent} atlanan=${ozet.skipped} hata=${ozet.errors}`
        + (ozet.error ? ` IS-HATASI=${ozet.error}` : ''));
    }
    return ozet;
  } catch (err) {
    console.error('[scheduler] tur basarisiz:', err.message);
    return { error: err.message };
  } finally {
    running = false;
  }
}

/** Zamanlayiciyi baslatir. Kapaliysa hicbir sey yapmaz ve false doner. */
export function startScheduler() {
  if (!isSchedulerEnabled()) return false;
  if (timer) return true;
  timer = setInterval(() => { tick(); }, TICK_MS);
  return true;
}

export function stopScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}

// --- CLI ---------------------------------------------------------------
const calistirilanDosya = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === calistirilanDosya) {
  (async () => {
    const durum = schedulerStatus();

    if (!durum.enabled) {
      console.log('--- BÜLTEN ZAMANLAYICISI ------------------------------------');
      console.log('Durum : KAPALI (varsayılan)');
      console.log(`DIGEST_SCHEDULER_ENABLED = ${durum.env_value === null ? '(tanımsız)' : `"${durum.env_value}"`}`);
      console.log('');
      console.log('Demo sırasında istenmeyen e-posta gönderimi olmasın diye');
      console.log('zamanlayıcı VARSAYILAN OLARAK KAPALIDIR. Açmak için:');
      console.log('  DIGEST_SCHEDULER_ENABLED=true npm run scheduler');
      console.log('');
      console.log('Tek seferlik elle gönderim (zamanlayıcı gerekmez):');
      console.log('  npm run send-digest -- --dry-run');
      console.log('-------------------------------------------------------------');
      process.exitCode = 0;
      try { await pool.end(); } catch { /* yoksay */ }
      return;
    }

    const db = await pingDb();
    const mail = await mailStatus();
    console.log('--- BÜLTEN ZAMANLAYICISI ------------------------------------');
    console.log(`Durum      : AÇIK — her ${(TICK_MS / 1000).toFixed(0)} sn kontrol`);
    console.log(`Veritabanı : ${db ? 'ok' : 'ERİŞİLEMEDİ'}`);
    console.log(`SMTP       : ${mail.available ? 'hazır' : `YOK (${mail.error || 'yapılandırılmadı'})`}`);
    console.log('TRT saatine göre send_hour eşleşen kullanıcılara bülten gönderilir.');
    console.log('-------------------------------------------------------------');

    startScheduler();
    // Ilk turu hemen kosmak YANLIS olurdu: sureci yeniden baslatmak
    // gonderim tetiklemesin. Ilk kontrol bir tick sonra.

    const kapat = async (signal) => {
      if (stopping) return;
      stopping = true;
      console.log(`[scheduler] ${signal} alindi, kapaniyor...`);
      stopScheduler();
      closeTransport();
      await closeBrowser('kapanis');
      try { await pool.end(); } catch { /* yoksay */ }
      process.exit(0);
    };
    process.on('SIGTERM', () => kapat('SIGTERM'));
    process.on('SIGINT', () => kapat('SIGINT'));
    process.on('unhandledRejection', (reason) => console.error('[scheduler] unhandledRejection:', reason));
  })().catch((err) => {
    console.error('[scheduler] baslatilamadi:', err);
    process.exitCode = 1;
  });
}

export default { isSchedulerEnabled, schedulerStatus, startScheduler, stopScheduler, tick, TICK_MS };
