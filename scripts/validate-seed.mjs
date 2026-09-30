#!/usr/bin/env node
/**
 * Seed JSON dogrulayici.
 *
 * Toplama ajanlari birbirinden bagimsiz calisiyor; bu betik hepsinin
 * docs/CONTRACT.md'deki sozlesmeye uydugunu seed yuklenmeden ONCE dogrular.
 * Seeder'in yarim veriyle DB'yi kirletmesindense burada patlamasi iyidir.
 *
 * Kullanim: node scripts/validate-seed.mjs [seed-dizini]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SEED_DIR = resolve(process.argv[2] ?? new URL('../seed', import.meta.url).pathname);

const REGIONS = new Set(['KURESEL', 'TURKIYE', 'AMERIKA', 'AVRUPA', 'ASYA', 'DIGER']);
const SENTIMENTS = new Set(['POZITIF', 'NOTR', 'NEGATIF']);
const SOURCE_TYPES = new Set(['mevzuat', 'kurum', 'acik_veri', 'basin', 'uluslararasi', 'diger']);
const FACTORS = ['authority', 'impact', 'keyword', 'recency', 'corroboration'];
const TAG_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const errors = [];
const warnings = [];
const seenUrls = new Map();   // url -> "dosya#index"
const allSources = new Map(); // slug -> dosya
const tagCounts = new Map();
const regionCounts = new Map();
let totalArticles = 0;

const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

const files = readdirSync(SEED_DIR).filter((f) => f.endsWith('.json') && !/^etiket-adlari-/i.test(f)).sort();
if (files.length === 0) {
  console.error(`HATA: ${SEED_DIR} icinde .json dosyasi yok.`);
  process.exit(1);
}

for (const file of files) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(join(SEED_DIR, file), 'utf8'));
  } catch (e) {
    err(file, `gecersiz JSON - ${e.message}`);
    continue;
  }

  // --- sources ------------------------------------------------------
  const localSources = new Set();
  if (!Array.isArray(doc.sources) || doc.sources.length === 0) {
    err(file, 'sources[] eksik veya bos');
  } else {
    for (const [i, s] of doc.sources.entries()) {
      const at = `${file}#sources[${i}]`;
      if (!s.slug) err(at, 'slug eksik');
      else {
        if (!TAG_SLUG.test(s.slug)) err(at, `slug formati gecersiz: "${s.slug}"`);
        if (localSources.has(s.slug)) err(at, `dosya icinde tekrar eden slug: "${s.slug}"`);
        localSources.add(s.slug);
        // Ayni kaynagin iki dosyada gecmesi normal (ornegin Reuters);
        // seeder upsert ettigi icin sorun degil, sadece bilgi amacli.
        if (allSources.has(s.slug) && allSources.get(s.slug) !== file) {
          warn(at, `"${s.slug}" ayrica ${allSources.get(s.slug)} dosyasinda da tanimli (upsert edilecek)`);
        }
        allSources.set(s.slug, file);
      }
      if (!s.name) err(at, 'name eksik');
      if (s.source_type && !SOURCE_TYPES.has(s.source_type)) {
        err(at, `source_type gecersiz: "${s.source_type}"`);
      }
      const aw = s.authority_weight;
      if (aw != null && (!Number.isFinite(aw) || aw < 0 || aw > 100)) {
        err(at, `authority_weight 0..100 olmali, gelen: ${aw}`);
      }
    }
  }

  // --- articles -----------------------------------------------------
  if (!Array.isArray(doc.articles) || doc.articles.length === 0) {
    err(file, 'articles[] eksik veya bos');
    continue;
  }

  for (const [i, a] of doc.articles.entries()) {
    const at = `${file}#articles[${i}]`;
    totalArticles++;

    if (!a.source_slug) err(at, 'source_slug eksik');
    else if (!localSources.has(a.source_slug)) {
      err(at, `source_slug "${a.source_slug}" ayni dosyanin sources[] listesinde yok`);
    }

    if (!a.url) err(at, 'url eksik');
    else {
      try {
        const u = new URL(a.url);
        if (!/^https?:$/.test(u.protocol)) err(at, `url protokolu gecersiz: ${u.protocol}`);
      } catch { err(at, `url ayristirilamadi: "${a.url}"`); }
      if (seenUrls.has(a.url)) {
        // Bu bir HATA degil: ayni URL iki kez gelirse seeder idempotent
        // davranip atlar. Yine de haberdar olalim.
        warn(at, `url zaten ${seenUrls.get(a.url)} icinde var, seeder atlayacak`);
      } else seenUrls.set(a.url, at);
    }

    if (!a.title) err(at, 'title eksik');
    else if (a.title.length > 400) err(at, `title 400 karakteri asiyor (${a.title.length})`);

    if (!a.summary) err(at, 'summary eksik');
    else if (a.summary.length < 40) warn(at, `summary cok kisa (${a.summary.length} karakter)`);

    const bodyLen = (a.body ?? '').split(/\s+/).filter(Boolean).length;
    if (bodyLen < 40) warn(at, `body cok kisa (${bodyLen} kelime) - ozetleme icin zayif`);

    if (!a.region) err(at, 'region eksik');
    else if (!REGIONS.has(a.region)) err(at, `region gecersiz: "${a.region}"`);
    else regionCounts.set(a.region, (regionCounts.get(a.region) ?? 0) + 1);

    if (a.sentiment && !SENTIMENTS.has(a.sentiment)) {
      err(at, `sentiment gecersiz: "${a.sentiment}"`);
    }

    if (!a.published_at) err(at, 'published_at eksik');
    else if (Number.isNaN(Date.parse(a.published_at))) {
      err(at, `published_at ayristirilamadi: "${a.published_at}"`);
    }

    if (a.key_points != null && !Array.isArray(a.key_points)) {
      err(at, 'key_points dizi olmali');
    }

    if (!Array.isArray(a.tags) || a.tags.length === 0) {
      warn(at, 'etiket yok');
    } else {
      for (const t of a.tags) {
        if (typeof t !== 'string' || !TAG_SLUG.test(t)) {
          err(at, `etiket slug formatina uymuyor: "${t}"`);
        } else tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
      }
    }

    const f = a.importance_factors;
    if (!f || typeof f !== 'object') {
      err(at, 'importance_factors eksik');
    } else {
      for (const k of FACTORS) {
        const v = f[k];
        if (v == null) { warn(at, `importance_factors.${k} eksik, varsayilan kullanilacak`); continue; }
        if (!Number.isFinite(v) || v < 0 || v > 100) {
          err(at, `importance_factors.${k} 0..100 olmali, gelen: ${v}`);
        }
      }
    }

    if (a.importance_score != null) {
      warn(at, 'importance_score yazilmamali - seeder faktorlerden hesaplar');
    }
  }
}

// ---------------------------------------------------------------------
// Rapor
// ---------------------------------------------------------------------
const line = '─'.repeat(66);
console.log(line);
console.log(`Seed dogrulama — ${files.length} dosya, ${totalArticles} haber, ${allSources.size} kaynak`);
console.log(line);

console.log('\nBolge dagilimi:');
for (const r of ['KURESEL', 'TURKIYE', 'AMERIKA', 'AVRUPA', 'ASYA', 'DIGER']) {
  const c = regionCounts.get(r) ?? 0;
  console.log(`  ${r.padEnd(9)} ${String(c).padStart(4)}  ${'█'.repeat(Math.round(c / 2))}`);
}

const topTags = [...tagCounts].sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log(`\nEn cok kullanilan etiketler (${tagCounts.size} farkli):`);
console.log('  ' + topTags.map(([t, c]) => `${t}(${c})`).join('  '));

if (warnings.length) {
  console.log(`\n⚠  ${warnings.length} uyari:`);
  for (const w of warnings.slice(0, 25)) console.log(`   ${w}`);
  if (warnings.length > 25) console.log(`   ... ve ${warnings.length - 25} uyari daha`);
}

if (errors.length) {
  console.log(`\n✗  ${errors.length} HATA:`);
  for (const e of errors.slice(0, 40)) console.log(`   ${e}`);
  if (errors.length > 40) console.log(`   ... ve ${errors.length - 40} hata daha`);
  console.log('\nSeed yuklenmemeli. Once hatalari duzeltin.');
  process.exit(1);
}

console.log('\n✓ Tum seed dosyalari sozlesmeye uygun.');
