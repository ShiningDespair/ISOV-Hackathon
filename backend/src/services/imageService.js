// ---------------------------------------------------------------------
// HABER GORSELI TOPLAYICI
//
// Haber sayfasinin <head> bolumunden kapak gorselini cikarir:
//   1) <meta property="og:image" content="...">      -> 'og'
//   2) <meta name="twitter:image" content="...">     -> 'twitter'
//   3) <link rel="image_src" href="...">             -> 'link'
//
// Tasarim kararlari:
// * Bagimlilik YOK. cheerio/jsdom gibi bir HTML ayristiricisi tek bir
//   meta etiketi icin fazla agir; <head> icindeki meta etiketleri duz
//   metin taramasiyla guvenle bulunabiliyor.
// * Oznitelik SIRASI serbest. Once `<meta ...>` etiketinin tamami
//   yakalanir, sonra o etiketin icinden `property`/`name` ve `content`
//   ayri ayri okunur. Boylece hem `property="og:image" content="..."`
//   hem de `content="..." property="og:image"` yazimi calisir.
// * ASLA hata firlatmaz. Ag hatasi, DNS hatasi, 404, zaman asimi, gecersiz
//   HTML -> hepsi {image_url:null, image_source:'yok'} doner. Gorsel bir
//   susleme; sistem gorsel olmadan da tam calismak ZORUNDA.
// ---------------------------------------------------------------------

/** Istek zaman asimi (ms). Yavas kaynak tum toplu isi kilitlemesin. */
export const FETCH_TIMEOUT_MS = Number(process.env.IMAGE_FETCH_TIMEOUT_MS || 8000);

/** Yalnizca <head> gerekli; 256 KB fazlasiyla yeterli, gerisi indirilmez. */
export const MAX_HTML_BYTES = Number(process.env.IMAGE_MAX_HTML_BYTES || 256 * 1024);

/** Kimligimizi acikca bildiriyoruz; User-Agent'siz istekleri cok site reddediyor. */
export const USER_AGENT = process.env.IMAGE_USER_AGENT
  || 'Mozilla/5.0 (compatible; ISOV-HaberBot/1.0; +https://hackathon.dhsyazilim.com)';

/** articles.image_url VARCHAR(1000) — daha uzun URL'yi kirpmak yerine reddediyoruz. */
const MAX_URL_LENGTH = 1000;

/** Bulunamadi yaniti — tek yerden uretiliyor ki sekil her yolda ayni olsun. */
function bulunamadi(error = null) {
  return { image_url: null, image_source: 'yok', error };
}

/**
 * Bir HTML etiketinin icinden tek bir ozniteligi okur.
 * Cift tirnak, tek tirnak ve tirnaksiz yazimi destekler.
 */
function attr(tag, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i');
  const m = re.exec(tag);
  if (!m) return null;
  const raw = m[2] ?? m[3] ?? m[4] ?? '';
  return decodeEntities(raw.trim());
}

/** URL'lerde gecen az sayidaki HTML varligini cozer (&amp; en sik olani). */
function decodeEntities(value) {
  return String(value)
    .replace(/&amp;/gi, '&')
    .replace(/&#38;/g, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

/**
 * Aranan meta/link adaylari — SIRA = ONCELIK.
 * og:image ilk sirada cunku sosyal medya kartlari icin ozellikle secilmis,
 * en buyuk cozunurluklu gorsel oradadir.
 */
const META_CANDIDATES = [
  { keys: ['og:image', 'og:image:secure_url', 'og:image:url'], source: 'og' },
  { keys: ['twitter:image', 'twitter:image:src'], source: 'twitter' },
];

/**
 * HTML metninden gorsel adayini cikarir.
 * @param {string} html
 * @returns {{value:string, source:'og'|'twitter'|'link'}|null}
 */
export function extractImageCandidate(html) {
  if (!html) return null;

  // <head> varsa yalnizca orayi tara: govdedeki kullanici icerigi
  // (yorumlar, gomulu tweet'ler) yanlis eslesme uretebilir.
  const headEnd = html.search(/<\/head\s*>/i);
  const scope = headEnd > 0 ? html.slice(0, headEnd) : html;

  // Tum meta etiketlerini topla; oznitelik sirasindan bagimsiz oku.
  const metas = scope.match(/<meta\b[^>]*>/gi) || [];
  const bulunan = new Map(); // anahtar -> icerik

  for (const tag of metas) {
    const key = (attr(tag, 'property') || attr(tag, 'name') || '').toLowerCase();
    if (!key) continue;
    const content = attr(tag, 'content') || attr(tag, 'value');
    if (!content) continue;
    if (!bulunan.has(key)) bulunan.set(key, content);
  }

  for (const { keys, source } of META_CANDIDATES) {
    for (const key of keys) {
      const value = bulunan.get(key);
      if (value) return { value, source };
    }
  }

  // Son care: eski tarz <link rel="image_src" href="...">
  const links = scope.match(/<link\b[^>]*>/gi) || [];
  for (const tag of links) {
    const rel = (attr(tag, 'rel') || '').toLowerCase();
    if (!/\bimage_src\b/.test(rel)) continue;
    const href = attr(tag, 'href');
    if (href) return { value: href, source: 'link' };
  }

  return null;
}

/**
 * Bulunan degeri mutlak, guvenli bir http(s) URL'sine cevirir.
 * Gecersizse null doner.
 * @param {string} found   sayfadan okunan ham deger (goreli olabilir)
 * @param {string} pageUrl cozumleme tabani (yonlendirme sonrasi son URL)
 */
export function resolveImageUrl(found, pageUrl) {
  const raw = String(found || '').trim();
  if (!raw) return null;
  // data: URI kabul edilmiyor — DB'yi sisirir, CDN'e tasinamaz.
  if (/^data:/i.test(raw)) return null;

  let abs;
  try {
    abs = new URL(raw, pageUrl);
  } catch {
    return null;
  }
  // Yalnizca http(s). javascript:, file:, ftp: vb. reddedilir.
  if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return null;

  const out = abs.toString();
  // Kolon siniri 1000; kirpilmis URL bozuk URL'dir, o yuzden reddediyoruz.
  if (out.length > MAX_URL_LENGTH) return null;
  return out;
}

/**
 * Yanit govdesinin yalnizca ilk `maxBytes` baytini okur.
 * Tum sayfayi indirmemek icin akis (stream) erken iptal edilir.
 */
async function readFirstBytes(response, maxBytes) {
  const body = response.body;
  if (!body || typeof body.getReader !== 'function') {
    // Cok eski/ozel bir fetch uygulamasinda akis yoksa tamamini al.
    const text = await response.text();
    return text.slice(0, maxBytes * 2);
  }

  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let okunan = 0;
  let out = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      okunan += value.byteLength;
      out += decoder.decode(value, { stream: true });
      if (okunan >= maxBytes) break;
    }
    out += decoder.decode();
  } finally {
    // Baglantiyi serbest birak; kalan baytlar indirilmez.
    try { await reader.cancel(); } catch { /* yoksay */ }
  }
  return out;
}

/**
 * Haber sayfasindan kapak gorselini bulur.
 *
 * @param {string} url haber sayfasinin adresi
 * @returns {Promise<{image_url:string|null, image_source:'og'|'twitter'|'link'|'yok', error:string|null}>}
 *          Basarisizlik da dahil HER durumda cozulur; hata FIRLATMAZ.
 */
export async function fetchArticleImage(url) {
  const hedef = String(url || '').trim();
  if (!hedef) return bulunamadi('URL boş');

  let parsed;
  try {
    parsed = new URL(hedef);
  } catch {
    return bulunamadi('Geçersiz URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return bulunamadi('Yalnızca http/https desteklenir');
  }

  let response;
  try {
    response = await fetch(hedef, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        'Accept-Language': 'tr,en;q=0.8',
      },
    });
  } catch (err) {
    // DNS hatasi, TLS hatasi, baglanti reddi, zaman asimi...
    const ad = err?.name === 'TimeoutError' || err?.name === 'AbortError'
      ? 'Zaman aşımı'
      : (err?.cause?.code || err?.code || err?.message || 'Ağ hatası');
    return bulunamadi(String(ad));
  }

  if (!response.ok) {
    // Govdeyi bosalt ki baglanti sizmasin.
    try { await response.body?.cancel(); } catch { /* yoksay */ }
    return bulunamadi(`HTTP ${response.status}`);
  }

  // HTML olmayan yanitlar (PDF, JSON, resim) ayristirilmaz. Resmî Gazete'nin
  // PDF baglantilari bu yoldan sessizce atlanir.
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType && !/text\/html|application\/xhtml\+xml/.test(contentType)) {
    try { await response.body?.cancel(); } catch { /* yoksay */ }
    return bulunamadi(`İçerik türü HTML değil: ${contentType.split(';')[0]}`);
  }

  let html;
  try {
    html = await readFirstBytes(response, MAX_HTML_BYTES);
  } catch (err) {
    return bulunamadi(`Gövde okunamadı: ${err?.message || 'bilinmeyen'}`);
  }

  const aday = extractImageCandidate(html);
  if (!aday) return bulunamadi(null); // sayfa okundu, gorsel yok — hata degil

  // Taban: yonlendirme sonrasi ulasilan gercek adres (response.url).
  const taban = response.url || hedef;
  const mutlak = resolveImageUrl(aday.value, taban);
  if (!mutlak) return bulunamadi(null);

  return { image_url: mutlak, image_source: aday.source, error: null };
}

export default { fetchArticleImage, extractImageCandidate, resolveImageUrl };
