-- =====================================================================
-- Etiket sozlugu (agirlikli)
-- `tags.weight` gizli onem skorunun `keyword` bilesenini besler:
-- bir haberin etiketlerinin agirliklari toplaninr, 0..100'e olceklenir.
-- Agirlik = "bu konu ISO/ISOV uyesi bir sanayiciyi ne kadar dogrudan vurur".
-- Seeder bu tabloyu upsert eder; burada onceden tanimli olanlar gercek
-- agirligini korur, seed JSON'unda gecen yeni etiketler varsayilan alir.
-- =====================================================================
SET NAMES utf8mb4;

INSERT INTO tags (slug, label, kind, weight) VALUES
-- ---- Mevzuat / yukumluluk : en yuksek agirlik --------------------
  ('mevzuat-degisikligi', 'Mevzuat Değişikliği',        'mevzuat', 95),
  ('resmi-gazete',        'Resmî Gazete',               'mevzuat', 92),
  ('yonetmelik',          'Yönetmelik',                 'mevzuat', 88),
  ('teblig',              'Tebliğ',                     'mevzuat', 85),
  ('kanun',               'Kanun',                      'mevzuat', 90),
  ('cumhurbaskani-karari','Cumhurbaşkanı Kararı',       'mevzuat', 90),
  ('uyum-yukumlulugu',    'Uyum Yükümlülüğü',           'mevzuat', 86),

-- ---- Tesvik / destek : sanayicinin dogrudan aksiyon alani --------
  ('tesvik',              'Teşvik',                     'konu',    92),
  ('destek-programi',     'Destek Programı',            'konu',    90),
  ('hibe',                'Hibe',                       'konu',    88),
  ('cagri',               'Proje Çağrısı',              'konu',    82),
  ('yatirim-tesvik-belgesi','Yatırım Teşvik Belgesi',   'konu',    88),
  ('ar-ge-tesviki',       'Ar-Ge Teşviki',              'konu',    85),
  ('kobi',                'KOBİ',                       'konu',    80),

-- ---- Vergi / finansman -------------------------------------------
  ('vergi',               'Vergi',                      'konu',    88),
  ('kdv-orani',           'KDV Oranı',                  'konu',    86),
  ('kurumlar-vergisi',    'Kurumlar Vergisi',           'konu',    84),
  ('faiz-karari',         'Faiz Kararı',                'konu',    88),
  ('kredi',               'Kredi',                      'konu',    78),
  ('kur',                 'Döviz Kuru',                 'konu',    82),
  ('enflasyon',           'Enflasyon',                  'konu',    84),

-- ---- Dis ticaret : ihracatci uyeler icin kritik -------------------
  ('ihracat',             'İhracat',                    'konu',    88),
  ('ithalat',             'İthalat',                    'konu',    80),
  ('gumruk',              'Gümrük',                     'konu',    85),
  ('tarife',              'Tarife',                     'konu',    90),
  ('anti-damping',        'Anti-Damping',               'konu',    92),
  ('korunma-onlemi',      'Korunma Önlemi',             'konu',    88),
  ('ticaret-politikasi',  'Ticaret Politikası',         'konu',    82),
  ('gumruk-birligi',      'Gümrük Birliği',             'konu',    84),
  ('serbest-ticaret-anlasmasi','Serbest Ticaret Anlaşması','konu',  78),

-- ---- Yesil donusum : yaklasan uyum maliyeti ----------------------
  ('cbam',                'CBAM (Sınırda Karbon)',      'mevzuat', 95),
  ('yesil-mutabakat',     'Yeşil Mutabakat',            'konu',    88),
  ('karbon-fiyatlamasi',  'Karbon Fiyatlaması',         'konu',    86),
  ('emisyon-ticaret-sistemi','Emisyon Ticaret Sistemi', 'mevzuat', 88),
  ('surdurulebilirlik-raporlamasi','Sürdürülebilirlik Raporlaması','mevzuat', 84),
  ('csrd',                'CSRD',                       'mevzuat', 84),
  ('dongusel-ekonomi',    'Döngüsel Ekonomi',           'konu',    70),

-- ---- Enerji / maliyet ---------------------------------------------
  ('enerji-maliyeti',     'Enerji Maliyeti',            'konu',    90),
  ('dogalgaz',            'Doğal Gaz',                  'konu',    82),
  ('elektrik-tarifesi',   'Elektrik Tarifesi',          'konu',    86),
  ('petrol',              'Petrol',                     'konu',    76),
  ('yenilenebilir-enerji','Yenilenebilir Enerji',       'konu',    70),

-- ---- Uretim / tedarik ----------------------------------------------
  ('sanayi-uretimi',      'Sanayi Üretimi',             'konu',    84),
  ('pmi',                 'PMI',                        'konu',    80),
  ('kapasite-kullanimi',  'Kapasite Kullanımı',         'konu',    76),
  ('tedarik-zinciri',     'Tedarik Zinciri',            'konu',    82),
  ('lojistik',            'Lojistik',                   'konu',    74),
  ('navlun',              'Navlun',                     'konu',    78),
  ('emtia-fiyatlari',     'Emtia Fiyatları',            'konu',    78),

-- ---- Istihdam -------------------------------------------------------
  ('asgari-ucret',        'Asgari Ücret',               'konu',    90),
  ('istihdam',            'İstihdam',                   'konu',    78),
  ('sgk',                 'SGK',                        'konu',    80),
  ('is-sagligi-guvenligi','İş Sağlığı ve Güvenliği',    'mevzuat', 82),

-- ---- Teknoloji ------------------------------------------------------
  ('yapay-zeka',          'Yapay Zekâ',                 'konu',    72),
  ('dijitallesme',        'Dijitalleşme',               'konu',    68),
  ('sanayi-40',           'Sanayi 4.0',                 'konu',    70),
  ('siber-guvenlik',      'Siber Güvenlik',             'konu',    68),
  ('yari-iletken',        'Yarı İletken',               'konu',    72),
  ('standart',            'Standart',                   'konu',    66),
  ('patent',              'Patent',                     'konu',    62),

-- ---- Sektorler ------------------------------------------------------
  ('demir-celik',         'Demir-Çelik',                'sektor',  80),
  ('otomotiv',            'Otomotiv',                   'sektor',  80),
  ('tekstil',             'Tekstil',                    'sektor',  78),
  ('kimya',               'Kimya',                      'sektor',  76),
  ('makine',              'Makine',                     'sektor',  78),
  ('gida',                'Gıda',                       'sektor',  72),
  ('insaat',              'İnşaat',                     'sektor',  70),
  ('elektronik',          'Elektronik',                 'sektor',  74),
  ('savunma-sanayi',      'Savunma Sanayi',             'sektor',  72),
  ('ilac',                'İlaç',                       'sektor',  70),
  ('cimento',             'Çimento',                    'sektor',  70),
  ('aluminyum',           'Alüminyum',                  'sektor',  74),

-- ---- Kurumlar -------------------------------------------------------
  ('iso',                 'İstanbul Sanayi Odası',      'kurum',   88),
  ('isov',                'İSOV',                       'kurum',   88),
  ('kosgeb',              'KOSGEB',                     'kurum',   86),
  ('tubitak',             'TÜBİTAK',                    'kurum',   84),
  ('tcmb',                'TCMB',                       'kurum',   88),
  ('tuik',                'TÜİK',                       'kurum',   84),
  ('ticaret-bakanligi',   'Ticaret Bakanlığı',          'kurum',   86),
  ('sanayi-bakanligi',    'Sanayi ve Teknoloji Bakanlığı','kurum',  86),
  ('tobb',                'TOBB',                       'kurum',   78),
  ('tim',                 'TİM',                        'kurum',   78),
  ('eximbank',            'Türk Eximbank',              'kurum',   80),
  ('ab-komisyonu',        'Avrupa Komisyonu',           'kurum',   86),
  ('wto',                 'WTO',                        'kurum',   78),
  ('imf',                 'IMF',                        'kurum',   76),
  ('dunya-bankasi',       'Dünya Bankası',              'kurum',   74),
  ('oecd',                'OECD',                       'kurum',   74),
  ('fed',                 'FED',                        'kurum',   84),
  ('ecb',                 'ECB',                        'kurum',   82),
  ('ustr',                'USTR',                       'kurum',   84),

-- ---- Cografya -------------------------------------------------------
  ('turkiye',             'Türkiye',                    'cografya', 70),
  ('avrupa-birligi',      'Avrupa Birliği',             'cografya', 78),
  ('abd',                 'ABD',                        'cografya', 74),
  ('cin',                 'Çin',                        'cografya', 74),
  ('almanya',             'Almanya',                    'cografya', 70),
  ('asya',                'Asya',                       'cografya', 62),
  ('korfez',              'Körfez Ülkeleri',            'cografya', 62)
AS new
ON DUPLICATE KEY UPDATE
  label  = new.label,
  kind   = new.kind,
  weight = new.weight;
