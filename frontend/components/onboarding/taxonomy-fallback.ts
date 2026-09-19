/**
 * TAKSONOMI YEDEGI
 *
 * NEDEN VAR: `/meta/taxonomy` ve `/meta/interests` bu satirlar yazilirken
 * yayinda degil (404/501). Kayit sihirbazi sunucuya bagimli olursa boş
 * ekran gosterir; oysa kaydin BUTUN degeri bu secimlerde. Bu yuzden yerel
 * bir yedek tasiyoruz.
 *
 * YEDEK "GERCEGIN IKINCI KOPYASI" DEGIL: veriler backend'deki
 * `src/lib/positions.js` (POSITIONS, LAYOUT_LABELS, POSITION_LAYOUT,
 * DENSITY) ve `src/lib/sectors.js` (NACE_SECTORS) dosyalarindan birebir
 * alindi. Sunucudan veri GELDIGINDE sunucu kazanir (bkz. mergeTaxonomy);
 * yedek yalnizca bos kalan bolumu doldurur. Boylece backend taksonomiyi
 * degistirdiginde arayuz eski listeyi INATLA gostermez.
 */

import type {
  InterestTag,
  PositionOption,
  SectorOption,
  Taxonomy,
  TimeBudgetOption,
} from "@/lib/types-auth";

/** Duzen kodu -> kullaniciya gosterilecek aciklama. */
export const FALLBACK_LAYOUTS: Record<string, string> = {
  ozet: "Özet — 3 KPI ve 5 başlık, en kısa görünüm",
  aksiyon: "Aksiyon — son başvuru tarihli kalemler, geri sayımlı",
  operasyon: "Operasyon — maliyet, tedarik ve emtia odaklı",
  takip: "Takip — mevzuat takvimi ve değişiklik akışı",
};

/** 8 pozisyon ve getirdigi panel duzeni. */
export const FALLBACK_POSITIONS: PositionOption[] = [
  { code: "ust-yonetim", label: "Üst Yönetim / Genel Müdür", layout: "ozet", layoutLabel: FALLBACK_LAYOUTS.ozet },
  { code: "strateji", label: "Strateji / İş Geliştirme", layout: "ozet", layoutLabel: FALLBACK_LAYOUTS.ozet },
  { code: "tesvik-finansman", label: "Teşvik ve Finansman", layout: "aksiyon", layoutLabel: FALLBACK_LAYOUTS.aksiyon },
  { code: "dis-ticaret", label: "Dış Ticaret / İhracat", layout: "aksiyon", layoutLabel: FALLBACK_LAYOUTS.aksiyon },
  { code: "uretim-operasyon", label: "Üretim / Operasyon", layout: "operasyon", layoutLabel: FALLBACK_LAYOUTS.operasyon },
  { code: "enerji-surdurulebilirlik", label: "Enerji / Sürdürülebilirlik", layout: "operasyon", layoutLabel: FALLBACK_LAYOUTS.operasyon },
  { code: "mevzuat-hukuk", label: "Mevzuat / Hukuk", layout: "takip", layoutLabel: FALLBACK_LAYOUTS.takip },
  { code: "medya-iletisim", label: "Medya / İletişim", layout: "takip", layoutLabel: FALLBACK_LAYOUTS.takip },
];

/** 26 NACE bolumu. */
export const FALLBACK_SECTORS: SectorOption[] = [
  { code: "B", label: "Madencilik ve taş ocakçılığı", group: "madencilik" },
  { code: "C10", label: "Gıda, içecek ve tütün ürünleri", group: "gida" },
  { code: "C13", label: "Tekstil, giyim eşyası ve deri", group: "tekstil" },
  { code: "C16", label: "Ağaç ve ağaç ürünleri", group: "orman" },
  { code: "C17", label: "Kâğıt ve kâğıt ürünleri", group: "kagit" },
  { code: "C18", label: "Basım ve yayım", group: "kagit" },
  { code: "C19", label: "Kok kömürü ve rafine edilmiş petrol", group: "kimya" },
  { code: "C20", label: "Kimyasal madde ve ürünleri", group: "kimya" },
  { code: "C21", label: "Temel eczacılık ürünleri ve ilaç", group: "ilac" },
  { code: "C22", label: "Kauçuk ve plastik ürünleri", group: "kimya" },
  { code: "C23", label: "Çimento, cam, seramik ve mineral ürünler", group: "mineral" },
  { code: "C24", label: "Ana metal sanayii (demir-çelik, alüminyum)", group: "metal" },
  { code: "C25", label: "Metal eşya sanayii", group: "metal" },
  { code: "C26", label: "Bilgisayar, elektronik ve optik ürünler", group: "elektronik" },
  { code: "C27", label: "Elektrikli teçhizat ve beyaz eşya", group: "elektronik" },
  { code: "C28", label: "Makine ve ekipman imalatı", group: "makine" },
  { code: "C29", label: "Motorlu kara taşıtı imalatı", group: "otomotiv" },
  { code: "C30", label: "Gemi, demiryolu ve havacılık araçları", group: "ulasim-araci" },
  { code: "C31", label: "Mobilya ve diğer imalat", group: "orman" },
  { code: "D35", label: "Elektrik, gaz ve enerji üretimi", group: "enerji" },
  { code: "E36", label: "Su, atık yönetimi ve geri kazanım", group: "cevre" },
  { code: "F", label: "İnşaat ve taahhüt", group: "insaat" },
  { code: "G", label: "Toptan ve perakende ticaret", group: "ticaret" },
  { code: "H", label: "Taşımacılık, lojistik ve depolama", group: "lojistik" },
  { code: "J", label: "Bilgi ve iletişim / yazılım", group: "bilisim" },
  { code: "K", label: "Finans ve sigorta", group: "finans" },
];

/**
 * Vakit kademeleri. Sayilar keyfi degil, backend DENSITY ile ayni:
 * Turkce akici okuma ~200 kelime/dk uzerinden hesaplandi.
 */
export const FALLBACK_TIME_BUDGETS: TimeBudgetOption[] = [
  {
    minutes: 2,
    items: 5,
    style: "tek-cumle",
    label: "2 dakika",
    detail: "5 haber, her biri tek cümlede (en fazla 150 karakter)",
  },
  {
    minutes: 5,
    items: 12,
    style: "madde",
    label: "5 dakika",
    detail: "12 haber, her biri üç maddede",
  },
  {
    minutes: 15,
    items: 30,
    style: "kademeli",
    label: "15 dakika",
    detail: "30 haber: ilk 10'u tam özet, sonraki 20'si üç madde",
  },
];

/**
 * ILGI ALANLARI — etiket sozlugunden secilmis 48 kalem.
 * Slug'lar backend `POSITION_TOPIC_WEIGHTS` anahtarlariyla birebir; yani
 * secim gercekten siralamayi besliyor, susleme degil.
 */
export const FALLBACK_INTERESTS: InterestTag[] = [
  { slug: "tesvik", label: "Teşvikler", group: "Teşvik ve finansman" },
  { slug: "destek-programi", label: "Destek programları", group: "Teşvik ve finansman" },
  { slug: "hibe", label: "Hibeler", group: "Teşvik ve finansman" },
  { slug: "kosgeb", label: "KOSGEB", group: "Teşvik ve finansman" },
  { slug: "tubitak", label: "TÜBİTAK", group: "Teşvik ve finansman" },
  { slug: "yatirim-tesvik-belgesi", label: "Yatırım teşvik belgesi", group: "Teşvik ve finansman" },
  { slug: "cagri", label: "Açık çağrılar", group: "Teşvik ve finansman" },
  { slug: "kredi", label: "Kredi ve faiz destekleri", group: "Teşvik ve finansman" },
  { slug: "eximbank", label: "Eximbank", group: "Teşvik ve finansman" },

  { slug: "ihracat", label: "İhracat", group: "Dış ticaret" },
  { slug: "ithalat", label: "İthalat", group: "Dış ticaret" },
  { slug: "tarife", label: "Gümrük tarifeleri", group: "Dış ticaret" },
  { slug: "anti-damping", label: "Anti-damping soruşturmaları", group: "Dış ticaret" },
  { slug: "gumruk", label: "Gümrük işlemleri", group: "Dış ticaret" },
  { slug: "korunma-onlemi", label: "Korunma önlemleri", group: "Dış ticaret" },
  { slug: "ticaret-politikasi", label: "Ticaret politikası", group: "Dış ticaret" },
  { slug: "serbest-ticaret-anlasmasi", label: "Serbest ticaret anlaşmaları", group: "Dış ticaret" },

  { slug: "tedarik-zinciri", label: "Tedarik zinciri", group: "Üretim ve operasyon" },
  { slug: "sanayi-uretimi", label: "Sanayi üretimi", group: "Üretim ve operasyon" },
  { slug: "kapasite-kullanimi", label: "Kapasite kullanımı", group: "Üretim ve operasyon" },
  { slug: "hammadde", label: "Hammadde tedariki", group: "Üretim ve operasyon" },
  { slug: "emtia-fiyatlari", label: "Emtia fiyatları", group: "Üretim ve operasyon" },
  { slug: "pmi", label: "PMI göstergeleri", group: "Üretim ve operasyon" },
  { slug: "lojistik", label: "Lojistik", group: "Üretim ve operasyon" },
  { slug: "navlun", label: "Navlun fiyatları", group: "Üretim ve operasyon" },
  { slug: "standart", label: "Standartlar ve belgelendirme", group: "Üretim ve operasyon" },

  { slug: "cbam", label: "Sınırda karbon düzenlemesi (CBAM)", group: "Enerji ve sürdürülebilirlik" },
  { slug: "karbon-fiyatlamasi", label: "Karbon fiyatlaması", group: "Enerji ve sürdürülebilirlik" },
  { slug: "emisyon-ticaret-sistemi", label: "Emisyon ticaret sistemi", group: "Enerji ve sürdürülebilirlik" },
  { slug: "yesil-mutabakat", label: "Yeşil Mutabakat", group: "Enerji ve sürdürülebilirlik" },
  { slug: "enerji-maliyeti", label: "Enerji maliyetleri", group: "Enerji ve sürdürülebilirlik" },
  { slug: "elektrik-tarifesi", label: "Elektrik tarifeleri", group: "Enerji ve sürdürülebilirlik" },
  { slug: "yenilenebilir-enerji", label: "Yenilenebilir enerji", group: "Enerji ve sürdürülebilirlik" },
  { slug: "surdurulebilirlik-raporlamasi", label: "Sürdürülebilirlik raporlaması", group: "Enerji ve sürdürülebilirlik" },

  { slug: "resmi-gazete", label: "Resmî Gazete", group: "Mevzuat" },
  { slug: "mevzuat-degisikligi", label: "Mevzuat değişiklikleri", group: "Mevzuat" },
  { slug: "yonetmelik", label: "Yönetmelikler", group: "Mevzuat" },
  { slug: "teblig", label: "Tebliğler", group: "Mevzuat" },
  { slug: "kanun", label: "Kanunlar", group: "Mevzuat" },
  { slug: "cumhurbaskani-karari", label: "Cumhurbaşkanı kararları", group: "Mevzuat" },
  { slug: "uyum-yukumlulugu", label: "Uyum yükümlülükleri", group: "Mevzuat" },
  { slug: "ab-mevzuati", label: "AB mevzuatı", group: "Mevzuat" },
  { slug: "is-sagligi-guvenligi", label: "İş sağlığı ve güvenliği", group: "Mevzuat" },

  { slug: "faiz-karari", label: "Faiz kararları", group: "Makroekonomi" },
  { slug: "enflasyon", label: "Enflasyon", group: "Makroekonomi" },
  { slug: "asgari-ucret", label: "Asgari ücret", group: "Makroekonomi" },
  { slug: "kur", label: "Kur hareketleri", group: "Makroekonomi" },
  { slug: "buyume", label: "Büyüme verileri", group: "Makroekonomi" },
  { slug: "orta-vadeli-program", label: "Orta Vadeli Program", group: "Makroekonomi" },
  { slug: "vergi", label: "Vergi düzenlemeleri", group: "Makroekonomi" },

  { slug: "yatirim", label: "Yatırım kararları", group: "Strateji ve teknoloji" },
  { slug: "jeopolitik-risk", label: "Jeopolitik riskler", group: "Strateji ve teknoloji" },
  { slug: "ar-ge", label: "Ar-Ge", group: "Strateji ve teknoloji" },
  { slug: "yapay-zeka", label: "Yapay zekâ", group: "Strateji ve teknoloji" },
  { slug: "sanayi-40", label: "Sanayi 4.0", group: "Strateji ve teknoloji" },
  { slug: "dijitallesme", label: "Dijitalleşme", group: "Strateji ve teknoloji" },
  { slug: "yari-iletken", label: "Yarı iletkenler", group: "Strateji ve teknoloji" },

  { slug: "iso", label: "İstanbul Sanayi Odası", group: "Kurumsal" },
  { slug: "isov", label: "İSOV", group: "Kurumsal" },
  { slug: "tobb", label: "TOBB", group: "Kurumsal" },
  { slug: "tim", label: "TİM", group: "Kurumsal" },
  { slug: "kobi", label: "KOBİ gündemi", group: "Kurumsal" },
];

/**
 * POZISYONA GORE ONCEDEN ISARETLI ILGI ALANLARI (6–8 kalem).
 *
 * NEDEN ON SECIM VAR: bos bir etiket bulutu kullaniciyi "acaba hangisini
 * secsem" diye dusundurur ve kaydin en kolay terk edildigi yer burasidir.
 * Her satir, backend POSITION_TOPIC_WEIGHTS matrisinde o pozisyon icin en
 * yuksek agirliga sahip slug'lardan olusuyor — yani varsayilan, keyfi bir
 * tahmin degil, siralamayi besleyen degerlerin ta kendisi.
 */
export const POSITION_INTEREST_DEFAULTS: Record<string, string[]> = {
  "ust-yonetim": ["faiz-karari", "enflasyon", "asgari-ucret", "kur", "buyume", "mevzuat-degisikligi", "sanayi-uretimi", "vergi"],
  strateji: ["yatirim", "jeopolitik-risk", "orta-vadeli-program", "ar-ge", "yapay-zeka", "tedarik-zinciri", "cbam"],
  "tesvik-finansman": ["tesvik", "destek-programi", "hibe", "kosgeb", "yatirim-tesvik-belgesi", "cagri", "tubitak", "kredi"],
  "dis-ticaret": ["ihracat", "tarife", "anti-damping", "gumruk", "korunma-onlemi", "ticaret-politikasi", "navlun"],
  "uretim-operasyon": ["tedarik-zinciri", "sanayi-uretimi", "kapasite-kullanimi", "hammadde", "emtia-fiyatlari", "pmi", "lojistik"],
  "enerji-surdurulebilirlik": ["cbam", "karbon-fiyatlamasi", "emisyon-ticaret-sistemi", "yesil-mutabakat", "enerji-maliyeti", "elektrik-tarifesi", "yenilenebilir-enerji"],
  "mevzuat-hukuk": ["resmi-gazete", "mevzuat-degisikligi", "yonetmelik", "teblig", "kanun", "cumhurbaskani-karari", "uyum-yukumlulugu"],
  "medya-iletisim": ["iso", "isov", "tobb", "tim", "sanayi-uretimi", "jeopolitik-risk", "dijitallesme"],
};

/** Yedek taksonominin tamami. */
export const FALLBACK_TAXONOMY: Taxonomy = {
  positions: FALLBACK_POSITIONS,
  layouts: FALLBACK_LAYOUTS,
  sectors: FALLBACK_SECTORS,
  timeBudgets: FALLBACK_TIME_BUDGETS,
};

/**
 * Sunucudan gelen taksonomiyi yedekle birlestirir.
 * SUNUCU KAZANIR; yedek yalnizca bos bolumu doldurur. Boylece backend
 * listeyi degistirdiginde arayuz eskisini gostermeye devam etmez.
 */
export function mergeTaxonomy(api: Taxonomy | null | undefined): Taxonomy {
  if (!api) return FALLBACK_TAXONOMY;
  const layouts =
    Object.keys(api.layouts ?? {}).length > 0 ? api.layouts : FALLBACK_LAYOUTS;
  const positions =
    api.positions && api.positions.length > 0
      ? api.positions.map((p) => ({
          ...p,
          // Duzen aciklamasi eksikse duzen haritasindan tamamla.
          layoutLabel: p.layoutLabel || layouts[p.layout] || "",
        }))
      : FALLBACK_POSITIONS;
  return {
    layouts,
    positions,
    sectors: api.sectors && api.sectors.length > 0 ? api.sectors : FALLBACK_SECTORS,
    timeBudgets:
      api.timeBudgets && api.timeBudgets.length > 0
        ? api.timeBudgets
        : FALLBACK_TIME_BUDGETS,
  };
}

/**
 * `tags.kind` degerleri grup basligi olarak kullanilabilir hale getirilir.
 * Uc, etiket turunu ham slug olarak veriyor ("konu", "sektor"); basliga
 * "konu" yazmak kullaniciya hicbir sey anlatmaz.
 */
const KIND_LABELS: Record<string, string> = {
  konu: "Konular",
  sektor: "Sektör etiketleri",
  kurum: "Kurumlar",
  mevzuat: "Mevzuat",
  cografya: "Coğrafya",
};

/**
 * Ilgi alani listesi — sunucudan geldiyse o, gelmediyse yedek.
 *
 * GRUPLAMA: yerel listede tanidigimiz slug'lar icin anlamli baslik
 * ("Dış ticaret") kullanilir; tanimadiklarimiz icin etiket turu
 * insan okur haline cevrilir. Uc, gruplamayi bilmiyor — bilmesi de
 * gerekmiyor, bu tamamen arayuz kararidir.
 */
export function mergeInterests(api: InterestTag[] | null | undefined): InterestTag[] {
  if (!api || api.length === 0) return FALLBACK_INTERESTS;
  const local = new Map(FALLBACK_INTERESTS.map((t) => [t.slug, t]));
  return api.map((t) => {
    const yerel = local.get(t.slug);
    const kind = (t.group ?? "").trim();
    return {
      slug: t.slug,
      // ETIKET METNI: tanidigimiz slug'lar icin yerel metin kazanir.
      // Sebep olculdu: `tags.label` seeder tarafindan Baslik Bicimi'nde
      // yaziliyor ("Kobi", "Cbam") ve Turkce imlaya uymuyor. Tanimadigimiz
      // slug'larda uctan gelen metin kullanilir — bos ekran olmaz.
      label: yerel?.label ?? (t.label || t.slug),
      group: yerel?.group ?? KIND_LABELS[kind] ?? (kind || "Diğer"),
    };
  });
}

/**
 * Pozisyon icin onceden isaretlenecek ilgi alanlari.
 * Listede olmayan slug'lar atlanir; 6'nin altina duserse liste sirasindan
 * tamamlanir — kullanici HICBIR ZAMAN bos bir ekranla karsilasmaz.
 */
export function defaultInterestsFor(
  position: string,
  available: InterestTag[],
  minimum = 6,
): string[] {
  const pool = new Set(available.map((t) => t.slug));
  const wanted = POSITION_INTEREST_DEFAULTS[position] ?? [];
  const out = wanted.filter((slug) => pool.has(slug));
  if (out.length >= minimum) return out;
  for (const tag of available) {
    if (out.length >= minimum) break;
    if (!out.includes(tag.slug)) out.push(tag.slug);
  }
  return out;
}
