// =====================================================================
// DOSYA (KONU ZINCIRI) KATMANI — topic_threads
//
// NEDEN `clusters` YENIDEN KULLANILAMAZ:
// `semanticMerge()`'un DORT kosulu da bir dosya kronolojisini YAPISAL
// OLARAK engelliyor:
//   1) kosinus >= 0,935  — taslak tebligle nihai teblig bu kadar benzemez
//   2) FARKLI KAYNAK ZORUNLU — bir dosyanin asamalarini genelde AYNI kaynak
//      yayinlar (Resmî Gazete: taslak -> teblig -> degisiklik)
//   3) <= 4 GUN ARA — dosya aylar surer
//   4) SAYISAL UYUM — asamalarin rakamlari zaten farklidir (oran degisir)
// Bu kosullari gevsetmek TEKILLESTIRMEYI bozar: 0,930'da "Fransa'da sanayi
// uretimi" <-> "Italya'da sanayi uretimi" cifti sizmaya basliyor. Kume
// "kac bagimsiz kaynak DOGRULADI" sorusunu yanitlar; dosya "bu konu NASIL
// GELISTI" sorusunu. Iki ayri soru, iki ayri katman.
//
// AMA MAKINE YENIDEN KULLANILIR: ayni embedding servisi, ayni Qdrant
// koleksiyonu (`isov_articles`, point.id = article.id), ayni union-find
// fikri. Yeni model, yeni koleksiyon, yeni bagimlilik YOK.
//
// DOSYAYA KATILMA: UC OLCUTTEN IKISI
//   (i)   kosinus esigi
//   (ii)  yuksek agirlikli CAPA ETIKET ortakligi
//   (iii) mevzuat referans kodu ortakligi (lib/refCodes.js)
//
// =====================================================================
// ESIKLER SIKILASTIRILDI — OLCULEREK, TAHMINLE DEGIL
//
// Sozlesmedeki ilk parametrelerle (kosinus >= 0,88, yalnizca 4 slug'lik
// jenerik kara liste, KURESEL union-find) 115 haber uzerinde olculen sonuc:
// 142 kenar, 5 dosya — ve icinde 44 UYELI ve 14 UYELI iki DEV BLOB.
// Elle inceleme (scratchpad/ag-kisisel/dosya-rapor.txt) uc ayri kirilma
// gosterdi:
//
//  (A) 0,88 ESIGI KANIT DEGIL. CONTRACT.md'nin kendi olcumu: makale-makale
//      kosinus dagiliminda medyan 0,8585, **p90 = 0,8870**. Yani 0,88
//      gurultunun ~p88'i — rastgele iki ekonomi haberinin %11'i bu esigi
//      zaten geciyor. (Tekillestirme icin 0,935 = ~p99,5 secilmisti.)
//      Esik 0,915'e cekildi (~p99).
//
//  (B) CAPA ETIKET DEGIL, TEMA ETIKETI. Kara listedeki 4 slug yetmiyor:
//      `abd` (10 haber), `cin` (8), `kobi` (15), `tedarik-zinciri` (10),
//      `anti-damping` (7) hepsi tema/cografya etiketi. Elle kara liste
//      buyutmek her yeni korpusta tekrar bozulur; yerine OLCULEBILIR bir
//      kural: bir etiket korpusta 3'ten fazla haberde geciyorsa DOSYA
//      KIMLIGI DEGIL, ALAN adidir (ANCHOR_MAX_DF).
//
//  (C) KURESEL UNION-FIND ZINCIRLEME URETIYOR. 44 uyeli blob'un olusma
//      yolu: #1(enflasyon)-#58(tuik)-#41-#66 ... -#59(petrol)-#97-#103.
//      Her kenar tek basina makul, zincirin tamami sacma. Cozum: gruplama
//      KIMLIK KAPSAMLI. Once dosya kimligi (nadir ref kodu ya da nadir capa
//      etiket) belirlenir, birlesme YALNIZCA o kimligi tasiyan haberler
//      arasinda aranir. Boylece zincir kimlik disina tasamaz.
//
//  (D) REFERANS KODU DA JENERIK OLABILIR. Olculdu: `US-SECTION-232` 7
//      haberde, `US-SECTION-338` 4 haberde — bunlar KANUN MADDESI atiflari,
//      dosya kimligi degil (ayni maddeye dayanan alakasiz sorusturmalar
//      var). Kodlara da ayni df siniri uygulaniyor (REF_MAX_DF).
//
// SIKILASTIRMANIN BEDELI (durustce): recall dustu. Gercek oldugu elle
// dogrulanan "ABD-Kanada Section 338 tarifeleri" dosyasi (#87/#88/#89)
// KACIRILIYOR — cunku kimligi US-SECTION-338 ve o kodun df'si 4 > 3.
// Katman recall degil PRECISION icin ayarlandi; tekillestirme katmaninda
// verilen kararin aynisi. Kalan yanlis pozitif orani ve elle inceleme
// dokumu icin gorev raporuna bakin.
// =====================================================================
import { sha1 } from '../lib/dedup.js';
import { toMysqlDateTime } from '../lib/http.js';
import { refCodesOf, sharedRefCodes } from '../lib/refCodes.js';
import { buildEmbeddingText, embed } from './embeddings.js';
import * as vectorStore from './vectorStore.js';

/**
 * Kosinus olcutu (i). Sozlesmedeki 0,88 OLCULDU ve kanit uretmedigi
 * gorulduk icin sikilastirildi (yukaridaki (A)). Tekillestirme esigi 0,935;
 * dosya esigi hala ondan GEVSEK — taslakla nihai metin o kadar benzemez.
 */
export const DEFAULT_THREAD_COSINE = 0.915;
/** Capa etiket olmak icin asgari `tags.weight`. 40 = seeder varsayilani (ayirt etmez). */
export const ANCHOR_MIN_WEIGHT = 70;
/**
 * Bir capa etiketin gecebilecegi EN FAZLA haber sayisi. Uzerindeki etiket
 * dosya kimligi degil ALAN adidir (yukaridaki (B)). Olculen degerler:
 * ihracat 25, kobi 15, abd 10, tedarik-zinciri 10, cin 8, anti-damping 7.
 */
export const ANCHOR_MAX_DF = 3;
/** Referans kodlari icin ayni sinir (yukaridaki (D)). */
export const REF_MAX_DF = 3;
/** Uc olcutten kacinin saglanmasi gerekir (CONTRACT: 3'ten 2'si). */
export const REQUIRED_CRITERIA = 2;
/** Qdrant'tan haber basina istenecek komsu sayisi. */
const NEIGHBOR_LIMIT = 15;
/**
 * Bir dosyanin en fazla uye sayisi — EMNIYET SUPABI. Kimlik kapsamli
 * gruplama zincirlemeyi zaten engelliyor (df<=3 kimlik en fazla 3 uye
 * verir), ama korpus buyudugunde df dagilimi kayabilir.
 */
export const MAX_THREAD_MEMBERS = 8;

/**
 * JENERIK CAPA KARA LISTESI (CONTRACT.md'de acikca sayilanlar).
 *
 * `ANCHOR_MAX_DF` bunlarin dordunu de bugun zaten eliyor (ihracat 25,
 * sanayi-uretimi 4, resmi-gazete etiketi korpusta yok, mevzuat-degisikligi
 * 2 — sadece bu son sinirdan gecerdi). Liste yine de duruyor: sozlesmenin
 * acik hukmu ve `mevzuat-degisikligi` gibi df'si dusuk ama anlami TEMA olan
 * slug'lari df kurali yakalayamaz.
 */
export const GENERIC_ANCHORS = Object.freeze(new Set([
  'resmi-gazete', 'mevzuat-degisikligi', 'ihracat', 'sanayi-uretimi',
]));

export function thresholdsFromEnv(overrides = {}) {
  const c = Number(process.env.THREAD_COSINE_THRESHOLD);
  const w = Number(process.env.THREAD_ANCHOR_MIN_WEIGHT);
  const d = Number(process.env.THREAD_ANCHOR_MAX_DF);
  return {
    cosine: Number.isFinite(c) && c > 0 && c <= 1 ? c : DEFAULT_THREAD_COSINE,
    anchorMinWeight: Number.isFinite(w) && w > 0 ? w : ANCHOR_MIN_WEIGHT,
    anchorMaxDf: Number.isFinite(d) && d >= 1 ? d : ANCHOR_MAX_DF,
    ...overrides,
  };
}

/** Union-find (pipeline.js'teki ile ayni fikir). */
function makeUnionFind(n) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) { const nx = parent[x]; parent[x] = r; x = nx; }
    return r;
  };
  return {
    find,
    union(a, b) {
      const ra = find(a); const rb = find(b);
      if (ra === rb) return false;
      parent[rb] = ra;
      return true;
    },
  };
}

/** Kesisen capa etiketler. */
export function sharedAnchors(a, b) {
  const out = [];
  for (const slug of a) if (b.has(slug)) out.push(slug);
  return out.sort();
}

/**
 * Bir ciftin olcutlerini degerlendirir.
 * @returns {{score:number, cosine:boolean, anchor:string[], refs:string[]}}
 */
export function evaluatePair({ cosine = null, anchorsA, anchorsB, refsA, refsB, threshold }) {
  const okCosine = Number.isFinite(cosine) && cosine >= threshold;
  const anchor = sharedAnchors(anchorsA, anchorsB);
  const refs = sharedRefCodes(refsA, refsB);
  const score = (okCosine ? 1 : 0) + (anchor.length ? 1 : 0) + (refs.length ? 1 : 0);
  return { score, cosine: okCosine, anchor, refs };
}

/** Kume -> deger sayimlari (document frequency). */
function documentFrequency(sets) {
  const df = new Map();
  for (const set of sets) for (const v of set || []) df.set(v, (df.get(v) || 0) + 1);
  return df;
}

/**
 * Dosyalari bastan hesaplar ve yazar.
 *
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {object} [opts]
 * @returns {Promise<object>} istatistik (asla firlatmaz; `skipped` doldurur)
 */
export async function recomputeThreads(conn, opts = {}) {
  const cfg = thresholdsFromEnv(opts);
  const stats = {
    cosine_threshold: cfg.cosine,
    anchor_min_weight: cfg.anchorMinWeight,
    anchor_max_df: cfg.anchorMaxDf,
    articles: 0,
    identities: 0,
    edges: 0,
    threads: 0,
    confirmed: 0,
    members: 0,
    oversized: 0,
    skipped: null,
  };

  try {
    const [rows] = await conn.query(
      `SELECT a.id, a.url_hash, a.title, a.summary, a.body, a.published_at, a.source_id
         FROM articles a
        WHERE a.is_duplicate = 0
        ORDER BY a.id ASC`,
    );
    stats.articles = rows.length;
    if (rows.length < 2) {
      stats.skipped = 'yeterli haber yok';
      return stats;
    }
    const idx = new Map(rows.map((r, i) => [Number(r.id), i]));

    // --- capa etiketler: agirlik esigi + kara liste + df siniri --------
    const [tagRows] = await conn.query(
      `SELECT at.article_id, t.slug
         FROM article_tags at
         JOIN tags t ON t.id = at.tag_id
         JOIN articles a ON a.id = at.article_id
        WHERE t.weight >= ? AND a.is_duplicate = 0`,
      [cfg.anchorMinWeight],
    );
    const rawAnchors = rows.map(() => new Set());
    for (const r of tagRows) {
      const slug = String(r.slug);
      if (GENERIC_ANCHORS.has(slug)) continue;
      const i = idx.get(Number(r.article_id));
      if (i !== undefined) rawAnchors[i].add(slug);
    }
    const anchorDf = documentFrequency(rawAnchors);
    const anchors = rawAnchors.map((set) => {
      const out = new Set();
      for (const slug of set) if ((anchorDf.get(slug) || 0) <= cfg.anchorMaxDf) out.add(slug);
      return out;
    });

    // --- referans kodlari: ayni df siniri ------------------------------
    const rawRefs = rows.map((r) => refCodesOf(r));
    const refDf = documentFrequency(rawRefs);
    const refs = rawRefs.map((set) => {
      const out = new Set();
      for (const code of set) if ((refDf.get(code) || 0) <= REF_MAX_DF) out.add(code);
      return out;
    });

    // --- kosinus: embedding + Qdrant ----------------------------------
    // Vektorler `isov_articles` koleksiyonunda (point.id = article.id).
    // Upsert IDEMPOTENT ve payload sekli semanticMerge ile AYNI — iki
    // katman ayni noktalari paylasir, IKINCI KOLEKSIYON ACILMAZ.
    const cos = new Map(); // "i-j" (i<j) -> kosinus
    let cosineAvailable = false;

    const emb = await embed(rows.map((r) => buildEmbeddingText(r)));
    if (emb.available && emb.vectors.length === rows.length) {
      const ready = await vectorStore.ensureCollection(emb.dim);
      if (ready.ok) {
        await vectorStore.upsertArticles(rows.map((r, i) => ({
          id: Number(r.id),
          vector: emb.vectors[i],
          payload: {
            article_id: Number(r.id),
            source_id: Number(r.source_id ?? 0),
            title: String(r.title || '').slice(0, 400),
            published_at: r.published_at ? new Date(r.published_at).toISOString() : null,
          },
        })));

        cosineAvailable = true;
        for (let i = 0; i < rows.length; i++) {
          const res = await vectorStore.searchNeighbors(emb.vectors[i], {
            limit: NEIGHBOR_LIMIT, scoreThreshold: cfg.cosine,
          });
          if (!res.ok) { cosineAvailable = false; break; }
          for (const hit of res.hits) {
            const j = idx.get(hit.id);
            if (j === undefined || j === i) continue;
            const key = i < j ? `${i}-${j}` : `${j}-${i}`;
            cos.set(key, Math.max(cos.get(key) ?? 0, hit.score));
          }
        }
      }
    }
    stats.cosine_available = cosineAvailable;
    if (!cosineAvailable) {
      // Olcut (i) yok: kalan iki olcutun IKISI de gerekir. Dosya uretimi
      // durmaz ama daralir — bilincli degrade, hata degil.
      stats.skipped = `kosinus olcutu yok (${emb.error || 'qdrant/model erisilemedi'})`;
    }

    // --- KIMLIK KAPSAMLI GRUPLAMA -------------------------------------
    // Dosyanin bir KIMLIGI vardir. Kimlik adaylari: en az 2 haberde gecen
    // nadir referans kodlari (once) ve nadir capa etiketleri. Birlesme
    // YALNIZCA ayni kimligi tasiyan haberler arasinda aranir; zincirleme
    // kimlik disina tasamaz (yukaridaki (C)).
    const identities = [];
    for (const [code, df] of refDf) {
      if (df < 2 || df > REF_MAX_DF) continue;
      identities.push({ kind: 'mevzuat', key: code, refCode: code, anchorTag: null, df });
    }
    for (const [slug, df] of anchorDf) {
      if (df < 2 || df > cfg.anchorMaxDf) continue;
      identities.push({ kind: 'olay', key: slug, refCode: null, anchorTag: slug, df });
    }
    // Ref kodu kimlikleri once, sonra en NADIR etiket: ayni uye kumesi iki
    // kimlikten de cikarsa daha guclu (spesifik) kimlik kazanir.
    identities.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'mevzuat' ? -1 : 1;
      return (a.df - b.df) || (a.key < b.key ? -1 : 1);
    });
    stats.identities = identities.length;

    const usedThreadIds = [];
    const seenMemberSets = new Set();
    let edgeCount = 0;

    for (const identity of identities) {
      // Kimligi tasiyan haberler
      const pool = [];
      for (let i = 0; i < rows.length; i++) {
        const has = identity.refCode ? refs[i].has(identity.refCode) : anchors[i].has(identity.anchorTag);
        if (has) pool.push(i);
      }
      if (pool.length < 2) continue;

      const local = new Map(pool.map((i, k) => [i, k]));
      const uf = makeUnionFind(pool.length);
      const localEdges = [];
      for (let a = 0; a < pool.length; a++) {
        for (let b = a + 1; b < pool.length; b++) {
          const i = pool[a]; const j = pool[b];
          const key = i < j ? `${i}-${j}` : `${j}-${i}`;
          const verdict = evaluatePair({
            cosine: cos.has(key) ? cos.get(key) : null,
            anchorsA: anchors[i], anchorsB: anchors[j],
            refsA: refs[i], refsB: refs[j],
            threshold: cfg.cosine,
          });
          if (verdict.score < REQUIRED_CRITERIA) continue;
          localEdges.push({ i, j, ...verdict, similarity: cos.get(key) ?? null });
          uf.union(local.get(i), local.get(j));
          edgeCount += 1;
        }
      }
      if (localEdges.length === 0) continue;

      const components = new Map();
      for (const i of pool) {
        const root = uf.find(local.get(i));
        if (!components.has(root)) components.set(root, []);
        components.get(root).push(i);
      }

      for (const memberIdx of components.values()) {
        if (memberIdx.length < 2) continue;
        if (memberIdx.length > MAX_THREAD_MEMBERS) { stats.oversized += 1; continue; }

        // Ayni uye kumesi baska (daha guclu) bir kimlikten zaten yazildiysa
        // tekrar yazma: kullaniciya ayni dosyayi iki adla gostermek olurdu.
        const fingerprint = memberIdx.map((i) => Number(rows[i].id)).sort((x, y) => x - y).join(',');
        if (seenMemberSets.has(fingerprint)) continue;
        seenMemberSets.add(fingerprint);

        const written = await persistThread(conn, {
          rows, memberIdx, identity, edges: localEdges, stats,
        });
        if (written) usedThreadIds.push(written);
      }
    }
    stats.edges = edgeCount;

    // Artik uretilmeyen dosyalar temizlenir — AMA KULLANICI TAKIP EDIYORSA
    // DOKUNULMAZ. Takip edilen bir dosyayi silmek `user_thread_follows`
    // kaydini da (CASCADE) siler; kullanicinin acik tercihini bir gece isi
    // sessizce silemez.
    if (usedThreadIds.length) {
      const ph = usedThreadIds.map(() => '?').join(', ');
      await conn.execute(
        `DELETE FROM topic_threads
          WHERE id NOT IN (${ph})
            AND id NOT IN (SELECT thread_id FROM user_thread_follows)`,
        usedThreadIds,
      );
    } else {
      await conn.execute(
        `DELETE FROM topic_threads
          WHERE id NOT IN (SELECT thread_id FROM user_thread_follows)`,
      );
    }

    return stats;
  } catch (err) {
    // Dosya katmani hicbir kosulda hatti durdurmaz.
    stats.skipped = `hata: ${err?.message || String(err)}`;
    return stats;
  }
}

/** Tek dosyayi yazar; thread id doner (yazilamadiysa null). */
async function persistThread(conn, { rows, memberIdx, identity, edges, stats }) {
  const members = memberIdx
    .map((i) => ({ i, row: rows[i] }))
    .sort((a, b) => {
      const ta = a.row.published_at ? new Date(a.row.published_at).getTime() : 0;
      const tb = b.row.published_at ? new Date(b.row.published_at).getTime() : 0;
      return (ta - tb) || (Number(a.row.id) - Number(b.row.id));
    });

  // THREAD_KEY KARARLILIGI: kimlik + EN ESKI EKLENEN uyenin url_hash'i.
  // url_hash icerik adresli (yeniden seed'lemede degismez) ve yeni uye
  // katilinca ANAHTAR DEGISMEZ — aksi halde her gece yeni dosya acilir,
  // `dosya-gelismesi` olaylari cogalir ve kullanici takipleri kopar.
  const seed = members.reduce((a, b) => (Number(a.row.id) <= Number(b.row.id) ? a : b));
  const threadKey = sha1(`dosya|${identity.key}|${seed.row.url_hash}`);

  // ONAY: bir kenarda UC OLCUTUN HEPSI saglanmissa dosya onayli sayilir.
  // Aksi halde is_confirmed=0 — kullaniciya CEKINCELI gosterilir ve
  // siralamada +4'ten (onaysizda +2'den) fazla etki etmez.
  const inGroup = new Set(memberIdx);
  const isConfirmed = edges.some((e) => inGroup.has(e.i) && inGroup.has(e.j) && e.score === 3);

  const dates = members
    .map((m) => (m.row.published_at ? new Date(m.row.published_at) : null))
    .filter((d) => d && !Number.isNaN(d.getTime()));
  const firstSeen = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : new Date();
  const lastSeen = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date();
  const last = members[members.length - 1];

  await conn.execute(
    `INSERT INTO topic_threads
       (thread_key, label, kind, anchor_tag_slug, ref_code, member_count,
        first_seen_at, last_seen_at, last_article_id, is_confirmed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       label = VALUES(label), kind = VALUES(kind),
       anchor_tag_slug = VALUES(anchor_tag_slug), ref_code = VALUES(ref_code),
       member_count = VALUES(member_count), first_seen_at = VALUES(first_seen_at),
       last_seen_at = VALUES(last_seen_at), last_article_id = VALUES(last_article_id),
       is_confirmed = VALUES(is_confirmed)`,
    [
      threadKey,
      String(seed.row.title || '').slice(0, 300),
      identity.kind,
      identity.anchorTag,
      identity.refCode,
      members.length,
      toMysqlDateTime(firstSeen),
      toMysqlDateTime(lastSeen),
      Number(last.row.id),
      isConfirmed ? 1 : 0,
    ],
  );

  const [idRows] = await conn.execute(
    'SELECT id FROM topic_threads WHERE thread_key = ? LIMIT 1',
    [threadKey],
  );
  const threadId = idRows[0]?.id;
  if (!threadId) return null;

  stats.threads += 1;
  stats.members += members.length;
  if (isConfirmed) stats.confirmed += 1;

  for (let k = 0; k < members.length; k++) {
    const m = members[k];
    const prev = k > 0 ? members[k - 1] : null;
    const edge = prev ? findEdge(edges, prev.i, m.i) : null;
    await conn.execute(
      `INSERT INTO topic_thread_items
         (thread_id, article_id, similarity, prev_article_id, join_reason)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         similarity = VALUES(similarity), prev_article_id = VALUES(prev_article_id),
         join_reason = VALUES(join_reason)`,
      [
        threadId,
        Number(m.row.id),
        edge?.similarity != null ? Number(edge.similarity).toFixed(3) : null,
        prev ? Number(prev.row.id) : null,
        joinReason(edge, identity),
      ],
    );
  }

  // Artik uye olmayan kalintilar (onceki kosumdan) dusurulur.
  const memberIds = members.map((m) => Number(m.row.id));
  await conn.execute(
    `DELETE FROM topic_thread_items
      WHERE thread_id = ? AND article_id NOT IN (${memberIds.map(() => '?').join(', ')})`,
    [threadId, ...memberIds],
  );

  return threadId;
}

function findEdge(edges, i, j) {
  return edges.find((e) => (e.i === i && e.j === j) || (e.i === j && e.j === i)) || null;
}

/** topic_thread_items.join_reason — en GUCLU olcut yazilir. */
function joinReason(edge, identity) {
  if (edge?.refs?.length) return 'ref-kodu';
  if (edge?.anchor?.length) return 'etiket';
  if (edge) return 'embedding';
  return identity?.refCode ? 'ref-kodu' : 'etiket';
}
