// ---------------------------------------------------------------------
// TOPLU GORSEL TOPLAMA ISI
//
//   npm run images                    (varsayilan limit: 200)
//   IMAGE_FETCH_LIMIT=50 npm run images
//
// Ayni is POST /api/articles/fetch-images ucundan da tetiklenir; bu yuzden
// mantik `runFetchImages()` icinde, CLI kismi dosyanin sonunda duruyor.
//
// NAZIKLIK SOZLESMESI (kaynak sitelerini yormamak icin):
//   * En fazla IMAGE_FETCH_CONCURRENCY (6) es zamanli istek — GENEL sinir.
//   * Ayni host'a saniyede en fazla IMAGE_HOST_RATE_PER_SEC (2) istek.
//     Resmî Gazete gibi tek host'ta yigilan kaynaklarda bu sinir olmadan
//     20 istek ayni saniyede gidip sunucuyu gereksiz yere zorlardi.
// Her haber DENENDI olarak isaretlenir (image_checked_at = NOW()); boylece
// basarisiz URL'ler her kosumda bastan denenmez.
// ---------------------------------------------------------------------
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { pool, query } from '../lib/db.js';
import { fetchArticleImage } from '../services/imageService.js';

export const DEFAULT_LIMIT = Number(process.env.IMAGE_FETCH_LIMIT || 200);
export const CONCURRENCY = Math.max(1, Number(process.env.IMAGE_FETCH_CONCURRENCY || 6));
export const HOST_RATE_PER_SEC = Math.max(1, Number(process.env.IMAGE_HOST_RATE_PER_SEC || 2));

const bekle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** URL'nin host'u; ayristirilamazsa sabit bir kova adi. */
function hostOf(url) {
  try { return new URL(url).host.toLowerCase(); } catch { return '(gecersiz)'; }
}

/**
 * Host basina hiz sinirlayici.
 * Her host icin "en erken bir sonraki istek zamani" tutulur; cagiran
 * o zamana kadar bekler. HOST_RATE_PER_SEC=2 -> host basina 500 ms aralik.
 */
function createHostLimiter(perSecond) {
  const araMs = Math.ceil(1000 / perSecond);
  const sonraki = new Map();
  return async function slotAl(host) {
    const simdi = Date.now();
    const musait = Math.max(simdi, sonraki.get(host) || 0);
    sonraki.set(host, musait + araMs);
    const gecikme = musait - simdi;
    if (gecikme > 0) await bekle(gecikme);
  };
}

/**
 * Eksik gorselleri toplar.
 *
 * @param {object}  [opts]
 * @param {number}  [opts.limit]        kac haber denenecek
 * @param {boolean} [opts.retryFailed]  true ise daha once denenip bulunamayanlar da tekrar denenir
 * @returns {Promise<object>} ozet nesnesi (HTTP ucu da bunu dondurur)
 */
export async function runFetchImages({ limit = DEFAULT_LIMIT, retryFailed = false } = {}) {
  const basladi = Date.now();
  const kayitSayisi = Math.max(1, Math.min(1000, Number(limit) || DEFAULT_LIMIT));

  // Yalnizca hic denenmemis haberler (image_checked_at IS NULL).
  // retryFailed ile gorseli olmayan ama denenmis olanlar da kapsama girer.
  const kosul = retryFailed
    ? '(a.image_checked_at IS NULL OR a.image_url IS NULL)'
    : 'a.image_checked_at IS NULL';

  const rows = await query(
    `SELECT a.id, a.url, s.slug AS source_slug, s.name AS source_name
       FROM articles a
       JOIN sources s ON s.id = a.source_id
      WHERE ${kosul}
      ORDER BY a.published_at DESC, a.id DESC
      LIMIT ${kayitSayisi}`,
  );

  const ozet = {
    attempted: 0,
    found: 0,
    not_found: 0,
    errors: 0,
    by_source_type: {},
    limit: kayitSayisi,
    concurrency: CONCURRENCY,
    host_rate_per_sec: HOST_RATE_PER_SEC,
  };

  if (rows.length === 0) {
    return {
      ...ozet,
      candidates: 0,
      failing_hosts: 0,
      failing_host_list: [],
      top_sources: [],
      duration_ms: Date.now() - basladi,
    };
  }

  const slotAl = createHostLimiter(HOST_RATE_PER_SEC);
  const kaynakSayac = new Map();   // source_slug -> {name, found, attempted}
  const hataliHostlar = new Map(); // host -> {count, ornek}
  const kaynakTuru = new Map();    // image_source -> adet

  let sira = 0;
  async function isci() {
    for (;;) {
      const index = sira;
      sira += 1;
      if (index >= rows.length) return;
      const row = rows[index];

      const host = hostOf(row.url);
      await slotAl(host);

      const sonuc = await fetchArticleImage(row.url); // hata firlatmaz
      ozet.attempted += 1;

      const sayac = kaynakSayac.get(row.source_slug)
        || { name: row.source_name, found: 0, attempted: 0 };
      sayac.attempted += 1;

      if (sonuc.image_url) {
        ozet.found += 1;
        sayac.found += 1;
        kaynakTuru.set(sonuc.image_source, (kaynakTuru.get(sonuc.image_source) || 0) + 1);
      } else {
        ozet.not_found += 1;
        if (sonuc.error) {
          ozet.errors += 1;
          const h = hataliHostlar.get(host) || { count: 0, ornek: sonuc.error };
          h.count += 1;
          hataliHostlar.set(host, h);
        }
      }
      kaynakSayac.set(row.source_slug, sayac);

      // DB'ye yaz: bulunduysa URL + kaynak, bulunamadiysa 'yok'.
      // image_checked_at her durumda tazelenir.
      try {
        await query(
          `UPDATE articles
              SET image_url = ?, image_source = ?, image_checked_at = NOW()
            WHERE id = ?`,
          [sonuc.image_url, sonuc.image_url ? sonuc.image_source : 'yok', row.id],
        );
      } catch (err) {
        // DB yazma hatasi tum isi dusurmesin; sayacta hata olarak gorunur.
        console.error(`[images] ${row.id} guncellenemedi: ${err.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, isci));

  const topSources = [...kaynakSayac.entries()]
    .map(([slug, v]) => ({ slug, name: v.name, found: v.found, attempted: v.attempted }))
    .filter((x) => x.found > 0)
    .sort((a, b) => b.found - a.found || a.slug.localeCompare(b.slug, 'tr'))
    .slice(0, 5);

  const failingHostList = [...hataliHostlar.entries()]
    .map(([host, v]) => ({ host, count: v.count, ornek: v.ornek }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  ozet.by_source_type = Object.fromEntries(kaynakTuru);

  return {
    ...ozet,
    candidates: rows.length,
    failing_hosts: hataliHostlar.size,
    failing_host_list: failingHostList,
    top_sources: topSources,
    duration_ms: Date.now() - basladi,
  };
}

/** Konsol ozeti — CLI kosumunda basilir. */
export function printSummary(ozet) {
  const oran = ozet.attempted ? ((ozet.found / ozet.attempted) * 100).toFixed(1) : '0,0';
  console.log('');
  console.log('--- GÖRSEL TOPLAMA ÖZETİ ------------------------------------');
  console.log(`Denenen haber      : ${ozet.attempted}`);
  console.log(`Görsel bulunan     : ${ozet.found}  (%${String(oran).replace('.', ',')})`);
  console.log(`Görsel bulunamayan : ${ozet.not_found}`);
  console.log(`Hata veren istek   : ${ozet.errors}`);
  console.log(`Hata veren host    : ${ozet.failing_hosts}`);
  if (Object.keys(ozet.by_source_type || {}).length) {
    const dagilim = Object.entries(ozet.by_source_type)
      .map(([k, v]) => `${k}=${v}`).join('  ');
    console.log(`Görsel kaynağı     : ${dagilim}`);
  }
  console.log(`Süre               : ${(ozet.duration_ms / 1000).toFixed(1)} sn`);

  if (ozet.top_sources?.length) {
    console.log('');
    console.log('En çok görsel veren 5 kaynak:');
    for (const s of ozet.top_sources) {
      console.log(`  ${String(s.found).padStart(3)} / ${String(s.attempted).padEnd(3)}  ${s.name} (${s.slug})`);
    }
  }
  if (ozet.failing_host_list?.length) {
    console.log('');
    console.log('Hata veren host\'lar:');
    for (const h of ozet.failing_host_list) {
      console.log(`  ${String(h.count).padStart(3)}  ${h.host}  — ${h.ornek}`);
    }
  }
  console.log('-------------------------------------------------------------');
}

// --- CLI ---------------------------------------------------------------
// `node src/jobs/fetch-images.js` ile dogrudan cagrildiginda calisir;
// route'tan import edildiginde calismaz.
const calistirilanDosya = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === calistirilanDosya) {
  const argLimit = process.argv.find((a) => a.startsWith('--limit='));
  const limit = argLimit ? Number(argLimit.split('=')[1]) : DEFAULT_LIMIT;
  const retryFailed = process.argv.includes('--retry-failed');

  runFetchImages({ limit, retryFailed })
    .then((ozet) => { printSummary(ozet); })
    .catch((err) => { console.error('[images] is basarisiz:', err); process.exitCode = 1; })
    .finally(async () => { try { await pool.end(); } catch { /* yoksay */ } });
}

export default { runFetchImages, printSummary };
