// ---------------------------------------------------------------------
// POZISYONLAR, PANEL DUZENLERI ve KONU AGIRLIK MATRISI
//
// Saf veri + saf fonksiyon: DB/IO yok. Sebep importance.js ile ayni -
// hem API, hem gece isi, hem birim testi ayni sonucu uretsin.
//
// PANEL DUZENI BURADAN TURETILIR, DB'de KOLON DEGIL. Ayni degeri hem
// pozisyonda hem duzende tutmak, importance.js'te esiklerin uc ayri yerde
// kopyalanip birbirinden kaymasi hatasinin aynisini davet eder.
//
// VARSAYILAN GORUNUM (POSITION_VIEW) de AYNI ILKEYLE burada. DB'de
// `default_view` diye bir kolon YOK ve olmayacak: kolon olsaydi pozisyonu
// degisen kullanicinin gorunumu ya elle guncellenmeyi beklerdi ya da iki
// kaynak (kolon + pozisyon) birbirinden kayardi. Turetme tek yonlu.
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

// ---------------------------------------------------------------------
// VARSAYILAN GORUNUM (gorunum anahtarinin acilis degeri)
//
// Kullanicinin sozleri: "En ust duzey yoneticiler icin Gorsel olan
// acilsin", "Normal kullanicilar icin Kart gorunumu acilsin",
// "Kullanicilar yine suanki gibi kendileri degistirebilir olsun."
//
// Yani bu bir VARSAYILAN, bir kisitlama DEGIL: kullanicinin acik secimi
// (frontend `localStorage['isov:view']`) her zaman kazanir. Backend
// yalnizca "hic secim yapmamis" duruma bir baslangic degeri onerir.
// ---------------------------------------------------------------------

/**
 * Gecerli gorunum kumesi.
 *
 * Frontend `components/ViewProvider.tsx` -> `VIEW_MODES` ile BIREBIR AYNI
 * sira ve icerik. Iki liste ayrisirsa cerezden gelen deger frontend'de
 * taninmaz ve sessizce 'panel'e duser — o yuzden buraya yeni bir gorunum
 * eklemek ViewProvider'i da degistirmeyi GEREKTIRIR.
 */
export const VIEWS = Object.freeze(['panel', 'gazete', 'gorsel', 'kart']);

/**
 * 8 pozisyon -> varsayilan gorunum. TEK esleme noktasi.
 * Ust yonetim 'gorsel', diger 7 pozisyon 'kart'.
 */
export const POSITION_VIEW = Object.freeze({
  'ust-yonetim': 'gorsel',
  'strateji': 'kart',
  'tesvik-finansman': 'kart',
  'dis-ticaret': 'kart',
  'uretim-operasyon': 'kart',
  'enerji-surdurulebilirlik': 'kart',
  'mevzuat-hukuk': 'kart',
  'medya-iletisim': 'kart',
});

/**
 * Pozisyondan varsayilan gorunumu turetir. `layoutOf()`in esi.
 *
 * `normalizePosition()` KULLANILMAZ: o fonksiyon bilinmeyen degeri
 * 'ust-yonetim'e cekiyor ve burada kullanilsa "profili hic olmayan
 * kullanici" da 'gorsel' acardi. Profil satiri yoksa (`null`) ya da deger
 * taninmiyorsa notr varsayilan 'panel' doner — "hic secmedi" ile "ust
 * yonetim secti" ayrimi korunur (bkz. authService.js sapma-only ilkesi).
 */
export function viewOf(position) {
  const code = String(position ?? '');
  return POSITION_VIEW[code] ?? 'panel';
}

/**
 * Vakit butcesi kademeleri (dakika) -> gosterilecek haber sayisi.
 *
 * UCUNCU KADEME 15 DEGIL 10: kullanici "en altta yine ayni secenekler
 * olsun 2 5 10 dk" dedi (bkz. docs/SADELESTIRME.md §4).
 */
export const TIME_BUDGETS = Object.freeze([2, 5, 10]);

/** Eski kademe -> yeni kademe. Sadece 15 var; 2 ve 5 degismedi. */
const LEGACY_TIME_BUDGETS = Object.freeze({ 15: 10 });

/**
 * Bilinmeyen degerleri guvenli kademeye indirger.
 *
 * GERIYE UYUMLULUK: `user_profiles.time_budget_min` TINYINT (ENUM DEGIL),
 * yani semada 15 hala yazilabilir bir deger ve goc gerektirmiyor. Eski
 * kayitlarda 15 bulunabilir; onu "gecersiz" sayip 5'e dusurmek,
 * kullanicinin EN UZUN kademe secimini neredeyse en kisaya cevirmek
 * olurdu. Bu yuzden 15 -> 10 eslenir.
 *
 * Gercekten taninmayan deger (0, 7, null, 'abc') -> 5, yani orta kademe:
 * hem en kisa kademeyi hem en uzununu dayatmayan notr secim.
 */
export function normalizeTimeBudget(value) {
  const n = Number(value);
  if (TIME_BUDGETS.includes(n)) return n;
  if (LEGACY_TIME_BUDGETS[n]) return LEGACY_TIME_BUDGETS[n];
  return 5;
}

/**
 * Vakit butcesinin icerik yogunlugu.
 *
 * Sayilar keyfi degil, okuma suresi aritmetiginden: Turkce akici okuma
 * ~200 kelime/dk. Korpustan olculen kalem maliyetleri:
 *   tek cumle  : ~20 kelime  ->  20/200 dk = ~6 sn
 *   3 madde    : ~54 kelime  ->  54/200 dk = ~16 sn
 *   tam ozet   : ~62 kelime tam ozet + ~5 madde (~90 kelime) = ~152 kelime
 *                -> 152/200 dk = ~46 sn
 *   baslik tarama (okunmayan kalem dahil) : ~2 sn/kalem
 *
 *   2 dk : 5 x 6 sn = 30 sn + 5 x 2 sn tarama = 40 sn; kalan sure
 *          baglantiya tiklama/geri donme paylasi        -> ~2 dk
 *   5 dk : 12 x 16 sn = 192 sn + 12 x 2 sn = 216 sn = 3,6 dk
 *          + gezinme                                    -> ~5 dk
 *
 *  10 dk : UCUNCU KADEME 15 DEGIL 10 (kullanicinin istegi). Iki hesap
 *          birlikte verilir; ikisi de 10 dakikanin ALTINDA kalmali.
 *
 *          (a) SOZLESMEDEKI UST SINIR (CONTRACT'in varsaydigi ozet
 *              uzunluklari: tam ozet ~152 kelime = ~46 sn, uc madde
 *              ~54 kelime = ~16 sn). Uretilmis (LLM) ozetler bu boya
 *              yaklasacak, yani KOTU DURUM hesabi:
 *                ilk 6 tam ozet   :  6 x 46 sn = 276 sn
 *                kalan 14 madde   : 14 x 16 sn = 224 sn
 *                20 kalem tarama  : 20 x  2 sn =  40 sn
 *                ------------------------------------------
 *                toplam           = 540 sn = 9,0 dk   -> 10 dk'nin altinda
 *
 *          (b) BUGUNKU KORPUSTA OLCULEN (GET /me/digest?time_budget=10
 *              yanitindaki 20 kalemin kelimeleri gercekten sayildi):
 *                tam ozetli kalem ortalama 119,0 kelime = 35,7 sn
 *                maddeli kalem    ortalama  33,6 kelime = 10,1 sn
 *                6 x 35,7 + 14 x 10,1 = 355 sn; + 40 sn tarama
 *                toplam = 395 sn = 6,6 dk
 *
 *          NEDEN BU KADEME DUZ DEGIL KADEMELI: ayni iki olcekle
 *            eski 15 dk kademesi (30 kalem / ilk 10 tam)
 *              (a) 780 sn = 13,0 dk   (b) 618 sn = 10,3 dk
 *            duz "20 haber tam ozet"
 *              (a) 960 sn = 16,0 dk   (b) 754 sn = 12,6 dk
 *          Her iki secenek de her iki olcekte 10 dakikayi ASAR, yani
 *          kademe adi icerigi hakkinda YALAN soylerdi. 20 kalem / 6 tam
 *          ozet ise iki olcekte de 10 dakikanin ALTINDA kaliyor.
 */
export const DENSITY = Object.freeze({
  2:  { items: 5,  full: 0, bullets: 0, style: 'tek-cumle' },
  5:  { items: 12, full: 0, bullets: 3, style: 'madde' },
  10: { items: 20, full: 6, bullets: 3, style: 'kademeli' },
});

export function densityOf(timeBudget) {
  return DENSITY[normalizeTimeBudget(timeBudget)];
}
