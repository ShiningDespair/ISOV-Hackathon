// ---------------------------------------------------------------------
// TEKILLESTIRME (dedup) KATMANI
//
// Ayni olayi 5 farkli ajans yazdiginda panelde 5 kart gormek istemiyoruz.
// Strateji uc kademeli:
//   1) url_hash        -> ayni link, kesin ayni kayit (INSERT asamasinda elenir)
//   2) content_hash    -> metin birebir ayni (ajans kopyala-yapistir)
//   3) simhash + jaccard -> "ayni olay, farkli kalem" (bulanik eslesme)
//
// Buradaki her fonksiyon saf: ayni girdi -> ayni cikti, DB dokunmaz.
// ---------------------------------------------------------------------
import crypto from 'node:crypto';

// --- sabitler ---------------------------------------------------------

/** Simhash uzerinde kabul edilen azami bit farki. */
export const DEFAULT_HAMMING_THRESHOLD = 12;
/** Baslik token'lari icin asgari Jaccard benzerligi. */
export const DEFAULT_JACCARD_THRESHOLD = 0.35;
/**
 * Yedek olculer.
 *
 * NEDEN GEREKLI: simhash kisa/ozgun yazilmis metinlerde gurultuludur.
 * Ayni olayi anlatan iki haber bagimsiz kalemlerden ciktiginda 15-25 bit
 * fark uretebiliyor (gercek veri uzerinde olculdu). Sadece hamming<=12
 * kuralina bakarsak ayni gunun ayni haberini 3 ayri kart olarak gosteririz.
 *
 * Cozum: baslik ortusmesi GUCLU oldugunda hamming esigini gevsetiyoruz.
 * Esikler gercek seed verisindeki cift dagilimina gore secildi:
 *   - dogru ciftler  : baslik jaccard 0.45..0.78
 *   - yanlis ciftler : 0.42 ve alti ("Almanya'da sanayi uretimi" vs
 *                      "Fransa'da sanayi uretimi" -> ayri olaylar)
 */
export const DEFAULT_BODY_JACCARD_THRESHOLD = 0.5;
export const STRONG_TITLE_JACCARD = 0.45;
export const RELAXED_HAMMING_THRESHOLD = 26;

const MASK64 = (1n << 64n) - 1n;

/**
 * Izleme/kampanya parametreleri: ayni habere farkli linklerden gelindiginde
 * URL'yi ayristirmasinlar diye atiliyorlar.
 */
const TRACKING_PARAM_PREFIXES = ['utm_', 'pk_', 'mtm_', 'hsa_', 'ga_'];
const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'dclid', 'msclkid', 'yclid', 'twclid', 'igshid',
  'mc_cid', 'mc_eid', 'ref', 'ref_src', 'ref_url', 'source', 'spm',
  '_ga', '_gl', 'xtor', 'cmpid', 'campaign_id', 'at_medium', 'at_campaign',
]);

/**
 * Turkce durak kelimeler — anlam tasimadiklari icin benzerlik olcumunden cikarilir.
 * Liste okunakli olsun diye aksanli yazilir; kullanilan kume normalize
 * (aksansiz) haliyle kurulur cunku tokenize() de aksansiz token uretir.
 */
const TR_STOPWORD_SOURCE = [
  've', 'ile', 'için', 'bir', 'bu', 'şu', 'o', 'olarak', 'olan', 'olduğu', 'oldu',
  'da', 'de', 'ta', 'te', 'ki', 'mi', 'mı', 'mu', 'mü', 'ise', 'ancak', 'ayrıca',
  'göre', 'kadar', 'sonra', 'önce', 'daha', 'çok', 'az', 'en', 'gibi', 'ama',
  'fakat', 'veya', 'ya', 'yani', 'her', 'hem', 'değil', 'diye', 'ne', 'niye',
  'çünkü', 'böyle', 'şöyle', 'öyle', 'bütün', 'tüm', 'bazı', 'kendi',
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'were',
];

/**
 * Turkce harfleri ASCII karsiliklarina indirger.
 * NEDEN: kaynaklarin bir kismi "Bütçe Çağrısı", bir kismi "Butce Cagrisi"
 * yaziyor. Katlamazsak ayni olayin iki anlatimi HIC ortak token paylasmaz
 * ve tekillestirme calismaz.
 */
export function foldTurkish(s) {
  return String(s)
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u');
}

export const TR_STOPWORDS = new Set(
  TR_STOPWORD_SOURCE.map((w) => foldTurkish(w.toLocaleLowerCase('tr'))),
);

// --- temel yardimcilar ------------------------------------------------

/** sha1 hex — sema CHAR(40) bekliyor. */
export function sha1(input) {
  return crypto.createHash('sha1').update(String(input), 'utf8').digest('hex');
}

/**
 * URL normalizasyonu:
 *  - protokol https'e sabitlenir (http/https ayni sayfadir)
 *  - www. atilir, host kucultulur
 *  - izleme parametreleri silinir, kalanlar alfabetik siralanir
 *  - fragment (#...) ve sondaki '/' atilir
 * Parse edilemeyen girdilerde ham string'e duseriz (veri kaybetmemek icin).
 */
export function normalizeUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';

  let u;
  try {
    u = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    return raw.toLowerCase().replace(/\/+$/, '');
  }

  const protocol = u.protocol === 'http:' || u.protocol === 'https:' ? 'https:' : u.protocol;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const port = u.port && u.port !== '80' && u.port !== '443' ? `:${u.port}` : '';

  const params = [];
  for (const [key, value] of u.searchParams.entries()) {
    const k = key.toLowerCase();
    if (TRACKING_PARAMS.has(k)) continue;
    if (TRACKING_PARAM_PREFIXES.some((p) => k.startsWith(p))) continue;
    params.push([key, value]);
  }
  params.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : (a[1] < b[1] ? -1 : 1)));
  const qs = params.length
    ? `?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}`
    : '';

  let path = u.pathname.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');

  return `${protocol}//${host}${port}${path}${qs}`;
}

/** url_hash = sha1(normalize(url)) — sema ile birebir. */
export function urlHash(url) {
  return sha1(normalizeUrl(url));
}

/**
 * Turkce-duyarli metin normalizasyonu.
 * DIKKAT: toLocaleLowerCase('tr') 'I' -> 'ı' ve 'İ' -> 'i' donusumunu dogru yapar;
 * duz toLowerCase() 'İSTANBUL' -> 'i̇stanbul' gibi bozuk cikti verir ve
 * ayni basligin iki farkli token setine ayrilmasina yol acar.
 */
export function normalizeText(s) {
  if (s === null || s === undefined) return '';
  // Sira onemli: once Turkce kucultme (I -> ı), sonra aksan katlama (ı -> i).
  // Ters sirada 'IĞDIR' -> 'igdir' yerine 'ıgdır' gibi tutarsiz sonuc cikar.
  return foldTurkish(
    String(s).normalize('NFC').toLocaleLowerCase('tr'),
  )
    // noktalama ve semboller -> bosluk
    .replace(/[^0-9a-z\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize edilmis metni anlamli token'lara ayirir (durak kelimeler atilir). */
export function tokenize(s, { minLength = 2, dropStopwords = true } = {}) {
  const norm = normalizeText(s);
  if (!norm) return [];
  return norm
    .split(' ')
    .filter((t) => t.length >= minLength)
    .filter((t) => !(dropStopwords && TR_STOPWORDS.has(t)));
}

/** content_hash = sha1(normalize(title + body)) — birebir kopyalari yakalar. */
export function contentHash(title, body) {
  return sha1(`${normalizeText(title)}\n${normalizeText(body)}`);
}

// --- simhash ----------------------------------------------------------

/** Token -> 64-bit imza (sha1'in ilk 8 bayti). */
function tokenHash64(token) {
  const digest = crypto.createHash('sha1').update(token, 'utf8').digest();
  let v = 0n;
  for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(digest[i]);
  return v & MASK64;
}

/**
 * 64-bit simhash. Token agirligi = frekans; sik gecen kelime imzayi daha cok
 * cekiyor, bu da "ayni konu" sinyalini guclendiriyor.
 * @returns {bigint}
 */
export function simhash64(tokens) {
  const list = Array.isArray(tokens) ? tokens : tokenize(tokens);
  if (list.length === 0) return 0n;

  const freq = new Map();
  for (const t of list) freq.set(t, (freq.get(t) || 0) + 1);

  const vector = new Array(64).fill(0);
  for (const [token, weight] of freq.entries()) {
    const h = tokenHash64(token);
    for (let i = 0; i < 64; i++) {
      const bit = (h >> BigInt(i)) & 1n;
      vector[i] += bit === 1n ? weight : -weight;
    }
  }

  let out = 0n;
  for (let i = 0; i < 64; i++) {
    if (vector[i] > 0) out |= (1n << BigInt(i));
  }
  return out & MASK64;
}

/**
 * Bir makalenin kanonik simhash'i.
 * Baslik `titleBoost` kez tekrarlanir: manset olayin kimligini govdeden daha
 * net tasidigi icin imzada agirligi yuksek olsun istiyoruz.
 * Seeder DB'ye bunu yazar, kumeleme ayni fonksiyonu kullanir -> tutarlilik.
 */
export function articleSimhash(title, body, { titleBoost = 2 } = {}) {
  const titleTokens = tokenize(title);
  const bodyTokens = tokenize(body);
  const tokens = [];
  for (let i = 0; i < Math.max(1, titleBoost); i++) tokens.push(...titleTokens);
  tokens.push(...bodyTokens);
  return simhash64(tokens);
}

/** BigInt popcount — 64 bit icin dongu yeterince hizli ve okunakli. */
export function hammingDistance(a, b) {
  let x = (toBigInt(a) ^ toBigInt(b)) & MASK64;
  let count = 0;
  while (x) {
    x &= x - 1n; // en sagdaki 1 bitini siler
    count++;
  }
  return count;
}

/** string | number | bigint -> bigint (DB'den string gelir). */
export function toBigInt(v) {
  if (typeof v === 'bigint') return v;
  if (v === null || v === undefined || v === '') return 0n;
  try {
    return BigInt(typeof v === 'number' ? Math.trunc(v) : String(v)) & MASK64;
  } catch {
    return 0n;
  }
}

/** Iki simhash esikten yakinsa "benzer" kabul edilir. */
export function areSimilar(a, b, threshold = DEFAULT_HAMMING_THRESHOLD) {
  return hammingDistance(a, b) <= threshold;
}

/** Yedek benzerlik olcusu: kesisim / birlesim. */
export function jaccard(setA, setB) {
  const a = setA instanceof Set ? setA : new Set(setA || []);
  const b = setB instanceof Set ? setB : new Set(setB || []);
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const v of small) if (large.has(v)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// --- kumeleme ---------------------------------------------------------

/** Union-Find (path compression + union by size) — O(n·α) birlestirme. */
class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.size = new Array(n).fill(1);
  }
  find(x) {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[x] !== root) {
      const next = this.parent[x];
      this.parent[x] = root;
      x = next;
    }
    return root;
  }
  union(a, b) {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return false;
    if (this.size[ra] < this.size[rb]) [ra, rb] = [rb, ra];
    this.parent[rb] = ra;
    this.size[ra] += this.size[rb];
    return true;
  }
}

/** Kume anahtari: uyelerin url_hash'leri siralanip sha1'lenir -> deterministik. */
export function clusterKeyOf(urlHashes) {
  const sorted = [...urlHashes].filter(Boolean).map(String).sort();
  return sha1(sorted.join('\n'));
}

/**
 * Kume temsilcisini secer:
 *   1) en yuksek authority_weight (en guvenilir kaynak)
 *   2) esitlikte en uzun body (en doyurucu metin)
 *   3) yine esitlikte url_hash alfabetik (determinizm icin)
 */
export function pickRepresentative(members) {
  return [...members].sort((a, b) => {
    const aw = Number(a.authority_weight ?? 0);
    const bw = Number(b.authority_weight ?? 0);
    if (bw !== aw) return bw - aw;
    const al = String(a.body ?? '').length;
    const bl = String(b.body ?? '').length;
    if (bl !== al) return bl - al;
    return String(a.url_hash ?? '') < String(b.url_hash ?? '') ? -1 : 1;
  })[0];
}

/**
 * Haberleri "ayni olay" kumelerine ayirir.
 *
 * @param {Array<object>} articles  {id, url_hash, title, body, content_hash,
 *                                   simhash, authority_weight, published_at}
 * @param {object} [opts]
 * @param {number} [opts.hammingThreshold=12]
 * @param {number} [opts.jaccardThreshold=0.35]
 * @param {number} [opts.bodyJaccardThreshold=0.5]
 * @param {number} [opts.strongTitleJaccard=0.45]
 * @param {number} [opts.relaxedHamming=26]
 * @returns {Array<{cluster_key, members, representative, member_count}>}
 */
export function clusterArticles(articles, opts = {}) {
  const hammingThreshold = Number(opts.hammingThreshold ?? DEFAULT_HAMMING_THRESHOLD);
  const jaccardThreshold = Number(opts.jaccardThreshold ?? DEFAULT_JACCARD_THRESHOLD);
  const bodyJaccardThreshold = Number(opts.bodyJaccardThreshold ?? DEFAULT_BODY_JACCARD_THRESHOLD);
  const strongTitleJaccard = Number(opts.strongTitleJaccard ?? STRONG_TITLE_JACCARD);
  const relaxedHamming = Number(opts.relaxedHamming ?? RELAXED_HAMMING_THRESHOLD);

  const list = Array.isArray(articles) ? articles : [];
  const n = list.length;
  if (n === 0) return [];

  // Her makale icin hesap bir kez yapilir; O(n^2) karsilastirmada tekrar etmesin.
  const prepared = list.map((a) => {
    const titleTokens = new Set(tokenize(a.title));
    const bodyTokens = new Set(tokenize(a.body));
    const sim = a.simhash !== undefined && a.simhash !== null && a.simhash !== ''
      ? toBigInt(a.simhash)
      : articleSimhash(a.title, a.body);
    const ch = a.content_hash || contentHash(a.title, a.body);
    const sourceId = a.source_id ?? null;
    return { article: a, titleTokens, bodyTokens, simhash: sim, content_hash: ch, sourceId };
  });

  const uf = new UnionFind(n);

  // 1) content_hash birebir esitligi — en guclu sinyal, once uygulanir.
  const byContent = new Map();
  prepared.forEach((p, i) => {
    if (!p.content_hash) return;
    if (byContent.has(p.content_hash)) uf.union(byContent.get(p.content_hash), i);
    else byContent.set(p.content_hash, i);
  });

  // 2) Bulanik eslesme: simhash yakin VE baslik ortusmesi yeterli.
  //    Iki kosul birlikte araniyor cunku tek basina simhash kisa basliklarda,
  //    tek basina jaccard ise ortak jargonda (or. "KDV") yanlis pozitif uretiyor.
  const pairs = candidatePairs(prepared, hammingThreshold);
  for (const [i, j] of pairs) {
    if (uf.find(i) === uf.find(j)) continue;
    const a = prepared[i];
    const b = prepared[j];
    if (a.simhash === 0n || b.simhash === 0n) continue;

    const titleSim = jaccard(a.titleTokens, b.titleTokens);
    // Baslik ortusmesi taban sart: bu saglanmadan hicbir yol kume acmaz.
    if (titleSim < jaccardThreshold) continue;

    const distance = hammingDistance(a.simhash, b.simhash);

    // 1) CONTRACT kurali: simhash cok yakin + baslik ortusuyor.
    const byContract = distance <= hammingThreshold;
    // 2) Baslik ortusmesi cok guclu; simhash'e daha genis tolerans.
    //    SADECE FARKLI KAYNAKLAR arasinda: kumeleme "kac bagimsiz kaynak
    //    dogruladi" sorusunu yanitlar; ayni kaynagin iki ayri yazisini
    //    gevsetilmis esikle birlestirmek yanlis pozitif uretiyor
    //    (or. EUR-Lex'in iki farkli damping sorusturmasi ilani).
    const differentSource = a.sourceId === null || b.sourceId === null
      || a.sourceId !== b.sourceId;
    const byStrongTitle = differentSource
      && titleSim >= strongTitleJaccard
      && distance <= relaxedHamming;
    // 3) Govde neredeyse ayni metin (kopyala-yapistir yeniden yayin).
    const byBody = jaccard(a.bodyTokens, b.bodyTokens) >= bodyJaccardThreshold;

    if (!byContract && !byStrongTitle && !byBody) continue;

    uf.union(i, j);
  }

  // 3) Kokleri toparla.
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(list[i]);
  }

  const clusters = [];
  for (const members of groups.values()) {
    const key = clusterKeyOf(members.map((m) => m.url_hash || urlHash(m.url)));
    clusters.push({
      cluster_key: key,
      members,
      representative: pickRepresentative(members),
      member_count: members.length,
    });
  }

  // Deterministik sira: anahtar alfabetik.
  clusters.sort((a, b) => (a.cluster_key < b.cluster_key ? -1 : 1));
  return clusters;
}

/**
 * Karsilastirilacak cift listesi.
 * Kucuk veri setinde (hackathon olcegi) tam tarama en dogrusu; buyudugunde
 * 4x16-bit bantli LSH ile aday kumesi daraltiliyor.
 */
function candidatePairs(prepared, hammingThreshold) {
  const n = prepared.length;
  const pairs = [];

  if (n <= 1500) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) pairs.push([i, j]);
    }
    return pairs;
  }

  // Bantli LSH: 12 bit fark 4 banda dagilsa bile en az bir bant genelde ayni kalir.
  const bands = 4;
  const bandBits = 16n;
  const seen = new Set();
  for (let b = 0; b < bands; b++) {
    const buckets = new Map();
    for (let i = 0; i < n; i++) {
      const key = `${b}:${(prepared[i].simhash >> (BigInt(b) * bandBits)) & 0xffffn}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(i);
    }
    for (const idxs of buckets.values()) {
      if (idxs.length < 2 || idxs.length > 400) continue;
      for (let x = 0; x < idxs.length; x++) {
        for (let y = x + 1; y < idxs.length; y++) {
          const key = `${idxs[x]}-${idxs[y]}`;
          if (seen.has(key)) continue;
          seen.add(key);
          pairs.push([idxs[x], idxs[y]]);
        }
      }
    }
  }
  void hammingThreshold; // esik dogrulamasi cagiran tarafta yapiliyor
  return pairs;
}
