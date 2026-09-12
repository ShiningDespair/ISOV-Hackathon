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
  -- skorun bilesenleri: {"authority":x,"recency":x,"reach":x,"impact":x,"keyword":x,"corroboration":x}
  importance_factors JSON NULL,
  -- Esikler GERCEK DAGILIMA GORE KALIBRE EDILDI. Ilk degerler (80/60/35)
  -- elimizde hic veri yokken tahminle konmustu; 131 haberlik ilk korpusta
  -- skorlar 50,8-84,9 araliginda cikti (ortalama 68,1) ve bu esikler
  -- haberlerin %80'ini tek banda (YUKSEK) yigip alt bandi hic kullanmadi.
  -- Her sey "yuksek onemli" ise band bilgi tasimaz.
  -- 78/70/62 yaklasik p87/p59/p25'e denk gelir: ust %13 KRITIK, sonraki
  -- %28 YUKSEK, sonraki %34 ORTA, alt %25 DUSUK.
  -- NOT: sabit esikler korpus buyudukce kayar. Kalici cozum, kayan pencere
  -- uzerinden yuzdelik bantlar olurdu; generated column ile ifade
  -- edilemedigi icin simdilik kalibre sabitler kullaniliyor.
  importance_band   ENUM('KRITIK','YUKSEK','ORTA','DUSUK')
                    GENERATED ALWAYS AS (
                      CASE
                        WHEN importance_score >= 78 THEN 'KRITIK'
                        WHEN importance_score >= 70 THEN 'YUKSEK'
                        WHEN importance_score >= 62 THEN 'ORTA'
                        ELSE 'DUSUK'
                      END
                    ) STORED,

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
