// KALIBRASYON + FARKLILASMA OLCUMU — iddia degil, olcum.
import { pool, query } from '/srv/projects/hackathon/backend/src/lib/db.js';
import {
  loadProfile, tagSlugsByArticle, toScorableArticle, semanticRanks, loadCandidates,
} from '/srv/projects/hackathon/backend/src/services/personalize.js';
import {
  personalComponents, personalScore, rankArticles, COMPONENTS, CONTRACT_WEIGHTS,
  effectiveWeights, normalizeGlobal,
} from '/srv/projects/hackathon/backend/src/lib/personalRank.js';

const WHERE = 'WHERE a.is_duplicate = 0';
const { rows, total } = await loadCandidates(WHERE, []);
console.log(`aday kume: ${rows.length} (toplam ${total})`);

const ids = rows.map((r) => Number(r.id));
const slugMap = await tagSlugsByArticle(ids);
const articles = rows.map((r) => toScorableArticle(r, slugMap.get(Number(r.id))));
const titleById = new Map(rows.map((r) => [Number(r.id), r.title]));
const bandById = new Map(rows.map((r) => [Number(r.id), r.importance_band]));

const users = await query(
  "SELECT u.id, p.position_code FROM users u JOIN user_profiles p ON p.user_id=u.id WHERE u.email LIKE 'olcum-%' ORDER BY p.position_code",
);

function std(values) {
  const n = values.length;
  if (n === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
}
function mean(values) { return values.reduce((a, b) => a + b, 0) / (values.length || 1); }

// --- 1) BILESEN KALIBRASYONU ------------------------------------------
const perProfileStd = {};
const pooled = Object.fromEntries(COMPONENTS.map((c) => [c, []]));
const compByUser = new Map();
const semInfo = {};

for (const u of users) {
  const profile = await loadProfile(u.id, 'isov');
  const sem = await semanticRanks(profile.profile_vector, ids);
  semInfo[u.position_code] = { ok: sem.ok, ranked: sem.ranks.size, err: sem.error };
  const comps = articles.map((a) => personalComponents(a, profile, {
    semanticRank: sem.ranks.has(a.id) ? sem.ranks.get(a.id) : null,
    semanticTotal: sem.total,
  }));
  compByUser.set(u.position_code, { profile, sem, comps });
  perProfileStd[u.position_code] = {};
  for (const c of COMPONENTS) {
    const vals = comps.map((x) => x[c]);
    perProfileStd[u.position_code][c] = std(vals);
    pooled[c].push(...vals);
  }
}

console.log('\n== SEMANTIK SIRALAMA ==');
console.log(JSON.stringify(semInfo));

console.log('\n== KALIBRASYON: BILESEN STANDART SAPMASI (115 tekil haber) ==');
const hdr = ['pozisyon'.padEnd(26), ...COMPONENTS.map((c) => c.padStart(16))].join('');
console.log(hdr);
for (const u of users) {
  console.log([u.position_code.padEnd(26),
    ...COMPONENTS.map((c) => perProfileStd[u.position_code][c].toFixed(2).padStart(16))].join(''));
}
console.log('-'.repeat(hdr.length));
const pooledStd = {};
for (const c of COMPONENTS) pooledStd[c] = std(pooled[c]);
console.log(['HAVUZ (8x115)'.padEnd(26), ...COMPONENTS.map((c) => pooledStd[c].toFixed(2).padStart(16))].join(''));
console.log(['ortalama deger'.padEnd(26), ...COMPONENTS.map((c) => mean(pooled[c]).toFixed(2).padStart(16))].join(''));
console.log(['profil-ici medyan sapma'.padEnd(26), ...COMPONENTS.map((c) => {
  const v = users.map((u) => perProfileStd[u.position_code][c]).sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)].toFixed(2).padStart(16);
})].join(''));

// --- 2) FARKLILASMA: CIFTLER ARASI ORTUSME ---------------------------
function topN(scored, n, { onlyUnpinned = false } = {}) {
  const list = onlyUnpinned ? scored.filter((s) => s.is_pinned === 0) : scored;
  return list.slice(0, n).map((s) => s.id);
}
const ranked = new Map();
for (const u of users) {
  const { profile, sem } = compByUser.get(u.position_code);
  ranked.set(u.position_code, rankArticles({
    articles, profile, semanticRanks: sem.ranks, semanticTotal: sem.total,
  }));
}

// global ilk 10 (mevcut varsayilan siralama)
const globalTop = [...articles]
  .sort((a, b) => (b.importanceScore - a.importanceScore)
    || (new Date(b.published_at) - new Date(a.published_at)) || (b.id - a.id))
  .map((a) => a.id);

function overlap(a, b) { const s = new Set(b); return a.filter((x) => s.has(x)).length; }

for (const mode of [
  { ad: 'ILK 10 (tam, KRITIK omurga dahil)', n: 10, onlyUnpinned: false },
  { ad: 'ILK 10 (omurga HARIC — sadece sabitlenmemis)', n: 10, onlyUnpinned: true },
  { ad: 'ILK 30 (tam)', n: 30, onlyUnpinned: false },
]) {
  console.log(`\n== CIFTLER ARASI ORTUSME — ${mode.ad} ==`);
  const names = users.map((u) => u.position_code);
  const tops = new Map(names.map((n) => [n, topN(ranked.get(n), mode.n, mode)]));
  const short = (s) => s.slice(0, 9).padStart(9);
  console.log(['pozisyon'.padEnd(26), ...names.map(short), '  GLOBAL'].join(''));
  const pairVals = [];
  for (const a of names) {
    const cells = names.map((b) => {
      const v = overlap(tops.get(a), tops.get(b));
      if (a !== b && names.indexOf(a) < names.indexOf(b)) pairVals.push(v);
      return `${v}/${mode.n}`.padStart(9);
    });
    const g = overlap(tops.get(a), globalTop.slice(0, mode.n));
    console.log([a.padEnd(26), ...cells, `  ${g}/${mode.n}`].join(''));
  }
  pairVals.sort((x, y) => x - y);
  const med = pairVals[Math.floor(pairVals.length / 2)];
  console.log(`cift sayisi ${pairVals.length}  min ${pairVals[0]}  medyan ${med}  maks ${pairVals[pairVals.length - 1]}  ortalama ${mean(pairVals).toFixed(2)}`);
  const gvals = names.map((n) => overlap(tops.get(n), globalTop.slice(0, mode.n))).sort((a, b) => a - b);
  const gmed = gvals[Math.floor(gvals.length / 2)];
  console.log(`GLOBAL ile kesisim: min ${gvals[0]} medyan ${gmed} maks ${gvals[gvals.length - 1]}  ${mode.n === 10 && gmed < 3 ? '*** ALARM: medyan 3/10 ALTINDA ***' : '(alarm yok)'}`);
}

// --- 3) FILTRE BALONU: CBAM / anti-damping ---------------------------
console.log('\n== FILTRE BALONU KONTROLU ==');
const cbamIds = (await query(
  `SELECT DISTINCT a.id FROM articles a
     LEFT JOIN article_tags at ON at.article_id=a.id
     LEFT JOIN tags t ON t.id=at.tag_id
    WHERE a.is_duplicate=0 AND (t.slug IN ('cbam','anti-damping','karbon-fiyatlamasi')
      OR a.title LIKE '%CBAM%' OR a.title LIKE '%anti-damping%')`,
)).map((r) => Number(r.id));
console.log(`CBAM/anti-damping haberleri: ${cbamIds.length} -> ${cbamIds.join(',')}`);
for (const u of users) {
  const top10 = ranked.get(u.position_code).slice(0, 10);
  const hits = top10.filter((s) => cbamIds.includes(s.id));
  console.log(`${u.position_code.padEnd(26)} ilk10'da ${hits.length} tane: ${hits.map((h) => `#${h.id}(${h.is_pinned ? 'omurga' : 'kisisel'})`).join(' ') || '-'}`);
}

// --- 4) ORNEK: iki ucta ilk 5 baslik --------------------------------
for (const p of ['mevzuat-hukuk', 'tesvik-finansman', 'medya-iletisim']) {
  console.log(`\n-- ${p} ilk 8 --`);
  for (const s of ranked.get(p).slice(0, 8)) {
    console.log(`  ${s.is_pinned ? 'P' : ' '} ${String(s.final_score).padStart(6)} k=${String(s.personal_score).padStart(6)} g=${String(s.global_normalized).padStart(6)} #${s.id} ${bandById.get(s.id)} ${String(titleById.get(s.id)).slice(0, 62)}`);
  }
}

await pool.end();
