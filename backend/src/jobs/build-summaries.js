// ---------------------------------------------------------------------
// OZET KADEMELERINI DOLDURMA ISI (HEURISTIK)
//
//   npm run summaries
//   SUMMARY_BUILD_LIMIT=50 npm run summaries
//
// NE YAPAR: `articles.summary_short` (2 dk kademesi, tek cumle <=150
// karakter) ve `summary_medium` (5 dk kademesi, satir basina bir madde)
// kolonlarini MEVCUT ALANLARDAN doldurur. `summary_source='heuristik'`.
//
// METIN URETMEZ. Secim yapar: summary'nin ilk cumlesi ile key_points[0]'dan
// kisa olani (lib/summarize.js leadSentence), maddeler key_points[0..2].
// Anahtar geldiginde bir LLM isi ayni kolonlari ezer ve
// `summary_source='llm'` yazar; OKUMA YOLU DEGISMEZ (COALESCE).
//
// IDEMPOTENT ve DETERMINISTIK: ayni girdiden ayni cikti. Zaten dogru degeri
// tasiyan satir YAZILMAZ (UPDATE sayisi ikinci kosumda 0).
//
// KORUMA: `summary_source='llm'` satirlar EZILMEZ. Heuristik bir isin,
// gercek ozetleme sonucunu geri sarmasi en kotu regresyon olurdu.
// ---------------------------------------------------------------------
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { pool, query } from '../lib/db.js';
import { parseJsonColumn } from '../lib/serialize.js';
import { bulletsOf, formatMedium, leadSentence } from '../lib/summarize.js';

export const DEFAULT_LIMIT = Number(process.env.SUMMARY_BUILD_LIMIT || 1000);
/** summary_short kolonu VARCHAR(400); kademe siniri 150 ama kolon sinirini da asmayalim. */
const SHORT_COLUMN_MAX = 400;

export async function runBuildSummaries({ limit = DEFAULT_LIMIT, force = false } = {}) {
  const basladi = Date.now();
  const ozet = {
    incelendi: 0, guncellendi: 0, degismedi: 0, bos: 0, llm_korundu: 0,
    sure_ms: 0, notlar: [],
  };

  let rows;
  try {
    rows = await query(
      `SELECT id, title, summary, key_points, summary_short, summary_medium, summary_source
         FROM articles
        ORDER BY id ASC
        LIMIT ${Math.max(1, Math.min(5000, Number(limit) || DEFAULT_LIMIT))}`,
    );
  } catch (err) {
    ozet.notlar.push(`haberler okunamadi: ${err.message}`);
    ozet.sure_ms = Date.now() - basladi;
    return ozet;
  }

  for (const row of rows) {
    ozet.incelendi += 1;

    if (row.summary_source === 'llm' && !force) {
      ozet.llm_korundu += 1;
      continue;
    }

    const article = {
      title: row.title,
      summary: row.summary,
      key_points: parseJsonColumn(row.key_points, []),
    };

    const short = leadSentence(article).slice(0, SHORT_COLUMN_MAX);
    // 5 dk kademesi 3 madde: key_points[0..2]. Kolon bos olsa da anlik
    // yardimci ayni sonucu verir; kolonu doldurmak sadece okumayi ucuzlatir.
    const medium = formatMedium(bulletsOf({ ...article, summary_medium: null }, 3));

    if (!short && !medium) {
      ozet.bos += 1;
      continue;
    }
    if ((row.summary_short ?? '') === short && (row.summary_medium ?? '') === medium) {
      ozet.degismedi += 1;
      continue;
    }

    try {
      await query(
        `UPDATE articles
            SET summary_short = ?, summary_medium = ?, summary_source = 'heuristik'
          WHERE id = ?`,
        [short || null, medium || null, row.id],
      );
      ozet.guncellendi += 1;
    } catch (err) {
      ozet.notlar.push(`haber ${row.id}: ${err.message}`);
    }
  }

  ozet.sure_ms = Date.now() - basladi;
  return ozet;
}

// --- CLI --------------------------------------------------------------
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const limit = Number(process.argv[2]) || DEFAULT_LIMIT;
  runBuildSummaries({ limit })
    .then((ozet) => console.log('[ozet-kademeleri]', JSON.stringify(ozet, null, 2)))
    .catch((err) => console.error('[ozet-kademeleri] beklenmeyen hata:', err?.message || err))
    .finally(() => pool.end().catch(() => {}));
}
