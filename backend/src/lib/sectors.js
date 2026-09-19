// ---------------------------------------------------------------------
// NACE SEKTOR LISTESI ve KORPUS ESLEMESI
//
// NEDEN BU KATMAN VAR:
// Kullaniciya resmi NACE bolumleri gosteriliyor, ama haberlerin sektor
// bilgisi serbest metin: entities.sektor alaninda 119 farkli varyant
// ("Celik"/"Çelik", "Gıda"/"Gida", "Imalat Sanayi"/"İmalat"). Etiket
// turune (tags.kind='sektor') dayanmak MUMKUN DEGIL: olculdu, 12 sektor
// etiketinin yalnizca 5'i kalmis (seeder kind'i eziyor) ve kullanim
// sayilari 0-6 arasinda. Gercek sinyal entities.sektor - 131/131 haberde dolu.
//
// KOD OLARAK VERI (JSON dosyasi degil): importance.js'in WEIGHTS ve
// llm.js'in CATEGORY_HINTS emsali. Surumlenir, saf fonksiyonla test
// edilir, diff'te okunur.
//
// "Eslesmeyen sektor secen kullanici BOS AKIS GORMEZ" garantisi uc katmanli:
//  (a) Bu bilesen HICBIR ZAMAN filtre degil. 35..100 araligi 0.22 agirlikla
//      kisisel skorda en cok +-14,3 puan; harmanlandiktan sonra nihai
//      skorda <=5,4 puan oynatir.
//  (b) Her NACE kalemi bir gruba bagli; kesisim yoksa ayni gruptaki baska
//      kalemin corpus'u 62 puan verir.
//  (c) CROSSCUTTING slug'lari her kullaniciya taban verir.
// En kotu durumda kullanici GLOBAL siralamayi gorur.
// ---------------------------------------------------------------------

/** Her kullaniciyi ilgilendiren, sektorden bagimsiz slug'lar. */
export const CROSSCUTTING = Object.freeze([
  'imalat', 'imalat-sanayi', 'sanayi', 'kobi', 'ihracat', 'ekonomi',
]);

/**
 * NACE bolumleri. `corpus` = entities.sektor icinde gecebilecek
 * normalize edilmis terimler. `group` = ayni aileden kalemler.
 */
export const NACE_SECTORS = Object.freeze([
  { code: 'B',    label: 'Madencilik ve taş ocakçılığı',                group: 'madencilik',
    corpus: ['madencilik', 'maden', 'hammadde', 'tas-ocakciligi'] },
  { code: 'C10',  label: 'Gıda, içecek ve tütün ürünleri',              group: 'gida',
    corpus: ['gida', 'icecek', 'tarim', 'tutun', 'gida-sanayi'] },
  { code: 'C13',  label: 'Tekstil, giyim eşyası ve deri',               group: 'tekstil',
    corpus: ['tekstil', 'hazir-giyim', 'deri', 'konfeksiyon', 'ayakkabi'] },
  { code: 'C16',  label: 'Ağaç ve ağaç ürünleri',                       group: 'orman',
    corpus: ['agac', 'orman', 'kereste', 'mobilya'] },
  { code: 'C17',  label: 'Kâğıt ve kâğıt ürünleri',                     group: 'kagit',
    corpus: ['kagit', 'ambalaj', 'oluklu-mukavva', 'karton'] },
  { code: 'C18',  label: 'Basım ve yayım',                              group: 'kagit',
    corpus: ['basim', 'matbaa', 'yayincilik'] },
  { code: 'C19',  label: 'Kok kömürü ve rafine edilmiş petrol',         group: 'kimya',
    corpus: ['petrol', 'rafineri', 'petrokimya', 'akaryakit'] },
  { code: 'C20',  label: 'Kimyasal madde ve ürünleri',                  group: 'kimya',
    corpus: ['kimya', 'petrokimya', 'gubre', 'temizlik-urunleri', 'boya'] },
  { code: 'C21',  label: 'Temel eczacılık ürünleri ve ilaç',            group: 'ilac',
    corpus: ['ilac', 'eczacilik', 'saglik', 'medikal'] },
  { code: 'C22',  label: 'Kauçuk ve plastik ürünleri',                  group: 'kimya',
    corpus: ['plastik', 'kaucuk', 'lastik', 'geri-donusum'] },
  { code: 'C23',  label: 'Çimento, cam, seramik ve mineral ürünler',    group: 'mineral',
    corpus: ['cimento', 'cam', 'seramik', 'beton', 'mineral'] },
  { code: 'C24',  label: 'Ana metal sanayii (demir-çelik, alüminyum)',  group: 'metal',
    corpus: ['demir-celik', 'celik', 'aluminyum', 'metal', 'bakir', 'cinko'] },
  { code: 'C25',  label: 'Metal eşya sanayii',                          group: 'metal',
    corpus: ['metal-esya', 'metal-isleme', 'dokum', 'boru-profil'] },
  { code: 'C26',  label: 'Bilgisayar, elektronik ve optik ürünler',     group: 'elektronik',
    corpus: ['elektronik', 'yari-iletken', 'bilisim', 'optik'] },
  { code: 'C27',  label: 'Elektrikli teçhizat ve beyaz eşya',           group: 'elektronik',
    corpus: ['beyaz-esya', 'elektrikli-ev-aletleri', 'kablo', 'pil', 'elektrikli-techizat'] },
  { code: 'C28',  label: 'Makine ve ekipman imalatı',                   group: 'makine',
    corpus: ['makine', 'ekipman', 'takim-tezgahi', 'imalat'] },
  { code: 'C29',  label: 'Motorlu kara taşıtı imalatı',                 group: 'otomotiv',
    corpus: ['otomotiv', 'otomotiv-yan-sanayi', 'yan-sanayi', 'tasit'] },
  { code: 'C30',  label: 'Gemi, demiryolu ve havacılık araçları',       group: 'ulasim-araci',
    corpus: ['denizcilik', 'gemi', 'gemi-insa', 'havacilik', 'demiryolu', 'savunma'] },
  { code: 'C31',  label: 'Mobilya ve diğer imalat',                     group: 'orman',
    corpus: ['mobilya', 'diger-imalat'] },
  { code: 'D35',  label: 'Elektrik, gaz ve enerji üretimi',             group: 'enerji',
    corpus: ['enerji', 'elektrik', 'dogalgaz', 'yenilenebilir-enerji', 'ruzgar', 'gunes'] },
  { code: 'E36',  label: 'Su, atık yönetimi ve geri kazanım',           group: 'cevre',
    corpus: ['su', 'atik', 'geri-donusum', 'aritma', 'dongusel-ekonomi'] },
  { code: 'F',    label: 'İnşaat ve taahhüt',                           group: 'insaat',
    corpus: ['insaat', 'yapi', 'muteahhit', 'altyapi'] },
  { code: 'G',    label: 'Toptan ve perakende ticaret',                 group: 'ticaret',
    corpus: ['perakende', 'toptan', 'ticaret', 'e-ticaret'] },
  { code: 'H',    label: 'Taşımacılık, lojistik ve depolama',           group: 'lojistik',
    corpus: ['lojistik', 'tasimacilik', 'navlun', 'denizcilik', 'depolama', 'liman'] },
  { code: 'J',    label: 'Bilgi ve iletişim / yazılım',                 group: 'bilisim',
    corpus: ['yazilim', 'bilisim', 'telekomunikasyon', 'veri-merkezi', 'yapay-zeka'] },
  { code: 'K',    label: 'Finans ve sigorta',                           group: 'finans',
    corpus: ['bankacilik', 'finans', 'sigorta', 'sermaye-piyasasi'] },
]);

const BY_CODE = new Map(NACE_SECTORS.map((s) => [s.code, s]));
const BY_GROUP = new Map();
for (const s of NACE_SECTORS) {
  if (!BY_GROUP.has(s.group)) BY_GROUP.set(s.group, []);
  BY_GROUP.get(s.group).push(s);
}

export function sectorByCode(code) {
  return BY_CODE.get(String(code)) ?? null;
}

export function sectorsInGroup(group) {
  return BY_GROUP.get(String(group)) ?? [];
}

/** Puanlama basamaklari — sector_match bileseninin ham degeri (0..100). */
export const SECTOR_SCORES = Object.freeze({
  birincil: 100,
  ikincil: 78,
  ayniGrup: 62,
  kesisen: 62,     // CROSSCUTTING
  habersiz: 50,    // haberde sektor yok -> notr
  alakasiz: 35,    // kesisim yok (0 DEGIL: 0 bunu fiilen filtreye cevirirdi)
});

/**
 * Haberin sektor terimleriyle kullanicinin sektor secimini karsilastirir.
 *
 * @param {string[]} articleSectors  entities.sektor, NORMALIZE EDILMIS slug'lar
 * @param {string}   primaryCode     kullanicinin birincil NACE kodu
 * @param {string[]} secondaryCodes  ikincil kodlar
 * @returns {number} 0..100
 */
export function computeSectorMatch(articleSectors = [], primaryCode = null, secondaryCodes = []) {
  const arr = Array.isArray(articleSectors) ? articleSectors.filter(Boolean) : [];
  if (arr.length === 0) return SECTOR_SCORES.habersiz;
  const set = new Set(arr);
  const hits = (terms) => terms.some((t) => set.has(t));

  const primary = sectorByCode(primaryCode);
  if (primary && hits(primary.corpus)) return SECTOR_SCORES.birincil;

  for (const code of (Array.isArray(secondaryCodes) ? secondaryCodes : [])) {
    const s = sectorByCode(code);
    if (s && hits(s.corpus)) return SECTOR_SCORES.ikincil;
  }

  if (primary) {
    for (const sibling of sectorsInGroup(primary.group)) {
      if (sibling.code !== primary.code && hits(sibling.corpus)) return SECTOR_SCORES.ayniGrup;
    }
  }

  if (hits(CROSSCUTTING)) return SECTOR_SCORES.kesisen;
  return SECTOR_SCORES.alakasiz;
}
