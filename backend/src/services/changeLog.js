// =====================================================================
// DEGISIKLIK TAKIBI — article_changes
//
// Turler: `yeni`, `kume-buyudu`, `band-yukseldi`, `dosya-gelismesi`,
// `ozet-guncellendi`.
//
// IDEMPOTENT: `change_key` UNIQUE + `INSERT IGNORE`. Anahtar olayin
// KIMLIGINI tasir (tur + makale + DEGER), bu yuzden ayni olay ikinci kez
// yazilmaz ama GERCEK bir degisim yeni anahtar uretir.
//
// `UNIQUE(article_id, change_type, thread_id)` ISE YARAMAZDI: MySQL'de
// NULL'lar birbirinden FARKLI sayilir; `thread_id IS NULL` olan satirlar
// (yeni / band-yukseldi / kume-buyudu / ozet-guncellendi — yani turlerin
// dordu) kisitlamayi hic gormez ve her kosumda cogalir.
//
// AYRI IS DEGIL, HATTIN 4. ADIMI: bu olaylarin HEPSI hattin zaten yaptigi
// isin yan urunu. Kumeleme uye sayisini, skorlama bandi, ozet isi metni
// zaten hesapladi. Ikinci bir gece isi ayni veriyi ikinci kez okur ve iki
// isin arasinda yaris durumu dogar.
// =====================================================================
import { sha1 } from '../lib/dedup.js';
import { WEIGHTS } from '../lib/importance.js';
import { recomputeThreads } from './topicThreads.js';

export const CHANGE_TYPES = Object.freeze([
  'yeni', 'kume-buyudu', 'band-yukseldi', 'dosya-gelismesi', 'ozet-guncellendi',
]);

const BAND_RANK = Object.freeze({ DUSUK: 0, ORTA: 1, YUKSEK: 2, KRITIK: 3 });

/**
 * `band-yukseldi` icin ANLAMLI skor: RECENCY HARIC agirlikli toplam,
 * kalan agirliklara gore yeniden normalize edilmis (0..100).
 *
 * TUZAK (ve neden bu fonksiyon var): bant YUZDELIK tabanli ve `recency`
 * her gece HER skoru degistiriyor. Naif bir "skor degisti" / "bant degisti"
 * olayi her gece 131 haberin TAMAMINDA tetiklenir ve degisiklik akisi
 * kullanilamaz hale gelir — akisin tamami gurultu olur.
 *
 * Koruma: yalnizca recency DISI bilesenler karsilastirilir ve yalnizca
 * YUKARI yonlu degisim kaydedilir. Boylece olay "bu haber gercekten daha
 * onemli hale geldi" demek olur: daha fazla kaynak dogruladi
 * (corroboration), etki yeniden degerlendirildi (impact) ya da yeni
 * tetikleyici etiket eklendi (keyword).
 */
export function coreScore(factors) {
  const f = factors && typeof factors === 'object' ? factors : {};
  let sum = 0;
  let weight = 0;
  for (const [key, w] of Object.entries(WEIGHTS)) {
    if (key === 'recency') continue;
    const v = Number(f[key]);
    sum += (Number.isFinite(v) ? v : 50) * w;
    weight += w;
  }
  return weight > 0 ? Math.round((sum / weight) * 100) / 100 : 50;
}

/** Ozet degisimi icin parmak izi — uc kademenin hepsini kapsar. */
export function summaryFingerprint(row) {
  return sha1([
    String(row?.summary ?? ''),
    String(row?.summary_short ?? ''),
    String(row?.summary_medium ?? ''),
    String(row?.summary_source ?? ''),
  ].join('|#|'));
}

/** Skor degisiminde gurultu esigi (puan). Altindaki oynama olay degildir. */
export const CORE_EPSILON = 0.5;

function safeJson(value, fallback = {}) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value) ?? fallback; } catch { return fallback; }
}

function maxBand(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return (BAND_RANK[b] ?? -1) > (BAND_RANK[a] ?? -1) ? b : a;
}

/**
 * Onceki kosumlarda kaydedilmis TABAN degerleri cikarir.
 *
 * Ayri bir "onceki durum" tablosu ACMIYORUZ: `article_changes` zaten olayin
 * degerini `detail` icinde tasiyor, dolayisiyla taban = kaydedilmis
 * degerlerin EN YUKSEGI. Ikinci bir durum tablosu, iki kaynagin birbirinden
 * kaymasi riskini bedavaya satin almak olurdu.
 */
async function loadBaselines(conn) {
  const [rows] = await conn.query(
    `SELECT article_id, change_type, detail, detected_at, id
       FROM article_changes
      WHERE change_type IN ('yeni','band-yukseldi','kume-buyudu','ozet-guncellendi')
      ORDER BY detected_at ASC, id ASC`,
  );

  const base = new Map();
  const get = (id) => {
    if (!base.has(id)) {
      base.set(id, { band: null, core: null, members: null, summary_hash: null, seen: false });
    }
    return base.get(id);
  };

  for (const r of rows) {
    const id = Number(r.article_id);
    const d = safeJson(r.detail, {});
    const b = get(id);
    b.seen = true;

    if (r.change_type === 'yeni') {
      if (d.band) b.band = maxBand(b.band, d.band);
      if (Number.isFinite(Number(d.core))) b.core = Math.max(b.core ?? -1, Number(d.core));
      if (Number.isFinite(Number(d.cluster_members))) {
        b.members = Math.max(b.members ?? 0, Number(d.cluster_members));
      }
      if (d.summary_hash) b.summary_hash = d.summary_hash;
    } else if (r.change_type === 'band-yukseldi') {
      if (d.to) b.band = maxBand(b.band, d.to);
      if (Number.isFinite(Number(d.core_to))) b.core = Math.max(b.core ?? -1, Number(d.core_to));
    } else if (r.change_type === 'kume-buyudu') {
      if (Number.isFinite(Number(d.to))) b.members = Math.max(b.members ?? 0, Number(d.to));
    } else if (r.change_type === 'ozet-guncellendi') {
      // Sirali okudugumuz icin EN SON yazilan gecerli taban.
      if (d.summary_hash) b.summary_hash = d.summary_hash;
    }
  }
  return base;
}

/** INSERT IGNORE — change_key UNIQUE oldugu icin tekrar yazma sessizce duser. */
async function insertChange(conn, { articleId, threadId = null, type, detail, changeKey, runId }) {
  const [res] = await conn.execute(
    `INSERT IGNORE INTO article_changes
       (article_id, thread_id, change_type, detail, change_key, run_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [articleId, threadId, type, JSON.stringify(detail ?? {}), changeKey, runId ?? null],
  );
  return Number(res.affectedRows) > 0;
}

/**
 * HATTIN 4. ADIMI. Dosya katmanini da calistirir (dosya-gelismesi olaylari
 * icin dosyalarin GUNCEL olmasi sart; iki ayri is olsa arada yaris olur).
 *
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {object} [opts]
 * @param {number} [opts.runId] collection_runs.id
 * @returns {Promise<object>} sayimlar (asla firlatmaz)
 */
export async function recordChanges(conn, { runId = null, ...threadOpts } = {}) {
  const stats = {
    yeni: 0,
    'kume-buyudu': 0,
    'band-yukseldi': 0,
    'dosya-gelismesi': 0,
    'ozet-guncellendi': 0,
    incelendi: 0,
    threads: null,
    skipped: null,
  };

  try {
    // 1) Dosyalar once: `dosya-gelismesi` bunlarin uzerinden yazilir.
    stats.threads = await recomputeThreads(conn, threadOpts);

    const baselines = await loadBaselines(conn);
    // ONEMLI: bu kosumda 'yeni' yazmadan ONCE, hangi haberlerin GECMISTEN
    // gelen bir kaydi oldugunu biliyoruz. "Degisim" iddiasi ancak onceden
    // gorulmus bir haber icin anlamli: ilk kez gordugumuz bir haberde
    // "kume buyudu" demek YANLIS olurdu (neye gore buyudu?).
    //
    // Bu koruma `run_id`e DAYANMAZ: POST /collect/run runId'i hatta
    // gecirmiyor (o dosya baska ajanin), yani run_id NULL gelebilir.
    // Kayit varligina bakmak her cagirandan bagimsiz calisir.
    const seenBefore = new Set([...baselines.keys()].filter((id) => baselines.get(id).seen));

    const [rows] = await conn.query(
      `SELECT a.id, a.title, a.importance_band, a.importance_factors,
              a.summary, a.summary_short, a.summary_medium, a.summary_source,
              COALESCE(c.member_count, 1) AS member_count
         FROM articles a
         LEFT JOIN clusters c ON c.id = a.cluster_id
        WHERE a.is_duplicate = 0
        ORDER BY a.id ASC`,
    );
    stats.incelendi = rows.length;

    for (const row of rows) {
      const id = Number(row.id);
      const factors = safeJson(row.importance_factors, {});
      const core = coreScore(factors);
      const band = String(row.importance_band);
      const members = Number(row.member_count) || 1;
      const fp = summaryFingerprint(row);
      const base = baselines.get(id);

      // --- yeni ---------------------------------------------------
      if (!seenBefore.has(id)) {
        const ok = await insertChange(conn, {
          articleId: id,
          type: 'yeni',
          runId,
          changeKey: sha1(`yeni|${id}`),
          detail: {
            title: String(row.title || '').slice(0, 300),
            band,
            core,
            cluster_members: members,
            summary_hash: fp,
          },
        });
        if (ok) stats.yeni += 1;
        // Ilk kayitta baska olay URETILMEZ: karsilastirma tabani yok.
        continue;
      }

      // --- kume-buyudu --------------------------------------------
      const prevMembers = base?.members ?? 1;
      if (members > prevMembers) {
        const ok = await insertChange(conn, {
          articleId: id,
          type: 'kume-buyudu',
          runId,
          // Anahtar YENI DEGERI tasir: 2->3 yeni olay, tekrar kosum degil.
          changeKey: sha1(`kume-buyudu|${id}|${members}`),
          detail: { from: prevMembers, to: members },
        });
        if (ok) stats['kume-buyudu'] += 1;
      }

      // --- band-yukseldi (TUZAK KORUMASI) -------------------------
      // IKI kosul birlikte: bant YUKARI cikmis VE recency-disi cekirdek
      // skor ANLAMLI olcude artmis. Tek basina bant kontrolu her gece
      // tetiklenirdi (bant yuzdelik, recency her gun degisiyor).
      const prevBand = base?.band ?? band;
      const prevCore = base?.core;
      const bandRose = (BAND_RANK[band] ?? -1) > (BAND_RANK[prevBand] ?? -1);
      const coreRose = Number.isFinite(prevCore) ? core > prevCore + CORE_EPSILON : false;
      if (bandRose && coreRose) {
        const ok = await insertChange(conn, {
          articleId: id,
          type: 'band-yukseldi',
          runId,
          changeKey: sha1(`band-yukseldi|${id}|${band}`),
          detail: { from: prevBand, to: band, core_from: prevCore, core_to: core },
        });
        if (ok) stats['band-yukseldi'] += 1;
      }

      // --- ozet-guncellendi ---------------------------------------
      if (base?.summary_hash && base.summary_hash !== fp) {
        const ok = await insertChange(conn, {
          articleId: id,
          type: 'ozet-guncellendi',
          runId,
          changeKey: sha1(`ozet-guncellendi|${id}|${fp}`),
          detail: {
            summary_hash: fp,
            summary_source: row.summary_source,
            chars: String(row.summary ?? '').length,
          },
        });
        if (ok) stats['ozet-guncellendi'] += 1;
      }
    }

    // --- dosya-gelismesi -------------------------------------------
    // Bir dosyanin ILK uyesi "gelisme" DEGILDIR (dosyayi o acti); sonraki
    // her uye bir gelismedir. Bu olay `seenBefore` ile SINIRLANMAZ: "B
    // haberi A dosyasini ilerletiyor" ifadesi ilk gozlemde de DOGRU.
    // ("kume buyudu" ise ilk gozlemde yanlis olurdu — neye gore buyudu?)
    const [items] = await conn.query(
      `SELECT tti.thread_id, tti.article_id, tti.prev_article_id, tti.similarity,
              tti.join_reason, t.thread_key, t.label, t.ref_code, t.member_count,
              t.is_confirmed
         FROM topic_thread_items tti
         JOIN topic_threads t ON t.id = tti.thread_id
        WHERE tti.prev_article_id IS NOT NULL
        ORDER BY tti.thread_id ASC, tti.article_id ASC`,
    );
    // MUTABAKAT (yalnizca bu tur): dosyalar her kosumda BASTAN hesaplaniyor.
    // Bir esik sikilastirmasi ya da yeni veri bir uyeyi dosyadan cikardiysa,
    // o uyenin "gelisme" olayi artik SISTEMIN INANMADIGI bir iddiadir ve
    // akista kalmamalidir.
    //
    // NEDEN DIGER TURLER SILINMIYOR: `yeni`, `kume-buyudu`, `band-yukseldi`,
    // `ozet-guncellendi` GECMISTE OLMUS BIR OLAYIN gozlemi — bugun bandi
    // dususe gecse de "o gun yukselmisti" dogru kalir. `dosya-gelismesi` ise
    // TUREV BIR DURUM ifadesi ("B haberi A dosyasini ilerletiyor"); dosya
    // tanimi degisince ifade de gecersizlesir.
    await conn.execute(
      `DELETE ac FROM article_changes ac
        WHERE ac.change_type = 'dosya-gelismesi'
          AND NOT EXISTS (
            SELECT 1 FROM topic_thread_items tti
             WHERE tti.thread_id = ac.thread_id
               AND tti.article_id = ac.article_id
               AND tti.prev_article_id IS NOT NULL
          )`,
    );

    for (const it of items) {
      const ok = await insertChange(conn, {
        articleId: Number(it.article_id),
        threadId: Number(it.thread_id),
        type: 'dosya-gelismesi',
        runId,
        // thread_id DEGIL thread_key: dosya yeniden yaratilsa (id degisse)
        // bile ayni olay ikinci kez yazilmaz.
        changeKey: sha1(`dosya-gelismesi|${it.thread_key}|${it.article_id}`),
        detail: {
          thread_key: it.thread_key,
          label: it.label,
          ref_code: it.ref_code,
          member_count: Number(it.member_count),
          prev_article_id: Number(it.prev_article_id),
          similarity: it.similarity != null ? Number(it.similarity) : null,
          join_reason: it.join_reason,
          is_confirmed: Number(it.is_confirmed) === 1,
        },
      });
      if (ok) stats['dosya-gelismesi'] += 1;
    }

    return stats;
  } catch (err) {
    // Degisiklik kaydi hattı DURDURMAZ: kumeleme ve skorlama zaten islendi,
    // olay akisi kaybi geri alinabilir bir eksiklik, veri kaybi degil.
    stats.skipped = `hata: ${err?.message || String(err)}`;
    return stats;
  }
}
