-- =====================================================================
-- ISO / ISOV  —  Dis Kaynak Izleme ve Ozet Botu
-- Sema v1  (MySQL 8.0)
-- =====================================================================
SET NAMES utf8mb4;
SET time_zone = '+03:00';

-- ---------------------------------------------------------------------
-- sources : izlenen acik kaynaklar
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sources (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug              VARCHAR(80)  NOT NULL,
  name              VARCHAR(190) NOT NULL,
  homepage_url      VARCHAR(500) NULL,
  feed_url          VARCHAR(500) NULL,
  -- kaynak ailesi: mevzuat / kurum duyurusu / acik veri / basin / uluslararasi
  source_type       ENUM('mevzuat','kurum','acik_veri','basin','uluslararasi','diger')
                    NOT NULL DEFAULT 'diger',
  -- kaynak guvenilirligi 0..100 -> onem skorunda carpan olarak kullanilir
  authority_weight  TINYINT UNSIGNED NOT NULL DEFAULT 50,
  country_code      CHAR(2) NULL,
  language          CHAR(5) NOT NULL DEFAULT 'tr',
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  last_fetched_at   DATETIME NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sources_slug (slug),
  KEY ix_sources_type (source_type, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- clusters : tekillestirme kumeleri
--   Ayni olayi anlatan N haber tek bir cluster altinda toplanir.
--   Kumenin "temsilci" haberi representative_article_id ile isaretlenir.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clusters (
  id                       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  cluster_key              CHAR(40) NOT NULL,          -- deterministik anahtar
  representative_article_id INT UNSIGNED NULL,
  member_count             SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  headline                 VARCHAR(400) NULL,          -- kume basligi (temsilci)
  first_seen_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_clusters_key (cluster_key),
  KEY ix_clusters_last_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- articles : toplanan + islenmis haber kaydi
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS articles (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_id         INT UNSIGNED NOT NULL,
  cluster_id        INT UNSIGNED NULL,

  -- --- ham alanlar -------------------------------------------------
  url               VARCHAR(768) NOT NULL,
  url_hash          CHAR(40) NOT NULL,                 -- sha1(normalize(url))
  title             VARCHAR(400) NOT NULL,
  body              MEDIUMTEXT NULL,
  author            VARCHAR(190) NULL,
  published_at      DATETIME NULL,
  collected_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  language          CHAR(5) NOT NULL DEFAULT 'tr',

  -- --- tekillestirme ----------------------------------------------
  content_hash      CHAR(40) NULL,                     -- sha1(normalize(title+body))
  simhash           BIGINT UNSIGNED NULL,              -- 64-bit simhash, hamming mesafesi icin
  is_duplicate      TINYINT(1) NOT NULL DEFAULT 0,     -- kume temsilcisi degilse 1
  duplicate_of_id   INT UNSIGNED NULL,

  -- --- islenmis alanlar --------------------------------------------
  summary           TEXT NULL,                         -- 2-4 cumle ozet (TR)
  summary_en        TEXT NULL,
  -- Vakit kademeleri (2/5/15 dk) icin onceden uretilmis kisa varyantlar.
  -- Bugun heuristik doldurulur; ANTHROPIC_API_KEY geldiginde bir is bu
  -- kolonlari uretilmis metinle ezer ve summary_source'u 'llm' yapar.
  -- OKUMA YOLU DEGISMEZ: daima bu kolonlari COALESCE ile okur, bossa
  -- anlik yardimciya duser.
  summary_short     VARCHAR(400) NULL,
  summary_medium    TEXT NULL,
  summary_source    ENUM('heuristik','llm') NOT NULL DEFAULT 'heuristik',
  key_points        JSON NULL,                         -- ["madde", ...]
  entities          JSON NULL,                         -- {kurum:[], kisi:[], sektor:[]}

  -- --- siniflandirma -----------------------------------------------
  region            ENUM('KURESEL','TURKIYE','AMERIKA','AVRUPA','ASYA','DIGER')
                    NOT NULL DEFAULT 'DIGER',
  category          VARCHAR(60) NULL,                  -- mevzuat / tesvik / ihracat / enerji ...
  sentiment         ENUM('POZITIF','NOTR','NEGATIF') NOT NULL DEFAULT 'NOTR',

  -- --- GIZLI ONEM METRIGI ------------------------------------------
  -- 0..100. Panelde ham deger gosterilmez; sadece siralama + band icin kullanilir.
  importance_score  DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  -- skorun bilesenleri: {"authority":x,"recency":x,"impact":x,"keyword":x,"corroboration":x}
  importance_factors JSON NULL,
  -- BANT — YUZDELIK TABANLI, uygulama katmaninda yazilir.
  --
  -- Onceden generated column'du ve sabit esikler kullaniyordu. Esikler IKI KEZ
  -- kaydi: once ilk korpusta haberlerin %80'i tek banda yigildi (80/60/35),
  -- kalibre edildikten iki gun sonra ise sadece takvim ilerledigi icin recency
  -- bileseni tum skorlari asagi cekti (ortalama 71,7 -> 65,6) ve KRITIK 15'ten
  -- 2'ye dustu. Sabit esik, skor dagilimi zamanla kaydigi icin yapisal olarak
  -- kirilgan; ayrica esikler uc ayri yerde (sema, pipeline, importance.js)
  -- kopyalanip birbirinden kaymisti.
  --
  -- Artik bant korpus icindeki SIRALAMADAN turetiliyor (ust %12 KRITIK,
  -- sonraki %28 YUKSEK, sonraki %35 ORTA, alt %25 DUSUK) ve tek yerde
  -- hesaplaniyor: lib/importance.js -> bandCutoffs()/bandOf().
  -- Skorun kendisi mutlak ve aciklanabilir kalir; bant "bu donemin en
  -- onemlileri" sorusunu yanitlar.
  importance_band   ENUM('KRITIK','YUKSEK','ORTA','DUSUK') NOT NULL DEFAULT 'DUSUK',

  -- --- HABER GORSELI ------------------------------------------------
  -- og:image / twitter:image ile toplanan kapak gorseli. Bulunamazsa NULL
  -- kalir; frontend tipografik yer tutucuya duser, bos kutu gostermez.
  image_url         VARCHAR(1000) NULL,
  -- Gorselin nereden bulundugu (izlenebilirlik): og / twitter / link etiketi,
  -- 'yok' = denendi ama hicbir yerde gorsel bulunamadi.
  image_source      ENUM('og','twitter','link','yok') NULL,
  -- Son deneme zamani. NULL = hic denenmedi. Toplu is yalnizca NULL olanlari
  -- alir; boylece ayni basarisiz URL her kosumda tekrar denenmez.
  image_checked_at  DATETIME NULL,

  -- --- islem durumu -------------------------------------------------
  status            ENUM('HAM','ISLENDI','HATA') NOT NULL DEFAULT 'HAM',
  processed_at      DATETIME NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_articles_url_hash (url_hash),
  KEY ix_articles_source (source_id),
  KEY ix_articles_cluster (cluster_id),
  KEY ix_articles_published (published_at),
  KEY ix_articles_region (region, published_at),
  KEY ix_articles_importance (importance_score DESC, published_at DESC),
  KEY ix_articles_band (importance_band, published_at),
  KEY ix_articles_dup (is_duplicate, published_at),
  KEY ix_articles_content_hash (content_hash),
  KEY ix_articles_image_checked (image_checked_at),
  FULLTEXT KEY ft_articles_text (title, summary, body),
  CONSTRAINT fk_articles_source  FOREIGN KEY (source_id)  REFERENCES sources (id)  ON DELETE CASCADE,
  CONSTRAINT fk_articles_cluster FOREIGN KEY (cluster_id) REFERENCES clusters (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE clusters
  ADD CONSTRAINT fk_clusters_rep FOREIGN KEY (representative_article_id)
  REFERENCES articles (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- tags + article_tags : cok-cok etiketleme
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tags (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug        VARCHAR(80)  NOT NULL,
  label       VARCHAR(120) NOT NULL,
  -- etiket ailesi: konu / sektor / kurum / mevzuat / cografya
  kind        ENUM('konu','sektor','kurum','mevzuat','cografya') NOT NULL DEFAULT 'konu',
  -- Bu etiketin onem skoruna katkisi (keyword bileseni).
  -- Varsayilan 40 = NOTR ON-DEGER. Sozlukte tanimli olmayan bir etiket
  -- ("hormuz-bogazi", "reeskont-kredisi" gibi gercekten onemli ama listeye
  -- girmemis konular) "kanit yok" demektir, "onemsiz" demek degil. Dusuk bir
  -- varsayilan (10) bu haberleri haksiz yere asagi cekerdi.
  weight      TINYINT UNSIGNED NOT NULL DEFAULT 40,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tags_slug (slug),
  KEY ix_tags_kind (kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS article_tags (
  article_id  INT UNSIGNED NOT NULL,
  tag_id      INT UNSIGNED NOT NULL,
  confidence  DECIMAL(4,3) NOT NULL DEFAULT 1.000,
  PRIMARY KEY (article_id, tag_id),
  KEY ix_article_tags_tag (tag_id),
  CONSTRAINT fk_at_article FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE,
  CONSTRAINT fk_at_tag     FOREIGN KEY (tag_id)     REFERENCES tags (id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- tenant_source_prefs : KIRACI BASINA kaynak izleme tercihleri
--
-- NEDEN AYRI TABLO: `sources` ve toplanan haber verisi TUM KIRACILAR
-- arasinda PAYLASILIR ve hicbir kosulda silinmez — bir kiracinin izlemek
-- istemedigi kaynagi baska bir kiraci izliyor olabilir. Bu yuzden "panelde
-- gosterme" karari global `sources.is_active` ile degil, kiraci basina
-- burada tutulur.
--
-- `sources.is_active` YONETICI duzeyindedir ("site kapandi, artik hic
-- taranmiyor") ve panel arayuzunden degistirilmez.
--
-- Tabloya yalnizca SAPMALAR yazilir: kayit YOKSA varsayilan "izleniyor".
-- Boylece hicbir sey secmemis bir kiraci tum kaynaklari gorur.
--
-- Kimlik dogrulama henuz yok; `tenant_key` istekten gelir, yoksa 'isov'.
-- Kimlik eklendiginde sema degismeden gercek kiraciya baglanir.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_source_prefs (
  tenant_key  VARCHAR(64)  NOT NULL DEFAULT 'isov',
  source_id   INT UNSIGNED NOT NULL,
  is_watched  TINYINT(1)   NOT NULL DEFAULT 1,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_key, source_id),
  CONSTRAINT fk_tsp_source FOREIGN KEY (source_id) REFERENCES sources (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- source_suggestions : kullanicilarin onerdigi yeni kaynaklar
--   Oneri kabul edilirse `sources` tablosuna da islenir (PATCH ucu, tek
--   transaction). Ayni URL iki kez onerilemez -> uq_source_sug_url.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS source_suggestions (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(190) NOT NULL,
  url           VARCHAR(500) NOT NULL,
  reason        TEXT NULL,                          -- neden izlenmeli
  submitted_by  VARCHAR(190) NULL,                  -- oneren kisi / birim
  -- sources.source_type ile AYNI ENUM; oneride bos birakilabilir.
  source_type   ENUM('mevzuat','kurum','acik_veri','basin','uluslararasi','diger') NULL,
  status        ENUM('beklemede','kabul','red') NOT NULL DEFAULT 'beklemede',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at   DATETIME NULL,                      -- durum degistirilme zamani
  PRIMARY KEY (id),
  UNIQUE KEY uq_source_sug_url (url),
  KEY ix_source_sug_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- collection_runs : toplama calismalarinin kaydi (izlenebilirlik)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS collection_runs (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  started_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at     DATETIME NULL,
  trigger_type    ENUM('manuel','zamanlanmis','seed') NOT NULL DEFAULT 'manuel',
  fetched_count   INT UNSIGNED NOT NULL DEFAULT 0,
  new_count       INT UNSIGNED NOT NULL DEFAULT 0,
  duplicate_count INT UNSIGNED NOT NULL DEFAULT 0,
  error_count     INT UNSIGNED NOT NULL DEFAULT 0,
  notes           TEXT NULL,
  PRIMARY KEY (id),
  KEY ix_runs_started (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- reports : donemsel ozet raporlari (gunluk/haftalik bulten)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title         VARCHAR(300) NOT NULL,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  period_type   ENUM('gunluk','haftalik','aylik','ozel') NOT NULL DEFAULT 'haftalik',
  executive_summary TEXT NULL,
  stats         JSON NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- Idempotentlik uygulama katmaninda SELECT-then-UPDATE ile saglaniyordu;
  -- rapor uretimi zamanlanmis hale gelince bu yaris kosuluna acikti.
  UNIQUE KEY uq_reports_period (period_start, period_end, period_type),
  KEY ix_reports_period (period_end DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS report_items (
  report_id   INT UNSIGNED NOT NULL,
  article_id  INT UNSIGNED NOT NULL,
  rank_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  section     VARCHAR(60) NULL,
  PRIMARY KEY (report_id, article_id),
  KEY ix_ri_article (article_id),
  CONSTRAINT fk_ri_report  FOREIGN KEY (report_id)  REFERENCES reports (id)  ON DELETE CASCADE,
  CONSTRAINT fk_ri_article FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
