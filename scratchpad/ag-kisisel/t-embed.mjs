import { embed, describe } from '../../backend/src/services/embeddings.js';
const t0 = Date.now();
const d = await describe();
console.log('describe', d, `${Date.now()-t0}ms`);
const t1 = Date.now();
const texts = Array.from({length: 20}, (_,i)=>`Deneme metni ${i}: Resmî Gazete'de yayımlanan tebliğ ile ihracat destekleri güncellendi.`);
const r = await embed(texts);
console.log('embed 20', r.available, r.vectors.length, r.dim, `${Date.now()-t1}ms`);
