// ---------------------------------------------------------------------
// KAYNAK AMBLEM TASARIM SİSTEMİ (docs/SADELESTIRME.md §5)
//
// Bu dosya BİLİNÇLİ olarak saftır: React yok, DOM yok, ağ/dosya erişimi yok,
// "şu an" okuması yok. Yalnızca girdi → çıktı. Sebep, projede zaten kurulu
// olan desen: `backend/src/lib/positions.js` ve `importance.js` de karar
// veren mantığı render'dan ayırıyor. Böylece (a) birim testi yazılabilir,
// (b) sunucu render'ı ile istemci render'ı BİREBİR aynı çıktıyı verir, yani
// hydration uyuşmazlığı olmaz, (c) 81 kaynağın tamamı bir betikle taranıp
// hangi kademeye düştüğü ölçülebilir.
//
// Sözleşme kuralları (§0):
//   - Hiçbir fonksiyon exception fırlatmaz; eksik veri dönüş değerinde taşınır.
//   - Sayı UYDURULMAZ. Resmî Gazete sayısı bulunamazsa tarih basılır.
//   - Her kaynak MUTLAKA bir kademeye düşer; boş kutu YOK.
// ---------------------------------------------------------------------

// =====================================================================
// 1. PALET — yalnızca @theme jetonlarından türer
// =====================================================================
//
// Yeni marka rengi ICAT EDİLMEZ: kullanıcı New York Times esinli kısıtlı
// paleti (kâğıt / mürekkep / tek bordo vurgu) beğendi, renkli bir kolaj
// istemiyor. Ton farkı `color-mix()` ile yapılıyor. Jetonlar üzerinden
// gitmenin ikinci faydası: erişilebilirlik temaları (koyu, yüksek kontrast,
// renk körlüğü paletleri) `--color-*` değişkenlerini değiştirdiğinde
// amblemler de otomatik olarak birlikte değişir, sabit hex kalmaz.

const KAGIT = "var(--color-paper)";
const KAGIT_DERIN = "var(--color-paper-deep)";
const MUREKKEP = "var(--color-ink)";
const MUREKKEP_YUMUSAK = "var(--color-ink-soft)";
const MUREKKEP_SOLUK = "var(--color-ink-faint)";
const KURAL = "var(--color-rule)";
const KURAL_GUCLU = "var(--color-rule-strong)";
const VURGU = "var(--color-accent)";

/** `color-mix()` kısaltması — palet tablosu okunur kalsın. */
function karisim(renk: string, oran: number, taban: string): string {
  return `color-mix(in srgb, ${renk} ${oran}%, ${taban})`;
}

export interface SourcePalette {
  /** Amblem zemini. */
  zemin: string;
  /** Çerçeve ve kural çizgileri. */
  cerceve: string;
  /** Birincil metin / işaret. */
  murekkep: string;
  /** İkincil metin (üst ve alt satır). */
  ikincil: string;
  /** Tek vurgu — ince bir çizgi ya da mühür halkası. */
  vurgu: string;
  /** Motif çizgileri (ızgara, kolon kuralı, meridyen) için soluk ton. */
  motif: string;
}

/**
 * Altı palet. Beşi açık (kâğıt tonları), biri ters (mürekkep zemin).
 * Ters palet kasıtlı olarak SEYREK: `PALET_YUVALARI` tablosu 12 yuvadan
 * yalnızca birini ona veriyor, böylece ızgarada bir ritim oluşuyor ama
 * sayfa satranç tahtasına dönmüyor.
 */
const PALETLER: SourcePalette[] = [
  {
    zemin: KAGIT_DERIN,
    cerceve: KURAL_GUCLU,
    murekkep: MUREKKEP,
    ikincil: MUREKKEP_YUMUSAK,
    vurgu: VURGU,
    motif: KURAL,
  },
  {
    zemin: karisim(MUREKKEP, 6, KAGIT_DERIN),
    cerceve: MUREKKEP,
    murekkep: MUREKKEP,
    ikincil: MUREKKEP_YUMUSAK,
    vurgu: VURGU,
    motif: karisim(MUREKKEP, 18, KAGIT_DERIN),
  },
  {
    zemin: karisim(MUREKKEP, 12, KAGIT_DERIN),
    cerceve: MUREKKEP,
    murekkep: MUREKKEP,
    ikincil: MUREKKEP_YUMUSAK,
    vurgu: VURGU,
    motif: karisim(MUREKKEP, 26, KAGIT_DERIN),
  },
  {
    zemin: karisim(VURGU, 7, KAGIT_DERIN),
    cerceve: karisim(VURGU, 45, KURAL),
    murekkep: MUREKKEP,
    ikincil: MUREKKEP_YUMUSAK,
    vurgu: VURGU,
    motif: karisim(VURGU, 22, KAGIT_DERIN),
  },
  {
    zemin: KAGIT,
    cerceve: MUREKKEP,
    murekkep: MUREKKEP,
    ikincil: MUREKKEP_SOLUK,
    vurgu: VURGU,
    motif: KURAL,
  },
  {
    // Ters palet: mürekkep zemin, kâğıt yazı. Jetonlar üzerinden gittiği
    // için koyu temada da doğru tarafa döner (ink açılır, paper koyulaşır).
    zemin: MUREKKEP,
    cerceve: karisim(KAGIT, 40, MUREKKEP),
    murekkep: KAGIT,
    ikincil: karisim(KAGIT, 62, MUREKKEP),
    vurgu: karisim(VURGU, 70, KAGIT),
    motif: karisim(KAGIT, 26, MUREKKEP),
  },
];

/** 12 yuva → palet indeksi. Ters palet (5) yalnızca bir yuvada. */
const PALET_YUVALARI = [0, 1, 2, 3, 4, 0, 1, 2, 3, 5, 0, 4];

/**
 * Deterministik slug karması (FNV-1a benzeri). Aynı slug HER ZAMAN aynı
 * paleti ve aynı motif varyasyonunu alır — sunucuda da, istemcide de.
 */
export function slugTohumu(anahtar: string): number {
  let h = 2166136261;
  const s = String(anahtar ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Math.imul işaretli 32 bit döner; mutlak değer alıp sabit aralığa indiriyoruz.
  return Math.abs(h) % 1000;
}

function paletSec(tohum: number): SourcePalette {
  return PALETLER[PALET_YUVALARI[tohum % PALET_YUVALARI.length]];
}

// =====================================================================
// 2. AD / MONOGRAM TÜRETME
// =====================================================================

/**
 * Türkçe büyük harf dönüşümü SADECE Türkçe adlarda uygulanır.
 * Sebep: `"Investing".toLocaleUpperCase("tr-TR")` → "INVESTİNG" (noktalı İ).
 * İngilizce kaynak adlarında bu yanlış; Türkçe adlarda ise ("İstanbul" → "İS")
 * zorunlu. Ayrım ülke kodundan ve addaki Türkçeye özgü harflerden yapılıyor.
 */
export function turkceMi(ad: string, ulkeKodu?: string | null): boolean {
  if (String(ulkeKodu ?? "").toUpperCase() === "TR") return true;
  return /[ğĞşŞıİçÇöÖüÜ]/.test(String(ad ?? ""));
}

function buyukHarf(s: string, turkce: boolean): string {
  return turkce ? s.toLocaleUpperCase("tr-TR") : s.toLocaleUpperCase("en-US");
}

/**
 * Kaynağın kendi adını uzun açıklamasından ayırır:
 *   "TÜBİTAK - Türkiye Bilimsel ve Teknolojik Araştırma Kurumu" → "TÜBİTAK"
 *   "Ekonomim (Dünya Gazetesi Dijital)"                        → "Ekonomim"
 *   "EUR-Lex / AB Resmî Gazetesi"                              → "EUR-Lex"
 * Ayırıcı olarak BOŞLUKLU tire aranıyor; "EUR-Lex" ve "e-İhracat" bozulmasın.
 */
export function temelAd(ad: string): string {
  let s = String(ad ?? "").trim();
  s = s.split(/\s+[-–—]\s+/)[0];
  s = s.split(/\s*\(/)[0];
  s = s.split(/\s+\/\s+/)[0];
  return s.replace(/\s+/g, " ").trim();
}

/** Baş harf üretiminde anlam taşımayan bağlaçlar. */
const DURAK_KELIMELER = new Set([
  "the", "of", "and", "for", "a", "an", "on", "in",
  "de", "der", "die", "das", "des", "la", "le", "el", "il", "los", "las",
  "ve", "ile", "için", "ait", "bir",
]);

/**
 * Amblemde basılacak işaret. Sıra:
 *   1. Ad zaten bir kısaltmaysa onu olduğu gibi kullan ("KOSGEB", "TOBB", "TSE").
 *   2. Değilse anlamlı ilk iki kelimenin baş harfi ("İstanbul Sanayi Odası" → "İS").
 *   3. Tek kelimeyse ilk iki harf ("Bloomberg" → "BL").
 *   4. Hiçbiri yoksa yedek metin, o da yoksa "?" (boş kutu YOK).
 *
 * Mevcut `ArticleImage.initialsOf` mantığı burada genelleştirildi; oradaki
 * `toLocaleUpperCase("tr-TR")` davranışı korunuyor ama artık yalnızca
 * Türkçe adlara uygulanıyor (bkz. `turkceMi`).
 */
export function monogramTuret(
  ad: string,
  ulkeKodu?: string | null,
  yedek = "",
): string {
  const turkce = turkceMi(ad, ulkeKodu);
  // ".com" / ".org" gibi alan adı kuyruğu monogramda gürültü:
  // "MINING.COM" → "MINING", "Investing.com" → "Investing".
  const taban = temelAd(ad).replace(/\.(com|net|org|gov|co|io|eu|tr)\b/gi, "");

  const ilkKelime = (taban.split(/\s+/)[0] ?? "").replace(/[.'’`]/g, "");
  if (/^[\p{Lu}\p{N}]{2,7}$/u.test(ilkKelime)) return ilkKelime;

  const kelimeler = taban
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);

  const anlamli = kelimeler.filter(
    (w) => w.length > 1 && !DURAK_KELIMELER.has(w.toLowerCase()),
  );
  const secilen = anlamli.length > 0 ? anlamli : kelimeler;

  if (secilen.length === 0) {
    const y = String(yedek ?? "").replace(/[^\p{L}\p{N}]+/gu, "");
    return y.length > 0 ? buyukHarf(y.slice(0, 2), turkce) : "?";
  }
  if (secilen.length === 1) return buyukHarf(secilen[0].slice(0, 2), turkce);
  return buyukHarf(secilen[0][0] + secilen[1][0], turkce);
}

/**
 * Amblem başlığı: kaynağın kendi adı, büyük harfle, gerekiyorsa kısaltılmış.
 * Kırpma kelime sınırından yapılır; üç nokta BASILMAZ (gazete logosunda
 * üç nokta olmaz, küçülen punto zaten taşmayı çözüyor).
 */
export function kisaAdTuret(
  ad: string,
  ulkeKodu?: string | null,
  enFazla = 30,
): string {
  const turkce = turkceMi(ad, ulkeKodu);
  const taban = temelAd(ad);
  if (taban.length === 0) return "KAYNAK BELİRTİLMEMİŞ";
  const buyuk = buyukHarf(taban, turkce);
  if (buyuk.length <= enFazla) return buyuk;
  const kesik = buyuk.slice(0, enFazla);
  const bosluk = kesik.lastIndexOf(" ");
  return (bosluk > enFazla * 0.5 ? kesik.slice(0, bosluk) : kesik).trim();
}

// =====================================================================
// 3. ÜLKE ETİKETLERİ
// =====================================================================
//
// Alt satırda ham ISO kodu ("BR") yerine okunur ad basılıyor. Listede
// yalnızca veritabanında GERÇEKTEN bulunan kodlar var; bilinmeyen kod
// olduğu gibi (büyük harf) basılır — uydurma yapılmaz.

const ULKE_ADI: Record<string, string> = {
  TR: "TÜRKİYE",
  US: "ABD",
  EU: "AVRUPA BİRLİĞİ",
  GB: "BİRLEŞİK KRALLIK",
  DE: "ALMANYA",
  FR: "FRANSA",
  IT: "İTALYA",
  NL: "HOLLANDA",
  BE: "BELÇİKA",
  CH: "İSVİÇRE",
  CY: "KIBRIS",
  CA: "KANADA",
  BR: "BREZİLYA",
  KR: "GÜNEY KORE",
  CN: "ÇİN",
  HK: "HONG KONG",
  TW: "TAYVAN",
  AU: "AVUSTRALYA",
  AE: "BAE",
};

export function ulkeEtiketi(kod?: string | null): string | null {
  const k = String(kod ?? "").trim().toUpperCase();
  if (k.length === 0) return null;
  return ULKE_ADI[k] ?? k;
}

// =====================================================================
// 4. MOTİFLER VE ARKETİPLER (kademe 2)
// =====================================================================

export type SourceMotif =
  | "mevzuat"
  | "kurum"
  | "acik_veri"
  | "basin"
  | "uluslararasi"
  | "monogram";

/** `sources.source_type` → görsel dil. Altı tür, altı ayrı motif. */
const ARKETIP: Record<string, SourceMotif> = {
  mevzuat: "mevzuat",
  kurum: "kurum",
  acik_veri: "acik_veri",
  basin: "basin",
  uluslararasi: "uluslararasi",
  diger: "monogram",
};

/** Arketip kickerı — motif tek başına bilgi taşımasın (§0.5). */
const TUR_ETIKETI: Record<string, string> = {
  mevzuat: "MEVZUAT",
  kurum: "KURUM",
  acik_veri: "AÇIK VERİ",
  basin: "BASIN",
  uluslararasi: "ULUSLARARASI",
  diger: "KAYNAK",
};

// =====================================================================
// 5. ADLANDIRILMIŞ TASARIMLAR (kademe 1)
// =====================================================================
//
// Elle tasarlanmış kimlikler. Buradaki Türkçe adlar TAM İMLALI olmak
// zorunda; terminal çıktısı bozuk görünse bile dosyadaki bayt doğrudur.
// `palet` verilmezse slug karması karar verir.

interface AdlandirilmisTasarim {
  kisaAd: string;
  monogram: string;
  motif: SourceMotif;
  ustSatir?: string;
  altSatir?: string;
  palet?: number;
}

const ADLANDIRILMIS: Record<string, AdlandirilmisTasarim> = {
  // --- Mevzuat / resmî gazeteler -----------------------------------
  "resmi-gazete": {
    // Kullanıcının verdiği örnek: "resmî gazete + sayı numarası".
    // Alt satır `resmiGazeteAltSatiri()` ile haberden türetilir.
    kisaAd: "RESMÎ GAZETE",
    monogram: "RG",
    motif: "mevzuat",
    ustSatir: "T.C.",
    palet: 0,
  },
  "eur-lex": {
    kisaAd: "EUR-LEX",
    monogram: "EL",
    motif: "mevzuat",
    ustSatir: "AVRUPA BİRLİĞİ",
    altSatir: "RESMÎ GAZETE",
    palet: 3,
  },
  "federal-register": {
    kisaAd: "FEDERAL REGISTER",
    monogram: "FR",
    motif: "mevzuat",
    ustSatir: "ABD",
    altSatir: "RESMÎ GAZETE",
    palet: 1,
  },
  alomaliye: {
    kisaAd: "ALOMALİYE",
    monogram: "AM",
    motif: "mevzuat",
    ustSatir: "MEVZUAT",
    altSatir: "VERGİ VE MUHASEBE",
  },
  "musavirler-kulubu": {
    kisaAd: "MÜŞAVİRLER KULÜBÜ",
    monogram: "MK",
    motif: "mevzuat",
    ustSatir: "MEVZUAT",
    altSatir: "GÜMRÜK VE DIŞ TİCARET",
  },

  // --- Türkiye kurumları -------------------------------------------
  iso: {
    kisaAd: "İSTANBUL SANAYİ ODASI",
    monogram: "İSO",
    motif: "kurum",
    altSatir: "TÜRKİYE",
    palet: 5,
  },
  isov: {
    // Veritabanında henüz kaynak olarak yok; kullanıcı örnek verdiği için
    // tasarım hazır duruyor, slug eklendiğinde kendiliğinden devreye girer.
    kisaAd: "İSO VAKFI",
    monogram: "İSOV",
    motif: "kurum",
    altSatir: "İSTANBUL",
    palet: 5,
  },
  tobb: {
    kisaAd: "TOBB",
    monogram: "TOBB",
    motif: "kurum",
    altSatir: "ODALAR VE BORSALAR BİRLİĞİ",
  },
  kosgeb: {
    kisaAd: "KOSGEB",
    monogram: "KOSGEB",
    motif: "kurum",
    altSatir: "KOBİ DESTEK İDARESİ",
  },
  tubitak: {
    kisaAd: "TÜBİTAK",
    monogram: "TÜBİTAK",
    motif: "kurum",
    altSatir: "BİLİM VE TEKNOLOJİ",
  },
  "ticaret-bakanligi": {
    kisaAd: "TİCARET BAKANLIĞI",
    monogram: "TB",
    motif: "kurum",
    ustSatir: "T.C.",
    altSatir: "TÜRKİYE",
  },
  tim: {
    kisaAd: "TİM",
    monogram: "TİM",
    motif: "kurum",
    altSatir: "İHRACATÇILAR MECLİSİ",
  },
  tse: {
    kisaAd: "TSE",
    monogram: "TSE",
    motif: "kurum",
    altSatir: "TÜRK STANDARDLARI ENSTİTÜSÜ",
  },
  turkpatent: {
    kisaAd: "TÜRKPATENT",
    monogram: "TP",
    motif: "kurum",
    altSatir: "PATENT VE MARKA KURUMU",
  },
  istka: {
    kisaAd: "İSTKA",
    monogram: "İSTKA",
    motif: "kurum",
    altSatir: "İSTANBUL KALKINMA AJANSI",
  },
  "ufuk-avrupa": {
    kisaAd: "UFUK AVRUPA",
    monogram: "UA",
    motif: "kurum",
    altSatir: "TÜRKİYE KOORDİNASYONU",
  },
  igexx: {
    kisaAd: "IGEXX",
    monogram: "IGEXX",
    motif: "kurum",
    altSatir: "E-İHRACAT ZİRVESİ",
  },

  // --- Avrupa ve ABD kurumları -------------------------------------
  ecb: {
    kisaAd: "AVRUPA MERKEZ BANKASI",
    monogram: "ECB",
    motif: "kurum",
    altSatir: "EURO BÖLGESİ",
  },
  "ab-komisyonu-ticaret": {
    kisaAd: "AVRUPA KOMİSYONU",
    monogram: "DG",
    motif: "kurum",
    altSatir: "TİCARET GENEL MÜDÜRLÜĞÜ",
  },
  "ab-komisyonu-basin": {
    kisaAd: "AVRUPA KOMİSYONU",
    monogram: "AK",
    motif: "kurum",
    altSatir: "BASIN ODASI",
  },
  "ec-trade-policy": {
    kisaAd: "DG TRADE",
    monogram: "DG",
    motif: "kurum",
    altSatir: "AVRUPA KOMİSYONU",
  },
  eurocommerce: {
    kisaAd: "EUROCOMMERCE",
    monogram: "EC",
    motif: "kurum",
    altSatir: "AVRUPA PERAKENDE BİRLİĞİ",
  },
  ustr: {
    kisaAd: "USTR",
    monogram: "USTR",
    motif: "kurum",
    altSatir: "ABD TİCARET TEMSİLCİLİĞİ",
  },

  // --- Açık veri / istatistik --------------------------------------
  eurostat: {
    kisaAd: "EUROSTAT",
    monogram: "ES",
    motif: "acik_veri",
    altSatir: "AB İSTATİSTİK OFİSİ",
  },
  "us-eia": {
    kisaAd: "EIA",
    monogram: "EIA",
    motif: "acik_veri",
    altSatir: "ABD ENERJİ BİLGİ İDARESİ",
  },
  istat: {
    kisaAd: "İSTAT",
    monogram: "İSTAT",
    motif: "acik_veri",
    altSatir: "İTALYA İSTATİSTİK ENSTİTÜSÜ",
  },
  destatis: {
    kisaAd: "DESTATIS",
    monogram: "DS",
    motif: "acik_veri",
    altSatir: "ALMANYA İSTATİSTİK OFİSİ",
  },

  // --- Uluslararası örgütler ---------------------------------------
  iea: {
    kisaAd: "IEA",
    monogram: "IEA",
    motif: "uluslararasi",
    altSatir: "ULUSLARARASI ENERJİ AJANSI",
  },
  "iso-org": {
    kisaAd: "ISO",
    monogram: "ISO",
    motif: "uluslararasi",
    altSatir: "STANDARDİZASYON ÖRGÜTÜ",
  },

  // --- Basın --------------------------------------------------------
  "sanayi-gazetesi": {
    kisaAd: "SANAYİ GAZETESİ",
    monogram: "SG",
    motif: "basin",
    altSatir: "TÜRKİYE",
  },
  "dunya-gazetesi": {
    kisaAd: "DÜNYA",
    monogram: "DG",
    motif: "basin",
    ustSatir: "GAZETE",
    altSatir: "EKONOMİ",
  },
  "aa-ekonomi": {
    kisaAd: "ANADOLU AJANSI",
    monogram: "AA",
    motif: "basin",
    altSatir: "EKONOMİ SERVİSİ",
  },
  "cumhuriyet-ekonomi": {
    kisaAd: "CUMHURİYET",
    monogram: "CE",
    motif: "basin",
    altSatir: "EKONOMİ",
  },
};

/** Betikler ve testler için: elle tasarlanmış slug listesi. */
export const ADLANDIRILMIS_SLUGLAR: string[] = Object.keys(ADLANDIRILMIS);

// =====================================================================
// 6. RESMÎ GAZETE SAYISI — ölçülebilir çıkarım
// =====================================================================

const AYLAR = [
  "OCAK", "ŞUBAT", "MART", "NİSAN", "MAYIS", "HAZİRAN",
  "TEMMUZ", "AĞUSTOS", "EYLÜL", "EKİM", "KASIM", "ARALIK",
];

export interface ResmiGazeteGirdi {
  title?: string | null;
  url?: string | null;
  publishedAt?: string | null;
}

/**
 * Resmî Gazete SAYISI (nüsha numarası).
 *
 * TUZAK — ölçerken bulundu: bu kaynağın başlıklarında "Karar Sayısı: 11723"
 * gibi ifadeler var. Bu Cumhurbaşkanı KARAR numarasıdır, gazetenin sayısı
 * DEĞİLDİR. Gazete künyesine "SAYI 11723" basmak yanlış bilgi olur. Bu
 * yüzden iki savunma var:
 *   1. Yalnızca 30000-39999 aralığı kabul edilir (2020'li/2030'lu yılların
 *      gerçek Resmî Gazete sayı aralığı). "11723" bu testi geçemez.
 *   2. Eşleşmenin hemen öncesinde "Karar" geçiyorsa eşleşme reddedilir.
 *
 * Bulunamazsa `null` döner — UYDURULMAZ (§0.3). Çağıran tarafta tarihe düşülür.
 */
export function resmiGazeteSayisi(girdi: ResmiGazeteGirdi): string | null {
  const metin = `${String(girdi?.title ?? "")} ${String(girdi?.url ?? "")}`;
  if (metin.trim().length === 0) return null;

  const kaliplar: RegExp[] = [
    // "32123 sayılı Resmî Gazete", "32123 sayılı Mükerrer Resmî Gazete"
    /(3\d{4})\s*say[ıi]l[ıi]\s+(?:m[üu]kerrer\s+)?resm[îi]\s*gazete/i,
    // "Resmî Gazete (Sayı: 32123)"
    /resm[îi]\s*gazete[^.;]{0,40}?say[ıi]\s*[:.]\s*(3\d{4})/i,
    // Çıplak "Sayı: 32123" — "Sayısı:" / "Sayıları:" bu kalıba UYMAZ,
    // çünkü "Say" + "ı" hemen ardından iki nokta bekleniyor.
    /say[ıi]\s*[:.]\s*(3\d{4})(?!\d)/i,
  ];

  for (const kalip of kaliplar) {
    const m = kalip.exec(metin);
    if (!m) continue;
    const once = metin.slice(Math.max(0, (m.index ?? 0) - 12), m.index ?? 0);
    if (/karar\s*$/i.test(once)) continue; // "Karar Sayı..." → reddet
    return m[1];
  }
  return null;
}

/**
 * Gazetenin YAYIM TARİHİ. Resmî Gazete URL'leri tarihi taşıyor:
 *   /eskiler/2026/09/20260906M1.htm  → 6 Eylül 2026, mükerrer nüsha
 *   /eskiler/2026/09/20260905-27.htm → 5 Eylül 2026
 * URL'de bulunmazsa `publishedAt` ISO değerine düşülür.
 */
export function resmiGazeteTarihi(
  girdi: ResmiGazeteGirdi,
): { gun: number; ay: number; yil: number; mukerrer: boolean } | null {
  const url = String(girdi?.url ?? "");
  const m = /\/(\d{4})(\d{2})(\d{2})(m\d*)?/i.exec(url);
  if (m) {
    const yil = Number(m[1]);
    const ay = Number(m[2]);
    const gun = Number(m[3]);
    if (yil >= 1990 && ay >= 1 && ay <= 12 && gun >= 1 && gun <= 31) {
      return { gun, ay, yil, mukerrer: Boolean(m[4]) };
    }
  }

  const iso = String(girdi?.publishedAt ?? "");
  const p = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (p) {
    return { gun: Number(p[3]), ay: Number(p[2]), yil: Number(p[1]), mukerrer: false };
  }
  return null;
}

/**
 * Resmî Gazete amblemi alt satırı: önce gerçek sayı, yoksa tarih,
 * o da yoksa `null` (çağıran ülke etiketine düşer).
 */
export function resmiGazeteAltSatiri(girdi: ResmiGazeteGirdi): string | null {
  const sayi = resmiGazeteSayisi(girdi);
  if (sayi) return `SAYI ${sayi}`;

  const t = resmiGazeteTarihi(girdi);
  if (!t) return null;
  const ayAdi = AYLAR[t.ay - 1] ?? "";
  const temel = `${t.gun} ${ayAdi} ${t.yil}`.replace(/\s+/g, " ").trim();
  return t.mukerrer ? `${temel} · MÜKERRER` : temel;
}

// =====================================================================
// 7. METİN ÖLÇEĞİ
// =====================================================================

/**
 * Kaba metin genişliği tahmini üzerinden punto seçer.
 *
 * Neden tahmin: SVG sunucuda üretiliyor, gerçek metin ölçümü (getBBox) yok.
 * Ortalama karakter genişliği katsayısı 0,66 em — büyük harf ağırlıklı
 * kısa adlar için cömert bir değer. Cömert olması bilinçli: bir tık küçük
 * yazmak, çerçeveden taşmaktan iyidir. Kapalı formül olduğu için döngü yok,
 * sonuç sunucu ve istemcide birebir aynı.
 */
export function metinOlcegi(
  metin: string,
  maxGenislik: number,
  hedefBoyut: number,
  aralikOrani = 0.08,
): { boyut: number; aralik: number } {
  const n = Math.max(1, String(metin ?? "").length);
  const katsayi = n * 0.66 + (n - 1) * aralikOrani;
  const sinir = katsayi > 0 ? maxGenislik / katsayi : hedefBoyut;
  const boyut = Math.max(8, Math.min(hedefBoyut, sinir));
  return {
    boyut: Math.round(boyut * 10) / 10,
    aralik: Math.round(boyut * aralikOrani * 10) / 10,
  };
}

// =====================================================================
// 8. PLAN — üç kademeli çözüm
// =====================================================================

export interface SourceArtInput {
  /** `article.source.slug` — kademe 1'in anahtarı. */
  slug?: string | null;
  /** `article.source.name` — kademe 2/3'ün ad kaynağı. */
  name?: string | null;
  /** `article.source.source_type` — kademe 2 arketipi. */
  sourceType?: string | null;
  /** `article.source.country_code` — alt satır etiketi. */
  countryCode?: string | null;
  /** Haber başlığı — Resmî Gazete sayısı çıkarımı için. */
  title?: string | null;
  /** Haber bağlantısı — Resmî Gazete tarihi çıkarımı için. */
  url?: string | null;
  /** Haber tarihi — URL'de tarih yoksa yedek. */
  publishedAt?: string | null;
  /** Ad hiç yoksa kullanılacak yedek (ör. bölge adı). */
  fallbackInitials?: string | null;
  /**
   * Haberin kicker'ı (kategori ya da bölge). Kaynak türü bilinmediğinde
   * amblemin üst satırı olarak kullanılır — `ArticleImage`e kaynak alanları
   * verilmemiş çağrı noktalarında "KAYNAK" yerine anlamlı bir etiket çıksın.
   */
  kicker?: string | null;
}

export interface SourceArtPlan {
  /** 1 adlandırılmış tasarım, 2 arketip, 3 monogram. */
  kademe: 1 | 2 | 3;
  motif: SourceMotif;
  /** Amblemin ana yazısı (künye / logo). */
  kisaAd: string;
  /** İşaret — mühür ya da kalkan içine basılır. */
  monogram: string;
  /** Üst kicker (ör. "T.C.", "BASIN"). */
  ustSatir: string | null;
  /** Alt satır (ör. "SAYI 32123", "TÜRKİYE"). */
  altSatir: string | null;
  palet: SourcePalette;
  /** Çift kural çerçevesi — resmî belge hissi. */
  ciftCerceve: boolean;
  /** Motif varyasyonu için deterministik tohum (0..999). */
  tohum: number;
}

/**
 * Her kaynak için amblem planı. ÜÇ KADEME, boşa düşen yok:
 *   1. `ADLANDIRILMIS[slug]` varsa elle tasarlanmış kimlik.
 *   2. `source_type` bilinen bir türse o türün arketipi.
 *   3. Aksi halde monogram bloğu (ad ve slug boş olsa bile çalışır).
 */
export function sourceArtPlan(girdi: SourceArtInput): SourceArtPlan {
  const slug = String(girdi?.slug ?? "").trim().toLowerCase();
  const ad = String(girdi?.name ?? "").trim();
  const tip = String(girdi?.sourceType ?? "").trim().toLowerCase();
  const ulke = String(girdi?.countryCode ?? "").trim().toUpperCase();
  const yedek = String(girdi?.fallbackInitials ?? "").trim();
  // Kicker HER ZAMAN Türkçe büyük harfe çevrilir: bu etiket kaynaktan değil
  // uygulamanın kendi Türkçe sözlüğünden geliyor (kategori / bölge adı),
  // dolayısıyla "Teknoloji" → "TEKNOLOJİ" doğru dönüşüm.
  const kickerHam = String(girdi?.kicker ?? "").trim();
  const kicker = kickerHam.length > 0 ? kickerHam.toLocaleUpperCase("tr-TR") : "";

  // Tohum slug'dan gelir (aynı kaynak her haberde aynı görünür). Slug yoksa
  // ada, o da yoksa sabit bir dizgeye düşülür — asla NaN üretilmez.
  const tohum = slugTohumu(slug || ad || "kaynak");
  const ulkeEt = ulkeEtiketi(ulke);

  // --- Kademe 1 ------------------------------------------------------
  const tasarim = slug.length > 0 ? ADLANDIRILMIS[slug] : undefined;
  if (tasarim) {
    const rgAlt =
      slug === "resmi-gazete" ? resmiGazeteAltSatiri(girdi) : null;
    return {
      kademe: 1,
      motif: tasarim.motif,
      kisaAd: tasarim.kisaAd,
      monogram: tasarim.monogram,
      ustSatir: tasarim.ustSatir ?? null,
      altSatir: rgAlt ?? tasarim.altSatir ?? ulkeEt,
      // Elle sabitlenmiş palet varsa o; yoksa slug karması karar verir.
      palet: tasarim.palet !== undefined
        ? (PALETLER[tasarim.palet] ?? paletSec(tohum))
        : paletSec(tohum),
      ciftCerceve: tasarim.motif === "mevzuat",
      tohum,
    };
  }

  // --- Kademe 2 ------------------------------------------------------
  const arketip = ARKETIP[tip];
  if (arketip) {
    return {
      kademe: 2,
      motif: arketip,
      kisaAd: kisaAdTuret(ad, ulke),
      monogram: monogramTuret(ad, ulke, yedek || slug),
      ustSatir: TUR_ETIKETI[tip] ?? (kicker || null),
      altSatir: ulkeEt,
      ciftCerceve: arketip === "mevzuat",
      palet: paletSec(tohum),
      tohum,
    };
  }

  // --- Kademe 3 ------------------------------------------------------
  // Son durak: tür bilinmiyor ya da hiç gelmedi. Ad da boşsa
  // "KAYNAK BELİRTİLMEMİŞ" + "?" basılır; boş kutu yine çıkmaz.
  return {
    kademe: 3,
    motif: "monogram",
    kisaAd: kisaAdTuret(ad, ulke),
    monogram: monogramTuret(ad, ulke, yedek || slug),
    // Tür bilinmiyor: kicker varsa o, yoksa sade "KAYNAK".
    ustSatir: kicker || "KAYNAK",
    altSatir: ulkeEt,
    ciftCerceve: false,
    palet: paletSec(tohum),
    tohum,
  };
}
