// ---------------------------------------------------------------------
// POZISYONLAR, PANEL DUZENLERI ve KONU AGIRLIK MATRISI
//
// Saf veri + saf fonksiyon: DB/IO yok. Sebep importance.js ile ayni -
// hem API, hem gece isi, hem birim testi ayni sonucu uretsin.
//
// PANEL DUZENI BURADAN TURETILIR, DB'de KOLON DEGIL. Ayni degeri hem
// pozisyonda hem duzende tutmak, importance.js'te esiklerin uc ayri yerde
// kopyalanip birbirinden kaymasi hatasinin aynisini davet eder.
// ---------------------------------------------------------------------

/** 8 pozisyon — users/user_profiles.position_code ENUM'u ile birebir. */
export const POSITIONS = Object.freeze([
  'ust-yonetim',
  'strateji',
  'tesvik-finansman',
  'dis-ticaret',
  'uretim-operasyon',
  'enerji-surdurulebilirlik',
  'mevzuat-hukuk',
  'medya-iletisim',
]);

export const POSITION_LABELS = Object.freeze({
  'ust-yonetim': 'Üst Yönetim / Genel Müdür',
  'strateji': 'Strateji / İş Geliştirme',
  'tesvik-finansman': 'Teşvik ve Finansman',
  'dis-ticaret': 'Dış Ticaret / İhracat',
  'uretim-operasyon': 'Üretim / Operasyon',
  'enerji-surdurulebilirlik': 'Enerji / Sürdürülebilirlik',
  'mevzuat-hukuk': 'Mevzuat / Hukuk',
  'medya-iletisim': 'Medya / İletişim',
});

/** 4 panel duzeni. */
export const LAYOUTS = Object.freeze(['ozet', 'aksiyon', 'operasyon', 'takip']);

export const LAYOUT_LABELS = Object.freeze({
  ozet: 'Özet — 3 KPI ve 5 başlık, en kısa görünüm',
  aksiyon: 'Aksiyon — son başvuru tarihli kalemler, geri sayımlı',
  operasyon: 'Operasyon — maliyet, tedarik ve emtia odaklı',
  takip: 'Takip — mevzuat takvimi ve değişiklik akışı',
});

/** 8 pozisyon -> 4 duzen. TEK esleme noktasi. */
export const POSITION_LAYOUT = Object.freeze({
  'ust-yonetim': 'ozet',
  'strateji': 'ozet',
  'tesvik-finansman': 'aksiyon',
  'dis-ticaret': 'aksiyon',
  'uretim-operasyon': 'operasyon',
  'enerji-surdurulebilirlik': 'operasyon',
  'mevzuat-hukuk': 'takip',
  'medya-iletisim': 'takip',
});

// ---------------------------------------------------------------------
// KONU AGIRLIK MATRISI
//
// Anahtarlar GERCEK korpus slug'lari (etiket sozlugu + seed'in urettigi
// slug'lar). 'kategori:xxx' onekli anahtarlar articles.category ile eslesir.
//
// Siralamanin gercekten farklilasmasi buradan gelir: mevzuat-hukuk ile
// tesvik-finansman neredeyse hic ortak slug paylasmiyor.
//
// Hesaplama computeKeyword() ile BIREBIR AYNI yapilir (importance.js):
// eslesen agirliklar azalan siralanir, 0.65*en yuksek + 0.35*ilk uc
// ortalamasi. O fonksiyonda doyum problemi bir kez cozuldu; yeniden
// yazmiyoruz, yalnizca agirlik kaynagini tags.weight yerine bu matris
// yapiyoruz. Eslesme yoksa notr 50.
// ---------------------------------------------------------------------
export const POSITION_TOPIC_WEIGHTS = Object.freeze({
  'ust-yonetim': {
    'faiz-karari': 90, 'orta-vadeli-program': 90, 'enflasyon': 88, 'asgari-ucret': 88,
    'kur': 85, 'mevzuat-degisikligi': 85, 'sanayi-uretimi': 80, 'cbam': 75,
    'buyume': 85, 'vergi': 82, 'enerji-maliyeti': 80, 'pmi': 78,
    'kategori:ekonomi': 85, 'kategori:mevzuat': 78,
  },
  'strateji': {
    'yatirim': 90, 'jeopolitik-risk': 88, 'orta-vadeli-program': 88, 'ar-ge': 85,
    'yapay-zeka': 85, 'sanayi-40': 85, 'tedarik-zinciri': 85, 'cbam': 85,
    'yari-iletken': 82, 'dijitallesme': 80, 'serbest-ticaret-anlasmasi': 80,
    'kategori:teknoloji': 82, 'kategori:ticaret-politikasi': 80,
  },
  'tesvik-finansman': {
    'tesvik': 100, 'destek-programi': 98, 'hibe': 95, 'kosgeb': 95,
    'yatirim-tesvik-belgesi': 95, 'cagri': 92, 'ar-ge-tesviki': 92, 'tubitak': 90,
    'kredi': 90, 'eximbank': 88, 'kobi': 85, 'finansman': 90, 'vergi': 85,
    'kategori:tesvik': 100, 'kategori:finansman': 92, 'kategori:ar-ge': 88,
  },
  'dis-ticaret': {
    'ihracat': 100, 'tarife': 98, 'anti-damping': 98, 'gumruk': 95,
    'korunma-onlemi': 95, 'section-232': 95, 'ticaret-politikasi': 92,
    'ithalat': 88, 'cbam': 85, 'navlun': 85, 'gumruk-birligi': 88,
    'serbest-ticaret-anlasmasi': 88, 'lojistik': 80,
    'kategori:dis-ticaret': 100, 'kategori:ticaret-politikasi': 95,
  },
  'uretim-operasyon': {
    'tedarik-zinciri': 95, 'sanayi-uretimi': 92, 'kapasite-kullanimi': 88,
    'hammadde': 88, 'emtia-fiyatlari': 85, 'pmi': 85, 'lojistik': 85,
    'navlun': 82, 'enerji-maliyeti': 80, 'standart': 75, 'imalat-sanayi': 88,
    'kategori:sanayi': 92, 'kategori:tedarik-zinciri': 95, 'kategori:emtia': 85,
  },
  'enerji-surdurulebilirlik': {
    'cbam': 100, 'karbon-fiyatlamasi': 98, 'emisyon-ticaret-sistemi': 95,
    'yesil-mutabakat': 95, 'enerji-maliyeti': 95, 'elektrik-tarifesi': 92,
    'csrd': 90, 'surdurulebilirlik-raporlamasi': 90, 'dogalgaz': 88,
    'yenilenebilir-enerji': 85, 'dongusel-ekonomi': 80, 'petrol': 78,
    'kategori:enerji': 95, 'kategori:cevre': 95,
  },
  'mevzuat-hukuk': {
    'resmi-gazete': 100, 'mevzuat-degisikligi': 100, 'yonetmelik': 95,
    'teblig': 95, 'kanun': 95, 'cumhurbaskani-karari': 95, 'uyum-yukumlulugu': 95,
    'ab-mevzuati': 90, 'is-sagligi-guvenligi': 85, 'patent': 75,
    'kategori:mevzuat': 100, 'kategori:vergi': 85,
  },
  'medya-iletisim': {
    'iso': 95, 'isov': 95, 'jeopolitik-risk': 80, 'tobb': 80, 'tim': 80,
    'yapay-zeka': 75, 'dijitallesme': 72, 'sanayi-uretimi': 78, 'pmi': 78,
    'kategori:duyuru': 90, 'kategori:ekonomi': 75,
  },
});

/** Bilinmeyen degerleri guvenli varsayilana indirger. */
export function normalizePosition(value) {
  return POSITIONS.includes(String(value)) ? String(value) : 'ust-yonetim';
}

/** Pozisyondan panel duzenini turetir. TEK dogruluk noktasi. */
export function layoutOf(position) {
  return POSITION_LAYOUT[normalizePosition(position)];
}

/** Vakit butcesi -> gosterilecek haber sayisi. */
export const TIME_BUDGETS = Object.freeze([2, 5, 15]);

export function normalizeTimeBudget(value) {
  const n = Number(value);
  return TIME_BUDGETS.includes(n) ? n : 5;
}

/**
 * Vakit butcesinin icerik yogunlugu.
 *
 * Sayilar keyfi degil, okuma suresi aritmetiginden: Turkce akici okuma
 * ~200 kelime/dk.
 *   2 dk : 150 karakterlik cumle ~20 kelime ~6 sn; x5 = 30 sn + tarama = ~2 dk
 *   5 dk : 3 madde ~54 kelime ~16 sn; x12 = 3,2 dk + gezinme = ~5 dk
 *  15 dk : tam ozet (~62 kelime) + 5 madde (~90) = ~152 kelime ~46 sn
 *          DUZ "30 haber tam ozet" = ~23 dk, yani vakit butcesi hakkinda
 *          YALAN olurdu. Bu yuzden kademeli: ilk 10 tam + sonraki 20 madde
 *          = 10x46sn + 20x16sn = ~13 dk.
 */
export const DENSITY = Object.freeze({
  2:  { items: 5,  full: 0,  bullets: 0, style: 'tek-cumle' },
  5:  { items: 12, full: 0,  bullets: 3, style: 'madde' },
  15: { items: 30, full: 10, bullets: 3, style: 'kademeli' },
});

export function densityOf(timeBudget) {
  return DENSITY[normalizeTimeBudget(timeBudget)];
}
