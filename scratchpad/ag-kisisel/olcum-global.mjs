// global_normalized OKUMASI: ham (0..100 zaten) mi, aday-kume min-max mi?
import { pool } from '/srv/projects/hackathon/backend/src/lib/db.js';
import { query } from '/srv/projects/hackathon/backend/src/lib/db.js';
import {
  loadProfile, tagSlugsByArticle, toScorableArticle, semanticRanks, loadCandidates,
} from '/srv/projects/hackathon/backend/src/services/personalize.js';
import {
  personalComponents, personalScore, WEIGHTS, GLOBAL_SHARE, PERSONAL_SHARE, THREAD_BONUS_MAX,
} from '/srv/projects/hackathon/backend/src/lib/personalRank.js';

const { rows } = await loadCandidates('WHERE a.is_duplicate = 0', []);
const ids = rows.map((r) => Number(r.id));
const slugMap = await tagSlugsByArticle(ids);
const articles = rows.map((r) => toScorableArticle(r, slugMap.get(Number(r.id))));
const users = await query("SELECT u.id,p.position_code FROM users u JOIN user_profiles p ON p.user_id=u.id WHERE u.email LIKE 'olcum-%' ORDER BY p.position_code");

const scores = articles.map((a) => a.importanceScore);
const mn = Math.min(...scores), mx = Math.max(...scores);
const MODES = {
  ham: (v) => v,
  minmax: (v) => ((v - mn) / (mx - mn)) * 100,
};
function std(v) { const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); }
function overlap(a, b) { const s = new Set(b); return a.filter((x) => s.has(x)).length; }

const personalByUser = new Map();
for (const u of users) {
  const profile = await loadProfile(u.id, 'isov');
  const sem = await semanticRanks(profile.profile_vector, ids);
  personalByUser.set(u.position_code, articles.map((a) => personalScore(personalComponents(a, profile, {
    semanticRank: sem.ranks.has(a.id) ? sem.ranks.get(a.id) : null, semanticTotal: sem.total,
  }))));
}
console.log(`global ham sapma ${std(scores).toFixed(2)}   minmax sapma ${std(scores.map(MODES.minmax)).toFixed(2)}`);
const psAll = [...personalByUser.values()].flat();
console.log(`kisisel skor sapmasi (havuz) ${std(psAll).toFixed(2)}  aralik ${Math.min(...psAll).toFixed(1)}-${Math.max(...psAll).toFixed(1)}`);

for (const [mode, fn] of Object.entries(MODES)) {
  const g = scores.map(fn);
  const gi = GLOBAL_SHARE * std(g);
  const pi = PERSONAL_SHARE * std(psAll);
  console.log(`\n### global_normalized = ${mode}`);
  console.log(`  etki: global ${gi.toFixed(2)} vs kisisel ${pi.toFixed(2)}  -> oran ${(gi / pi).toFixed(2)}:1  (beyan edilen agirlik orani 1.63:1)`);
  const tops = new Map(); const topsUnpinned = new Map();
  for (const u of users) {
    const ps = personalByUser.get(u.position_code);
    const scored = articles.map((a, i) => {
      const gn = fn(a.importanceScore);
      let final = GLOBAL_SHARE * gn + PERSONAL_SHARE * ps[i];
      const pin = a.band === 'KRITIK';
      if (pin) final = Math.max(final, gn);
      return { id: a.id, final, pin: pin ? 1 : 0, published_at: a.published_at };
    }).sort((x, y) => (y.pin - x.pin) || (y.final - x.final) || (new Date(y.published_at) - new Date(x.published_at)) || (y.id - x.id));
    tops.set(u.position_code, scored.slice(0, 10).map((s) => s.id));
    topsUnpinned.set(u.position_code, scored.filter((s) => s.pin === 0).slice(0, 10).map((s) => s.id));
  }
  for (const [ad, m] of [['ilk10 tam', tops], ['ilk10 omurga haric', topsUnpinned]]) {
    const names = users.map((u) => u.position_code);
    const pv = [];
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) pv.push(overlap(m.get(names[i]), m.get(names[j])));
    pv.sort((a, b) => a - b);
    const mh = overlap(m.get('mevzuat-hukuk'), m.get('tesvik-finansman'));
    console.log(`  ${ad}: cift ortusme min ${pv[0]} medyan ${pv[Math.floor(pv.length / 2)]} maks ${pv[pv.length - 1]} | mevzuat-hukuk<->tesvik-finansman = ${mh}/10`);
  }
}
await pool.end();
