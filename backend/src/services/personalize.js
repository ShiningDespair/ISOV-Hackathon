// ---------------------------------------------------------------------
// KISISELLESTIRME SERVISI — DB + Qdrant okumalari
//
// Skorlama mantigi BURADA DEGIL: lib/personalRank.js'te (saf, testi kolay).
// Bu dosya yalnizca "veriyi topla, motora ver, sayfaya dilimle" isini yapar.
// ---------------------------------------------------------------------
import crypto from 'node:crypto';
import { query } from '../lib/db.js';
import { normalizeText } from '../lib/dedup.js';
import { placeholders } from '../lib/http.js';
import { parseJsonColumn } from '../lib/serialize.js';
import {
  POSITIONS, POSITION_LABELS, TIME_BUDGETS, layoutOf, normalizePosition, normalizeTimeBudget, densityOf,
} from '../lib/positions.js';
import { NACE_SECTORS, sectorByCode } from '../lib/sectors.js';
import { WEIGHTS, WEIGHTS_VERSION, THREAD_BONUS_MAX, rankArticles } from '../lib/personalRank.js';
import { ARTICLE_COLUMNS, ARTICLE_FROM, serializeArticleRows } from './articleService.js';
import * as vectorStore from './vectorStore.js';

/**
 * ADAY KUME TAVANI.
 *
 * `sort=kisisel` icin SQL siralamasi yapilamaz (skor JS'te hesaplaniyor);
 * sirali bir SAYFANIN dogru olmasi icin ADAY KUMENIN TAMAMI skorlanmak
 * zorunda. Aday kume `ORDER BY importance_score DESC LIMIT 300` ile alinir
 * (mevcut `ix_articles_importance` indeksi kullanilir).
 *
 * 300 SAYISININ GEREKCESI: bugunun korpusu 115 tekil haber — 300 tavani
 * korpusun TAMAMINI kapsiyor, dolayisiyla YAKLASIKLIK HATASI SIFIR.
 *
 * KORPUS 2.000'i GECTIGINDE BU YOL YETMEZ: 300'un disinda kalan bir haber
 * kisisel skorda ilk sayfaya girebilecekken giremez ve hata sessizce buyur.
 * O noktada `user_article_scores` MATERYALIZASYONU ZORUNLU OLUR: gece isi
 * skorlari yazar, liste sorgusu `ix_uascore_rank` ile dogrudan SQL'de
 * siralar. Tablo ve indeks bu yuzden bugunden mevcut.
 */
export const CANDIDATE_LIMIT = 300;
/** Uzerinde materyalizasyonun zorunlu hale geldigi korpus buyuklugu. */
export const MATERIALIZATION_THRESHOLD = 2000;

// ---------------------------------------------------------------------
// Sektor metni -> slug
// ---------------------------------------------------------------------

/**
 * `entities.sektor` serbest metin: korpusta "Demir-Celik", "Çelik",
 * "Imalat Sanayi", "Otomotiv Yan Sanayi" gibi 85 varyant var.
 * sectors.js `corpus` listeleri slug bekliyor; donusum tek yerde durur.
 */
export function sectorSlug(value) {
  const norm = normalizeText(value); // Turkce kucultme + aksan katlama
  return norm ? norm.replace(/\s+/g, '-') : '';
}

export function articleSectorSlugs(entities) {
  const raw = parseJsonColumn(entities, {});
  const list = Array.isArray(raw?.sektor) ? raw.sektor : [];
  const out = new Set();
  for (const item of list) {
    const slug = sectorSlug(item);
    if (slug) out.add(slug);
  }
  return [...out];
}

// ---------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------

const EMPTY_PROFILE = Object.freeze({
  position_code: 'ust-yonetim',
  time_budget_min: 5,
  primary_sector_code: null,
  secondary_sector_codes: [],
  region_focus: [],
  interest_tag_slugs: [],
  muted_tag_slugs: [],
  persona: null,
});

function jsonArray(value) {
  const parsed = parseJsonColumn(value, []);
  return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
}

/** user_profiles satirini (yoksa varsayilani) normalize edilmis sekilde verir. */
export async function loadProfileRow(userId) {
  if (!userId) return { ...EMPTY_PROFILE, user_id: null, exists: false };
  const rows = await query(
    `SELECT user_id, position_code, time_budget_min, primary_sector_code,
            secondary_sector_codes, region_focus, interest_tag_slugs, muted_tag_slugs,
            persona, profile_hash, profile_vector, profile_vector_model,
            profile_vector_dim, profile_vector_status, profile_vector_built_at
       FROM user_profiles WHERE user_id = ? LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return { ...EMPTY_PROFILE, user_id: Number(userId), exists: false };

  return {
    exists: true,
    user_id: Number(row.user_id),
    position_code: normalizePosition(row.position_code),
    time_budget_min: normalizeTimeBudget(row.time_budget_min),
    primary_sector_code: row.primary_sector_code ?? null,
    secondary_sector_codes: jsonArray(row.secondary_sector_codes),
    region_focus: jsonArray(row.region_focus),
    interest_tag_slugs: jsonArray(row.interest_tag_slugs),
    muted_tag_slugs: jsonArray(row.muted_tag_slugs),
    persona: parseJsonColumn(row.persona, null),
    profile_hash: row.profile_hash ?? null,
    profile_vector: parseJsonColumn(row.profile_vector, null),
    profile_vector_model: row.profile_vector_model ?? null,
    profile_vector_dim: row.profile_vector_dim ?? null,
    profile_vector_status: row.profile_vector_status ?? 'yok',
    profile_vector_built_at: row.profile_vector_built_at ?? null,
  };
}

/**
 * Skorlama icin gereken TUREVLERI ekler: kiracinin izlemedigi kaynaklar ve
 * kullanicinin kaynak bazli okuma sayilari (source_affinity bileseni).
 */
export async function loadProfile(userId, tenantKey = null) {
  const profile = await loadProfileRow(userId);

  let unwatched = new Set();
  if (tenantKey) {
    const rows = await query(
      `SELECT s.slug FROM tenant_source_prefs tsp
         JOIN sources s ON s.id = tsp.source_id
        WHERE tsp.tenant_key = ? AND tsp.is_watched = 0`,
      [tenantKey],
    );
    unwatched = new Set(rows.map((r) => String(r.slug)));
  }

  const readCounts = new Map();
  if (userId) {
    const rows = await query(
      `SELECT s.slug, COUNT(*) AS c
         FROM user_article_prefs uap
         JOIN articles a ON a.id = uap.article_id
         JOIN sources s ON s.id = a.source_id
        WHERE uap.user_id = ? AND uap.read_at IS NOT NULL
        GROUP BY s.slug`,
      [userId],
    );
    for (const r of rows) readCounts.set(String(r.slug), Number(r.c));
  }

  return { ...profile, unwatched_source_slugs: unwatched, source_read_counts: readCounts };
}

// ---------------------------------------------------------------------
// Profil metni ve hash
// ---------------------------------------------------------------------

const REGION_WORDS = Object.freeze({
  KURESEL: 'küresel', TURKIYE: 'Türkiye', AMERIKA: 'Amerika',
  AVRUPA: 'Avrupa', ASYA: 'Asya', DIGER: 'diğer bölgeler',
});

/** Turkce liste: "a, b ve c". */
function joinTr(items) {
  const list = items.filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')} ve ${list[list.length - 1]}`;
}

/**
 * PROFIL METNI — SLUG TORBASI DEGIL, DUZGUN TURKCE CUMLELER.
 *
 * NEDEN: e5 ailesi duz metinle egitildi. "tesvik ihracat cbam kobi" gibi
 * bir slug torbasi tokenizer'a dogal dil gibi gorunmez; uretilen vektor
 * haber vektorleriyle ayni uzayda anlamli komsuluk kurmaz. Haberler
 * "baslik + ozet" (dogal metin) olarak embedleniyor; profil de ayni
 * bicimde olmak zorunda.
 *
 * @param {object} profile
 * @param {Map<string,string>} [tagLabels] slug -> insan okunur etiket
 */
export function buildProfileText(profile, tagLabels = new Map()) {
  const parts = [];
  const position = POSITION_LABELS[normalizePosition(profile?.position_code)];
  parts.push(`${position} pozisyonunda çalışan bir sanayi profesyoneliyim.`);

  const primary = sectorByCode(profile?.primary_sector_code);
  if (primary) parts.push(`Ana faaliyet alanım ${primary.label} sektörü.`);

  const secondary = (profile?.secondary_sector_codes || [])
    .map((c) => sectorByCode(c)?.label)
    .filter(Boolean);
  if (secondary.length) {
    parts.push(`Ayrıca ${joinTr(secondary)} sektörlerini yakından takip ediyorum.`);
  }

  const regions = (profile?.region_focus || []).map((r) => REGION_WORDS[r]).filter(Boolean);
  if (regions.length) {
    parts.push(`${joinTr(regions)} kaynaklı gelişmelerle ilgileniyorum.`);
  }

  const interests = (profile?.interest_tag_slugs || [])
    .map((slug) => tagLabels.get(slug) || slug.replace(/-/g, ' '))
    .filter(Boolean);
  if (interests.length) {
    parts.push(`Özellikle ${joinTr(interests)} konularındaki haberleri okuyorum.`);
  }

  const persona = profile?.persona;
  const note = typeof persona?.not === 'string' ? persona.not.trim()
    : (typeof persona?.note === 'string' ? persona.note.trim() : '');
  if (note) parts.push(note.slice(0, 400));

  return parts.join(' ');
}

/** profile_hash = sha1(profil metni). Metin degismediyse vektor yeniden uretilmez. */
export function profileHash(text) {
  return crypto.createHash('sha1').update(String(text ?? ''), 'utf8').digest('hex');
}

/** Etiket slug -> label sozlugu (profil metni icin). */
export async function tagLabelMap(slugs) {
  const clean = [...new Set((slugs || []).map(String).filter(Boolean))];
  if (clean.length === 0) return new Map();
  const rows = await query(
    `SELECT slug, label FROM tags WHERE slug IN (${placeholders(clean.length)})`,
    clean,
  );
  return new Map(rows.map((r) => [String(r.slug), String(r.label)]));
}

// ---------------------------------------------------------------------
// Anlamsal sira (Qdrant)
// ---------------------------------------------------------------------

/**
 * Profil vektorunun aday kume icindeki KOMSULUK SIRASINI verir.
 *
 * Qdrant'ta IKINCI KOLEKSIYON ACILMAZ: `ensureCollection()` boyut
 * uyusmazliginda koleksiyonu SILIP yeniden yaratiyor; ikinci koleksiyon bu
 * riski ikiye katlar ve iki koleksiyonun boyutu ayrilabilir. Profil vektoru
 * `user_profiles.profile_vector`ta durur, sorgu vektoru olarak gelir.
 *
 * @returns {Promise<{ranks: Map<number,number>, total: number, ok: boolean, error: string|null}>}
 */
export async function semanticRanks(profileVector, candidateIds) {
  const ids = new Set((candidateIds || []).map(Number).filter(Number.isFinite));
  const empty = { ranks: new Map(), total: ids.size, ok: false, error: null };
  if (!Array.isArray(profileVector) || profileVector.length === 0) {
    return { ...empty, error: 'profil vektoru yok' };
  }
  if (ids.size === 0) return { ...empty, error: 'aday kume bos' };

  // Limit aday sayisi kadar: aday kumedeki HER haberin bir sirasi olsun.
  // Eksik gelenler taban 50 alir (mutlak kosinus tuzagina dusmemek icin
  // sira tabanli olcek kullaniliyor, bkz. lib/personalRank.js).
  const res = await vectorStore.searchNeighbors(profileVector, { limit: Math.max(1, ids.size) });
  if (!res.ok) return { ...empty, error: res.error };

  const ranks = new Map();
  let rank = 0;
  for (const hit of res.hits) {
    if (!ids.has(hit.id)) continue;
    ranks.set(hit.id, rank);
    rank += 1;
  }
  return { ranks, total: ids.size, ok: true, error: null };
}

// ---------------------------------------------------------------------
// Dosya (topic_threads) etkisi
// ---------------------------------------------------------------------

/**
 * Kullanicinin TAKIP ETTIGI dosyalardaki haberlere kucuk bir itki.
 * TAVAN +4 (CONTRACT: "onaysiz dosya siralamada +4'ten fazla etki etmez").
 * Onaysiz dosya yarim etki alir — cekinceli gosterildigi gibi cekinceli sayilir.
 */
export const THREAD_BONUS_CONFIRMED = THREAD_BONUS_MAX;
export const THREAD_BONUS_UNCONFIRMED = 2;

export async function threadBonuses(userId, candidateIds) {
  const out = new Map();
  const ids = [...new Set((candidateIds || []).map(Number).filter(Number.isFinite))];
  if (!userId || ids.length === 0) return out;

  const rows = await query(
    `SELECT tti.article_id, t.is_confirmed
       FROM user_thread_follows utf
       JOIN topic_threads t ON t.id = utf.thread_id
       JOIN topic_thread_items tti ON tti.thread_id = t.id
      WHERE utf.user_id = ? AND tti.article_id IN (${placeholders(ids.length)})`,
    [userId, ...ids],
  );
  for (const r of rows) {
    const bonus = Number(r.is_confirmed) === 1 ? THREAD_BONUS_CONFIRMED : THREAD_BONUS_UNCONFIRMED;
    const key = Number(r.article_id);
    out.set(key, Math.max(out.get(key) || 0, bonus));
  }
  return out;
}

// ---------------------------------------------------------------------
// Aday kume
// ---------------------------------------------------------------------

/**
 * Suzgecleri uygulanmis aday kumeyi skorlamaya hazir sekilde getirir.
 * `whereSql`/`params` route'un `buildFilters()` ciktisidir — filtre mantigi
 * TEK yerde kalsin diye burada YENIDEN YAZILMIYOR.
 */
export async function loadCandidates(whereSql, params, { limit = CANDIDATE_LIMIT } = {}) {
  const countRows = await query(`SELECT COUNT(*) AS total ${ARTICLE_FROM} ${whereSql}`, params);
  const total = Number(countRows[0]?.total ?? 0);
  if (total === 0) return { rows: [], total, truncated: false };

  const cap = Math.max(1, Math.min(CANDIDATE_LIMIT, Number(limit) || CANDIDATE_LIMIT));
  const rows = await query(
    `SELECT ${ARTICLE_COLUMNS}
     ${ARTICLE_FROM} ${whereSql}
     ORDER BY a.importance_score DESC, a.published_at DESC, a.id DESC
     LIMIT ${cap}`,
    params,
  );
  return { rows, total, truncated: total > cap };
}

/** Skorlama motorunun bekledigi sade sekle cevirir (DB satirindan bagimsiz). */
export function toScorableArticle(row, tagSlugs) {
  return {
    id: Number(row.id),
    tagSlugs: tagSlugs || [],
    category: row.category ?? null,
    sectorSlugs: articleSectorSlugs(row.entities),
    region: row.region,
    sourceSlug: row.source_slug ?? null,
    importanceScore: Number(row.importance_score),
    band: row.importance_band,
    published_at: row.published_at ?? null,
  };
}

/** Aday satirlarinin etiket slug'larini tek sorguda toplar. */
export async function tagSlugsByArticle(ids) {
  const map = new Map();
  const clean = [...new Set((ids || []).map(Number).filter(Number.isFinite))];
  if (clean.length === 0) return map;
  const rows = await query(
    `SELECT at.article_id, t.slug
       FROM article_tags at JOIN tags t ON t.id = at.tag_id
      WHERE at.article_id IN (${placeholders(clean.length)})`,
    clean,
  );
  for (const r of rows) {
    const key = Number(r.article_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(String(r.slug));
  }
  return map;
}

// ---------------------------------------------------------------------
// ANA GIRIS: GET /articles?sort=kisisel
// ---------------------------------------------------------------------

/**
 * @param {object} input
 * @param {string} input.whereSql   buildFilters() ciktisi
 * @param {Array}  input.params     buildFilters() ciktisi
 * @param {object} input.profile    loadProfile() ciktisi
 * @param {number} input.page
 * @param {number} input.limit
 * @param {number} input.offset
 * @param {boolean} [input.reveal]  ?reveal=1 -> skorlar ve sinyaller doner
 * @returns {Promise<{data:Array, total:number, meta:object}>}
 */
export async function listPersonalized({
  whereSql, params, profile, page = 1, limit = 20, offset = 0, reveal = false,
}) {
  const { rows, total, truncated } = await loadCandidates(whereSql, params);
  if (rows.length === 0) {
    return { data: [], total, meta: emptyMeta(profile, total, truncated) };
  }

  const ids = rows.map((r) => Number(r.id));
  const slugMap = await tagSlugsByArticle(ids);
  const articles = rows.map((r) => toScorableArticle(r, slugMap.get(Number(r.id))));

  const sem = await semanticRanks(profile?.profile_vector, ids);
  const bonuses = await threadBonuses(profile?.user_id, ids);

  const ranked = rankArticles({
    articles,
    profile,
    semanticRanks: sem.ranks,
    semanticTotal: sem.total,
    threadBonuses: bonuses,
  });

  const page$ = ranked.slice(offset, offset + limit);
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  const ordered = page$.map((s) => byId.get(s.id)).filter(Boolean);
  const data = await serializeArticleRows(ordered, { reveal });

  // Kisisel alanlar: `is_pinned` her zaman doner (arayuz "kritik, bu yuzden
  // listede" rozetini basiyor); skor ve sinyaller yalnizca ?reveal=1 ile.
  const scoreById = new Map(page$.map((s) => [s.id, s]));
  for (const item of data) {
    const s = scoreById.get(Number(item.id));
    if (!s) continue;
    item.is_pinned = s.is_pinned;
    item.personal = reveal
      ? {
        personal_score: s.personal_score,
        global_normalized: s.global_normalized,
        final_score: s.final_score,
        thread_bonus: s.thread_bonus,
        signals: s.signals,
        weights: WEIGHTS,
        weights_version: WEIGHTS_VERSION,
      }
      : null;
  }

  return {
    data,
    total,
    meta: {
      sort: 'kisisel',
      position_code: profile?.position_code ?? null,
      layout: layoutOf(profile?.position_code),
      time_budget_min: profile?.time_budget_min ?? 5,
      weights_version: WEIGHTS_VERSION,
      candidate_count: rows.length,
      candidate_limit: CANDIDATE_LIMIT,
      candidates_truncated: truncated,
      semantic: {
        used: sem.ok && sem.ranks.size > 0,
        ranked: sem.ranks.size,
        vector_status: profile?.profile_vector_status ?? 'yok',
        error: sem.error,
      },
      pinned_count: ranked.filter((r) => r.is_pinned === 1).length,
    },
  };
}

function emptyMeta(profile, total, truncated) {
  return {
    sort: 'kisisel',
    position_code: profile?.position_code ?? null,
    layout: layoutOf(profile?.position_code),
    time_budget_min: profile?.time_budget_min ?? 5,
    weights_version: WEIGHTS_VERSION,
    candidate_count: 0,
    candidate_limit: CANDIDATE_LIMIT,
    candidates_truncated: truncated,
    semantic: { used: false, ranked: 0, vector_status: profile?.profile_vector_status ?? 'yok', error: null },
    pinned_count: 0,
    total,
  };
}

/** /meta/taxonomy ve /me/profile icin sabit listeler (tek kaynak). */
export function taxonomy() {
  return {
    positions: POSITIONS.map((code) => ({
      code, label: POSITION_LABELS[code], layout: layoutOf(code),
    })),
    sectors: NACE_SECTORS.map((s) => ({ code: s.code, label: s.label, group: s.group })),
    regions: Object.keys(REGION_WORDS),
    // Kademeler TIME_BUDGETS'ten okunur, burada YENIDEN YAZILMAZ.
    // Onceki hali elle yazilmis `[2, 5, 15]` idi; ucuncu kademe 10'a
    // inince (docs/SADELESTIRME.md §4) bu satir sessizce eski kademeyi
    // yayinlamaya devam ederdi — taksonomi ile DENSITY birbirinden kayardi.
    time_budgets: TIME_BUDGETS.map((m) => ({ minutes: m, density: densityOf(m) })),
  };
}
