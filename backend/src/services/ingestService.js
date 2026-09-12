// ---------------------------------------------------------------------
// ALIM (ingest) SERVISI — seed/*.json -> MySQL
//
// Hem `npm run seed` hem POST /collect/run bu servisi kullanir.
// Idempotentlik burada saglanir: url_hash zaten varsa makale ATLANIR,
// kaynak ve etiketler upsert edilir.
// ---------------------------------------------------------------------
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  articleSimhash, contentHash, normalizeUrl, urlHash,
} from '../lib/dedup.js';
import { normalizeFactors } from '../lib/importance.js';
import { toMysqlDateTime } from '../lib/http.js';
import { slugifyTag } from './llm.js';

export const DEFAULT_SEED_DIR = process.env.SEED_DIR
  || '/srv/projects/hackathon/seed';

const REGIONS = new Set(['KURESEL', 'TURKIYE', 'AMERIKA', 'AVRUPA', 'ASYA', 'DIGER']);
const SENTIMENTS = new Set(['POZITIF', 'NOTR', 'NEGATIF']);
const SOURCE_TYPES = new Set(['mevzuat', 'kurum', 'acik_veri', 'basin', 'uluslararasi', 'diger']);
const TAG_KINDS = new Set(['konu', 'sektor', 'kurum', 'mevzuat', 'cografya']);

/** Klasordeki *.json dosyalarini alfabetik okur. Yoksa bos dizi doner. */
export async function readSeedFiles(dir = DEFAULT_SEED_DIR) {
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return { dir, files: [], missing: true };
    throw err;
  }

  const files = entries
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .sort((a, b) => (a < b ? -1 : 1));

  const payloads = [];
  const errors = [];
  for (const file of files) {
    const full = path.join(dir, file);
    try {
      const raw = await fs.readFile(full, 'utf8');
      if (!raw.trim()) { errors.push({ file, message: 'dosya bos' }); continue; }
      payloads.push({ file, full, payload: JSON.parse(raw) });
    } catch (err) {
      // Tek bozuk dosya tum seed'i dusurmesin; raporla ve devam et.
      errors.push({ file, message: err.message });
    }
  }

  return { dir, files: payloads, errors, missing: false };
}

/** Slug'dan okunabilir etiket uretir: 'ar-ge-tesviki' -> 'Ar Ge Tesviki'. */
export function labelFromSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toLocaleUpperCase('tr') + w.slice(1))
    .join(' ')
    .slice(0, 120) || String(slug || '').slice(0, 120);
}

/** sources upsert — slug unique. @returns {Map<string,{id,authority_weight}>} */
export async function upsertSources(conn, sources = []) {
  const map = new Map();
  for (const src of sources) {
    const slug = String(src?.slug || '').trim().slice(0, 80);
    if (!slug) continue;

    const sourceType = SOURCE_TYPES.has(src.source_type) ? src.source_type : 'diger';
    const authority = clampByte(src.authority_weight, 50);

    await conn.execute(
      `INSERT INTO sources
         (slug, name, homepage_url, feed_url, source_type, authority_weight, country_code, language, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         homepage_url = COALESCE(VALUES(homepage_url), homepage_url),
         feed_url = COALESCE(VALUES(feed_url), feed_url),
         source_type = VALUES(source_type),
         authority_weight = VALUES(authority_weight),
         country_code = COALESCE(VALUES(country_code), country_code),
         language = VALUES(language)`,
      [
        slug,
        String(src.name || slug).slice(0, 190),
        src.homepage_url ? String(src.homepage_url).slice(0, 500) : null,
        src.feed_url ? String(src.feed_url).slice(0, 500) : null,
        sourceType,
        authority,
        src.country_code ? String(src.country_code).slice(0, 2).toUpperCase() : null,
        String(src.language || 'tr').slice(0, 5),
      ],
    );

    const [rows] = await conn.execute('SELECT id, authority_weight FROM sources WHERE slug = ? LIMIT 1', [slug]);
    if (rows[0]) map.set(slug, { id: rows[0].id, authority_weight: Number(rows[0].authority_weight) });
  }
  return map;
}

/**
 * tags upsert — slug unique, label yoksa slug'dan uretilir.
 * @param {Array<string|object>} tags
 * @returns {Map<string,{id,weight}>}
 */
export async function upsertTags(conn, tags = []) {
  const map = new Map();
  for (const tag of tags) {
    const isObject = tag && typeof tag === 'object';
    const slug = slugifyTag(isObject ? tag.slug || tag.label : tag);
    if (!slug) continue;

    const label = String((isObject && tag.label) || labelFromSlug(slug)).slice(0, 120);
    const kind = isObject && TAG_KINDS.has(tag.kind) ? tag.kind : 'konu';
    const weight = clampByte(isObject ? tag.weight : undefined, 10);

    await conn.execute(
      `INSERT INTO tags (slug, label, kind, weight)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         label = VALUES(label),
         kind = VALUES(kind),
         weight = GREATEST(tags.weight, VALUES(weight))`,
      [slug, label, kind, weight],
    );

    const [rows] = await conn.execute('SELECT id, weight FROM tags WHERE slug = ? LIMIT 1', [slug]);
    if (rows[0]) map.set(slug, { id: rows[0].id, weight: Number(rows[0].weight) });
  }
  return map;
}

/**
 * Tek makaleyi ekler. Zaten varsa (url_hash) atlar -> idempotent.
 * @returns {'inserted'|'skipped'|'error'}
 */
export async function insertArticle(conn, article, sourceMap, tagMap) {
  const sourceSlug = String(article?.source_slug || '').trim();
  const source = sourceMap.get(sourceSlug);
  if (!source) {
    throw new Error(`Tanimsiz source_slug: "${sourceSlug}"`);
  }

  const url = String(article.url || '').trim();
  if (!url) throw new Error('url bos');
  const title = String(article.title || '').trim();
  if (!title) throw new Error('title bos');

  const hash = urlHash(url);
  const [existing] = await conn.execute('SELECT id FROM articles WHERE url_hash = ? LIMIT 1', [hash]);
  if (existing[0]) {
    // Idempotentlik: ayni link ikinci kez gelirse sadece etiket baglarini tazele.
    await linkTags(conn, existing[0].id, article.tags, tagMap);
    return { status: 'skipped', id: existing[0].id };
  }

  const body = article.body ? String(article.body) : null;
  const publishedAt = article.published_at ? new Date(article.published_at) : null;
  const region = REGIONS.has(article.region) ? article.region : 'DIGER';
  const sentiment = SENTIMENTS.has(article.sentiment) ? article.sentiment : 'NOTR';

  // Faktorler: seed'in verdigi ham degerler saklanir; authority kaynaktan
  // gelir. Nihai skor kumeleme sonrasi pipeline'da yazilir.
  const factors = normalizeFactors({
    ...(article.importance_factors || {}),
    authority: source.authority_weight,
  });

  const [res] = await conn.execute(
    `INSERT INTO articles
       (source_id, url, url_hash, title, body, author, published_at, language,
        content_hash, simhash, summary, key_points, entities,
        region, category, sentiment, importance_score, importance_factors, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.00, ?, 'ISLENDI')`,
    [
      source.id,
      normalizeUrl(url).slice(0, 768),
      hash,
      title.slice(0, 400),
      body,
      article.author ? String(article.author).slice(0, 190) : null,
      toMysqlDateTime(publishedAt),
      String(article.language || 'tr').slice(0, 5),
      contentHash(title, body),
      articleSimhash(title, body).toString(),
      article.summary ? String(article.summary) : null,
      JSON.stringify(Array.isArray(article.key_points) ? article.key_points : []),
      JSON.stringify(article.entities && typeof article.entities === 'object' ? article.entities : {}),
      region,
      article.category ? String(article.category).slice(0, 60) : null,
      sentiment,
      JSON.stringify(factors),
    ],
  );

  await linkTags(conn, res.insertId, article.tags, tagMap);
  return { status: 'inserted', id: res.insertId };
}

/** article_tags baglarini kurar (var olanlari bozmadan). */
async function linkTags(conn, articleId, tags, tagMap) {
  if (!Array.isArray(tags) || tags.length === 0) return;
  for (const tag of tags) {
    const slug = slugifyTag(typeof tag === 'object' ? tag.slug || tag.label : tag);
    const entry = tagMap.get(slug);
    if (!entry) continue;
    await conn.execute(
      `INSERT INTO article_tags (article_id, tag_id, confidence)
       VALUES (?, ?, 1.000)
       ON DUPLICATE KEY UPDATE confidence = VALUES(confidence)`,
      [articleId, entry.id],
    );
  }
}

/**
 * Seed klasorunun tamamini alir.
 * @returns {{files:number, sources:number, tags:number, fetched:number,
 *            inserted:number, skipped:number, errors:Array}}
 */
export async function ingestFromSeed(conn, { dir = DEFAULT_SEED_DIR } = {}) {
  const { files, errors: fileErrors = [], missing } = await readSeedFiles(dir);

  const result = {
    dir,
    missing: Boolean(missing),
    files: files.length,
    sources: 0,
    tags: 0,
    fetched: 0,
    inserted: 0,
    skipped: 0,
    errors: [...fileErrors],
  };
  if (files.length === 0) return result;

  // Tum dosyalardaki kaynak ve etiketleri once topluca upsert ediyoruz ki
  // makale eklenirken FK'ler hazir olsun.
  const allSources = [];
  const allTags = new Set();
  for (const { payload } of files) {
    for (const s of payload?.sources || []) allSources.push(s);
    for (const a of payload?.articles || []) {
      for (const t of a?.tags || []) allTags.add(t && typeof t === 'object' ? JSON.stringify(t) : String(t));
    }
  }

  const sourceMap = await upsertSources(conn, allSources);
  const tagMap = await upsertTags(
    conn,
    [...allTags].map((t) => (String(t).startsWith('{') ? safeParse(String(t)) : t)),
  );
  result.sources = sourceMap.size;
  result.tags = tagMap.size;

  for (const { file, payload } of files) {
    const articles = Array.isArray(payload?.articles) ? payload.articles : [];
    for (const article of articles) {
      result.fetched += 1;
      try {
        const { status } = await insertArticle(conn, article, sourceMap, tagMap);
        if (status === 'inserted') result.inserted += 1;
        else result.skipped += 1;
      } catch (err) {
        result.errors.push({ file, url: article?.url, message: err.message });
      }
    }
  }

  // Kaynaklarin son cekim zamanini isaretle (izlenebilirlik).
  if (sourceMap.size) {
    const ids = [...sourceMap.values()].map((s) => s.id);
    await conn.execute(
      `UPDATE sources SET last_fetched_at = NOW() WHERE id IN (${ids.map(() => '?').join(', ')})`,
      ids,
    );
  }

  return result;
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return s; }
}

function clampByte(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(255, Math.max(0, Math.round(n)));
}
