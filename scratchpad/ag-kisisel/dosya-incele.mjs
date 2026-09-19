// DOSYA TESPITI ELLE INCELEME DOKUMU
import { pool, query } from '/srv/projects/hackathon/backend/src/lib/db.js';
import { refCodesOf } from '/srv/projects/hackathon/backend/src/lib/refCodes.js';
import { GENERIC_ANCHORS, ANCHOR_MIN_WEIGHT, evaluatePair, DEFAULT_THREAD_COSINE } from '/srv/projects/hackathon/backend/src/services/topicThreads.js';
import { buildEmbeddingText, embed } from '/srv/projects/hackathon/backend/src/services/embeddings.js';
import * as vs from '/srv/projects/hackathon/backend/src/services/vectorStore.js';

const rows = await query(`SELECT a.id,a.title,a.summary,a.body,a.published_at,a.source_id,s.slug src
  FROM articles a JOIN sources s ON s.id=a.source_id WHERE a.is_duplicate=0 ORDER BY a.id`);
const tagRows = await query(`SELECT at.article_id,t.slug,t.weight FROM article_tags at JOIN tags t ON t.id=at.tag_id WHERE t.weight >= ?`,[ANCHOR_MIN_WEIGHT]);
const anchors = new Map();
for (const r of tagRows) { if (GENERIC_ANCHORS.has(r.slug)) continue; if(!anchors.has(+r.article_id)) anchors.set(+r.article_id,new Set()); anchors.get(+r.article_id).add(r.slug); }
const refs = new Map(rows.map(r=>[+r.id, refCodesOf(r)]));
const byId = new Map(rows.map((r,i)=>[+r.id,i]));

const emb = await embed(rows.map(buildEmbeddingText));
const cos = new Map();
for (let i=0;i<rows.length;i++){
  const res = await vs.searchNeighbors(emb.vectors[i],{limit:15,scoreThreshold:DEFAULT_THREAD_COSINE});
  for(const h of res.hits){ const j=byId.get(h.id); if(j===undefined||j===i) continue; const k=i<j?`${i}-${j}`:`${j}-${i}`; cos.set(k,Math.max(cos.get(k)??0,h.score)); }
}

// tum kenarlar
const edges=[];
for(let i=0;i<rows.length;i++) for(let j=i+1;j<rows.length;j++){
  const k=`${i}-${j}`;
  const v = evaluatePair({cosine: cos.has(k)?cos.get(k):null, anchorsA:anchors.get(+rows[i].id)??new Set(), anchorsB:anchors.get(+rows[j].id)??new Set(), refsA:refs.get(+rows[i].id), refsB:refs.get(+rows[j].id), threshold:DEFAULT_THREAD_COSINE});
  if(v.score>=2) edges.push({i,j,...v,sim:cos.get(k)??null});
}
// union-find
const par=Array.from({length:rows.length},(_,i)=>i);
const find=x=>{while(par[x]!==x)x=par[x];return x};
for(const e of edges){const a=find(e.i),b=find(e.j); if(a!==b)par[b]=a;}
const groups=new Map();
for(let i=0;i<rows.length;i++){const r=find(i); if(!groups.has(r))groups.set(r,[]); groups.get(r).push(i);}

console.log(`kenar sayisi: ${edges.length}`);
let gi=0;
for(const g of groups.values()){
  if(g.length<2) continue; gi++;
  console.log(`\n### GRUP ${gi} — ${g.length} uye ${g.length>12?'(ASIRI BUYUK, ATLANDI)':''}`);
  for(const i of g){
    const r=rows[i];
    console.log(`  #${r.id} [${r.src}] ${new Date(r.published_at).toISOString().slice(0,10)} ${String(r.title).slice(0,78)}`);
    console.log(`      capa=[${[...(anchors.get(+r.id)??[])].join(',')}] ref=[${[...refs.get(+r.id)].join(',')}]`);
  }
  console.log('  -- kenarlar --');
  for(const e of edges) if(g.includes(e.i)&&g.includes(e.j))
    console.log(`     #${rows[e.i].id}<->#${rows[e.j].id} skor=${e.score} kos=${e.sim?e.sim.toFixed(4):'-'} capa=[${e.anchor.join(',')}] ref=[${e.refs.join(',')}]`);
}
await pool.end();
