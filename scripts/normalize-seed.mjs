#!/usr/bin/env node
/**
 * Seed normalizasyonu.
 *
 * Toplayicilar serbest metin uretir; sema ise sabit ENUM bekler. Gercek bir
 * toplama hattinda da yukari akis her zaman sozlesmeye birebir uymaz, bu
 * yuzden normalizasyon kalici bir hat adimi - tek seferlik yama degil.
 *
 * Yaptigi:
 *  1. sources[].source_type -> 6 degerlik ENUM'a esler
 *  2. region ve sentiment degerlerini buyuk harfe/ASCII'ye cekip esler
 *  3. etiket slug'larini sadelestirir (Turkce karakter -> ASCII, bosluk -> tire)
 *  4. importance_factors eksik bilesenlerini makul varsayilanla doldurur
 *  5. elle yazilmis importance_score alanlarini siler (seeder hesaplar)
 *
 * Kullanim: node scripts/normalize-seed.mjs [--dry]
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SEED_DIR = resolve(new URL('../seed', import.meta.url).pathname);
const DRY = process.argv.includes('--dry');

// --- source_type eslemesi ---------------------------------------------
// Anahtar: toplayicinin urettigi serbest deger (kucuk harf).
// Deger: semadaki ENUM.
const SOURCE_TYPE_MAP = {
  // mevzuat
  'mevzuat': 'mevzuat', 'resmi-gazete': 'mevzuat', 'mevzuat-portali': 'mevzuat',
  'yasal': 'mevzuat', 'resmi-yayin': 'mevzuat', 'mevzuat-mali': 'mevzuat',
  'mali-mevzuat': 'mevzuat', 'vergi-mevzuati': 'mevzuat',
  // kurum (ulusal kurum/bakanlik/duzenleyici)
  'kurum': 'kurum', 'resmi-kurum': 'kurum', 'kamu': 'kurum', 'kamu-kurumu': 'kurum',
  'bakanlik': 'kurum', 'duzenleyici': 'kurum', 'duzenleyici-kurum': 'kurum',
  'oda': 'kurum', 'birlik': 'kurum', 'merkez-bankasi': 'kurum', 'kalkinma-ajansi': 'kurum',
  // acik veri / istatistik / fiyat servisleri
  'acik_veri': 'acik_veri', 'acik-veri': 'acik_veri', 'istatistik': 'acik_veri',
  'istatistik-kurumu': 'acik_veri', 'veri': 'acik_veri', 'sektorel-veri': 'acik_veri',
  'sektorel-fiyat-ajansi': 'acik_veri', 'fiyat-ajansi': 'acik_veri',
  'endeks': 'acik_veri', 'piyasa-verisi': 'acik_veri',
  // basin
  'basin': 'basin', 'haber': 'basin', 'haber-sitesi': 'basin', 'gazete': 'basin',
  'medya': 'basin', 'sektorel-medya': 'basin', 'sektorel-basin': 'basin',
  'uluslararasi-medya': 'basin', 'uluslararasi-ajans': 'basin', 'ajans': 'basin',
  'haber-ajansi': 'basin', 'sektorel-analiz': 'basin', 'analiz': 'basin',
  'ekonomi-basini': 'basin', 'dergi': 'basin',
  // uluslararasi kurum
  'uluslararasi': 'uluslararasi', 'uluslararasi-kurum': 'uluslararasi',
  'uluslararasi-kurulus': 'uluslararasi', 'uluslararasi-orgut': 'uluslararasi',
  'standart-kurulusu': 'uluslararasi', 'standart': 'uluslararasi',
  'ab-kurumu': 'uluslararasi', 'ab': 'uluslararasi', 'cok-tarafli': 'uluslararasi',
  'yabanci-kamu': 'uluslararasi', 'yabanci-kurum': 'uluslararasi',
};

const REGION_MAP = {
  'KURESEL': 'KURESEL', 'GLOBAL': 'KURESEL', 'DUNYA': 'KURESEL',
  'TURKIYE': 'TURKIYE', 'TR': 'TURKIYE', 'YEREL': 'TURKIYE',
  'AMERIKA': 'AMERIKA', 'ABD': 'AMERIKA', 'USA': 'AMERIKA', 'US': 'AMERIKA',
  'KUZEY-AMERIKA': 'AMERIKA', 'LATIN-AMERIKA': 'AMERIKA',
  'AVRUPA': 'AVRUPA', 'EUROPE': 'AVRUPA', 'EU': 'AVRUPA', 'AB': 'AVRUPA',
  'ASYA': 'ASYA', 'ASIA': 'ASYA', 'UZAK-DOGU': 'ASYA', 'ORTA-DOGU': 'ASYA',
  'DIGER': 'DIGER', 'OTHER': 'DIGER', 'AFRIKA': 'DIGER', 'OKYANUSYA': 'DIGER',
};

const SENTIMENT_MAP = {
  'POZITIF': 'POZITIF', 'POSITIVE': 'POZITIF', 'OLUMLU': 'POZITIF',
  'NOTR': 'NOTR', 'NEUTRAL': 'NOTR', 'NÖTR': 'NOTR', 'NOTR/KARISIK': 'NOTR',
  'KARISIK': 'NOTR', 'MIXED': 'NOTR',
  'NEGATIF': 'NEGATIF', 'NEGATIVE': 'NEGATIF', 'OLUMSUZ': 'NEGATIF',
};

const FACTORS = ['authority', 'impact', 'keyword', 'recency', 'corroboration', 'reach'];

/** Turkce karakterleri ASCII'ye indirger; slug uretiminde kullanilir. */
const deTr = (s) => s
  .replace(/[İIı]/g, 'i').replace(/[Şş]/g, 's').replace(/[Ğğ]/g, 'g')
  .replace(/[Üü]/g, 'u').replace(/[Öö]/g, 'o').replace(/[Çç]/g, 'c');

const slugify = (s) => deTr(String(s))
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const stats = { files: 0, sourceTypes: 0, regions: 0, sentiments: 0, tags: 0, factors: 0, scores: 0 };
const unmapped = new Set();

for (const file of readdirSync(SEED_DIR).filter((f) => f.endsWith('.json')).sort()) {
  const path = join(SEED_DIR, file);
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  stats.files++;

  for (const s of doc.sources ?? []) {
    const raw = slugify(s.source_type ?? 'diger');
    const mapped = SOURCE_TYPE_MAP[raw];
    if (mapped) {
      if (mapped !== s.source_type) { s.source_type = mapped; stats.sourceTypes++; }
    } else {
      unmapped.add(`${s.source_type} (${file})`);
      s.source_type = 'diger';
      stats.sourceTypes++;
    }
    if (s.slug) s.slug = slugify(s.slug);
  }

  for (const a of doc.articles ?? []) {
    if (a.source_slug) a.source_slug = slugify(a.source_slug);

    const rRaw = deTr(String(a.region ?? 'DIGER')).toUpperCase().replace(/\s+/g, '-');
    const r = REGION_MAP[rRaw] ?? 'DIGER';
    if (r !== a.region) { a.region = r; stats.regions++; }

    const sRaw = deTr(String(a.sentiment ?? 'NOTR')).toUpperCase();
    const sm = SENTIMENT_MAP[sRaw] ?? 'NOTR';
    if (sm !== a.sentiment) { a.sentiment = sm; stats.sentiments++; }

    if (Array.isArray(a.tags)) {
      const before = a.tags.join('|');
      a.tags = [...new Set(a.tags.map(slugify).filter(Boolean))];
      if (a.tags.join('|') !== before) stats.tags++;
    }

    // Faktorler: eksik bilesen 50 varsayilir; skorun her zaman 6 bileseni olur
    // ki importance_factors JSON'u acikanabilirligi korusun.
    a.importance_factors ??= {};
    for (const k of FACTORS) {
      const v = a.importance_factors[k];
      if (!Number.isFinite(v)) { a.importance_factors[k] = 50; stats.factors++; }
      else a.importance_factors[k] = Math.max(0, Math.min(100, Math.round(v)));
    }

    // Skor her zaman faktorlerden turetilir; elle yazilan deger kaynak degil.
    if (a.importance_score != null) { delete a.importance_score; stats.scores++; }
  }

  if (!DRY) writeFileSync(path, JSON.stringify(doc, null, 2) + '\n', 'utf8');
}

console.log(`${DRY ? '[dry] ' : ''}Normalizasyon — ${stats.files} dosya`);
console.log(`  source_type duzeltildi : ${stats.sourceTypes}`);
console.log(`  region duzeltildi      : ${stats.regions}`);
console.log(`  sentiment duzeltildi   : ${stats.sentiments}`);
console.log(`  etiket listesi duzeldi : ${stats.tags}`);
console.log(`  eksik faktor dolduruldu: ${stats.factors}`);
console.log(`  elle skor silindi      : ${stats.scores}`);
if (unmapped.size) {
  console.log(`\n⚠  Eslenemeyen source_type degerleri 'diger' yapildi:`);
  for (const u of unmapped) console.log(`   ${u}`);
  console.log(`   (SOURCE_TYPE_MAP'e eklenebilir)`);
}
