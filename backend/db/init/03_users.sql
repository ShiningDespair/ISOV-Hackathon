-- =====================================================================
-- KULLANICI SISTEMI, KISISELLESTIRME, DEGISIKLIK TAKIBI, YONETIM
--
-- Tum DDL idempotent (CREATE TABLE IF NOT EXISTS). Sebep: docker-compose
-- db/init'i /docker-entrypoint-initdb.d olarak bagliyor ve bu YALNIZCA
-- BOS veri dizininde kosar. Canli DB'de 131 haber var, dolayisiyla bu
-- dosya kendiliginden uygulanmaz -> `npm run migrate` ayni dosyayi
-- calistirir. Tek dosya, iki yol, ayrisma yok.
--
-- SAPMA-ONLY ilkesi (tenant_source_prefs'ten miras): tercih tablolarina
-- yalnizca varsayilandan SAPMALAR yazilir. Satir yoksa varsayilan gecerli.
-- Kisiselestirme icin somut sonucu: user_profiles satiri olmayan kullanici
-- bugunku editoryal akisi gorur - bos durum yok, bozulma yok.
-- =====================================================================
SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- tenants : kurum kayit defteri
--
-- tenant_source_prefs.tenant_key VARCHAR olarak DURUYOR, FK'ye
-- cevrilmiyor: birlesik PK'sinin parcasi ve icinde veri var; gocun
-- bugun somut faydasi yok. Yeni tablolar ise tenants.id'ye FK veriyor -
-- olmayan kuruma kullanici yazilmasin. tenants.tenant_key iki dunya
-- arasinda dogal anahtar koprusu.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_key     VARCHAR(64)  NOT NULL,
  name           VARCHAR(190) NOT NULL,
  kind           ENUM('oda','vakif','firma','kamu','stk','diger') NOT NULL DEFAULT 'firma',
  default_region ENUM('KURESEL','TURKIYE','AMERIKA','AVRUPA','ASYA','DIGER') NULL,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenants_key (tenant_key),
  KEY ix_tenants_active (is_active, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO tenants (tenant_key, name, kind) VALUES
  ('isov', 'İstanbul Sanayi Odası Vakfı', 'vakif')
  ON DUPLICATE KEY UPDATE name = VALUES(name), kind = VALUES(kind);

-- ---------------------------------------------------------------------
-- users
--
-- last_seen_at + prev_seen_at NEDEN IKI KOLON:
-- Tek kolonla, oturumun ilk sayfa yuklemesi damgayi now'a cekince
-- "son ziyaretinizden beri 12 yeni haber" rozeti ILK YENILEMEDE kaybolur.
-- Kural: now - last_seen_at > 30 dk ise prev_seen_at = last_seen_at ve
-- last_seen_at = now; degilse yalnizca last_seen_at = now.
-- Degisiklik sorgusu COALESCE(prev_seen_at, created_at) okur.
-- Bu sayac OTURUMDA TUTULMAZ: oturum suresi dolunca ve cok cihazda iki
-- farkli cevap uretirdi.
--
-- Panel duzeni (ozet/aksiyon/operasyon/takip) KOLON DEGIL: 8 pozisyondan
-- kodla turetilir (lib/positions.js). Iki yerde tutmak, importance.js'te
-- esiklerin uc ayri yerde kopyalanip kaymasi hatasinin aynisini davet eder.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id           INT UNSIGNED NOT NULL,
  email               VARCHAR(190) NOT NULL,          -- daima kucuk harf yazilir
  password_hash       VARCHAR(255) NOT NULL,          -- scrypt$N$r$p$salt$hash (node:crypto)
  full_name           VARCHAR(190) NULL,
  title               VARCHAR(120) NULL,              -- serbest unvan metni
  role                ENUM('uye','editor','admin') NOT NULL DEFAULT 'uye',
  status              ENUM('beklemede','aktif','askida','pasif') NOT NULL DEFAULT 'aktif',

  last_login_at       DATETIME NULL,
  last_seen_at        DATETIME NULL,   -- su anki ziyaret
  prev_seen_at        DATETIME NULL,   -- "son ziyaretten beri" SORGUSU BUNU OKUR

  -- Kaba kuvvet korumasi: IP bazli sinir bellek-ici, bu sayaclar
  -- e-posta bazli kalici kilit icin.
  failed_login_count  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until        DATETIME NULL,

  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY ix_users_tenant (tenant_id, status),
  KEY ix_users_role (role),
  CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- sessions
--
-- token_hash = sha256(32 baytlik opak token). HAM TOKEN SAKLANMAZ:
-- veritabani sizarsa canli oturumlar ele gecmesin.
-- JWT degil DB oturumu: admin panelden rol degistigi an etkili olmali ve
-- "cikis yap" gercekten iptal etmeli. JWT'de zaten bir iptal listesi
-- gerekecekti - o liste bu tablo.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NOT NULL,
  token_hash   CHAR(64) NOT NULL,
  issued_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at   DATETIME NOT NULL,
  last_used_at DATETIME NULL,
  revoked_at   DATETIME NULL,
  ip           VARCHAR(45) NULL,
  user_agent   VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY ix_sessions_user (user_id, revoked_at),
  KEY ix_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- password_resets : sifre sifirlama
-- SMTP bozukken admin panelden tek kullanimlik baglanti uretilebilsin -
-- bozuk bir SMTP demo oncesi herkesi kilitlemesin.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  created_by ENUM('kullanici','admin') NOT NULL DEFAULT 'kullanici',
  expires_at DATETIME NOT NULL,
  used_at    DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pwreset_token (token_hash),
  KEY ix_pwreset_user (user_id, used_at),
  CONSTRAINT fk_pwreset_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- user_profiles : 1:1, SAPMA-ONLY
-- Satir YOKSA kisiselestirme kapali ve siralama = bugunku editoryal akis.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id                INT UNSIGNED NOT NULL,
  -- ENUM: 8 sabit deger, hem panel duzenini hem agirlik matrisini suruyor.
  -- Yazim hatasi DB hatasi olmali (sources.source_type emsali).
  position_code          ENUM('ust-yonetim','strateji','tesvik-finansman','dis-ticaret',
                              'uretim-operasyon','enerji-surdurulebilirlik',
                              'mevzuat-hukuk','medya-iletisim') NOT NULL DEFAULT 'ust-yonetim',
  time_budget_min        TINYINT UNSIGNED NOT NULL DEFAULT 5,   -- 2 | 5 | 15
  -- VARCHAR: NACE listesi buyuyecek, ikincil sektorler zaten JSON'da.
  -- articles.category VARCHAR(60) ile ayni gerekce.
  primary_sector_code    VARCHAR(40) NULL,
  secondary_sector_codes JSON NULL,     -- ["C25","C29"], en cok 3
  region_focus           JSON NULL,     -- ["TURKIYE","AVRUPA"]
  interest_tag_slugs     JSON NULL,     -- en cok 12 slug
  -- YUMUSAK: skoru dusurur, FILTRELEMEZ.
  muted_tag_slugs        JSON NULL,
  -- Yapay zekaya kisinin baglamini aktarmak icin serbest alan.
  persona                JSON NULL,

  -- Profil vektoru. Qdrant'ta IKINCI KOLEKSIYON ACILMIYOR:
  -- kullanicilar arasi komsu arama kapsamda yok, ve ensureCollection()
  -- boyut uyusmazliginda koleksiyonu silip yeniden yaratiyor - ikinci
  -- koleksiyon bu riski ikiye katlardi.
  profile_hash           CHAR(40) NULL,   -- vektoru besleyen alanlarin sha1'i
  profile_vector         JSON NULL,       -- 768 float
  profile_vector_model   VARCHAR(80) NULL,
  profile_vector_dim     SMALLINT UNSIGNED NULL,
  -- Kayit isteginin ICINDE hesaplanmaz: embed()'in ilk cagrisi modeli
  -- yukluyor (EMBEDDING_LOAD_TIMEOUT_MS=300000). Kayit 'bekliyor' yazip
  -- doner, arka plan isi doldurur.
  profile_vector_status  ENUM('yok','bekliyor','hazir','hata') NOT NULL DEFAULT 'yok',
  profile_vector_built_at DATETIME NULL,

  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  KEY ix_profiles_vector_status (profile_vector_status),
  CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- user_newsletter_prefs : SAPMA-ONLY
-- Satir yoksa: haftalik, 08:00, min_band=YUKSEK.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_newsletter_prefs (
  user_id      INT UNSIGNED NOT NULL,
  frequency    ENUM('kapali','gunluk','haftalik') NOT NULL DEFAULT 'haftalik',
  send_hour    TINYINT UNSIGNED NOT NULL DEFAULT 8,    -- TRT
  send_weekday TINYINT UNSIGNED NULL,                  -- 1=Pzt..7=Paz, yalniz haftalik
  format       ENUM('ozet','tam') NOT NULL DEFAULT 'ozet',
  -- NULL => time_budget_min'den turet (2->5, 5->12, 15->30)
  max_items    TINYINT UNSIGNED NULL,
  min_band     ENUM('KRITIK','YUKSEK','ORTA','DUSUK') NOT NULL DEFAULT 'YUKSEK',
  only_changes TINYINT(1) NOT NULL DEFAULT 0,
  last_sent_at DATETIME NULL,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  KEY ix_newsletter_sched (frequency, send_hour),
  CONSTRAINT fk_newsletter_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- user_article_prefs : SAPMA-ONLY, tenant_source_prefs'in birebir kardesi
--
-- Olay gunlugu DEGIL, tek satir + NULL damgalar. Sebep: okuma yolu
-- "bu haber benim icin gizli mi" sorusunu articles.js'teki NOT EXISTS
-- kalibiyla ucuza sormali; append-only tablo her liste sorgusunda
-- GROUP BY isterdi. Ayrica durumlar dislayici degil (okundu + paylasildi
-- ayni anda olabilir).
--
-- Gizlemek veriyi SILMEZ; ?include_hidden=1 ile yine erisilir.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_article_prefs (
  user_id        INT UNSIGNED NOT NULL,
  article_id     INT UNSIGNED NOT NULL,
  hidden_at      DATETIME NULL,
  hidden_reason  ENUM('alakasiz','sektorum-degil','zaten-biliyorum','cok-tekrar',
                      'kaynak-guvenilmez','diger') NULL,
  hidden_note    VARCHAR(200) NULL,
  read_at        DATETIME NULL,
  read_seconds   SMALLINT UNSIGNED NULL,
  saved_at       DATETIME NULL,
  shared_at      DATETIME NULL,
  share_count    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  shared_channel ENUM('eposta','whatsapp','linkedin','x','pano','pdf') NULL,
  feedback       ENUM('faydali','faydasiz') NULL,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, article_id),
  KEY ix_uap_user_hidden (user_id, hidden_at),
  KEY ix_uap_article (article_id),
  CONSTRAINT fk_uap_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE CASCADE,
  CONSTRAINT fk_uap_article FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- topic_threads : KONU / MEVZUAT DOSYASI
--
-- clusters YENIDEN KULLANILAMAZ, gerekcesi:
-- clusters "ayni OLAY kac bagimsiz kaynak yazdi" sorusunu yanitliyor ve
-- semanticMerge'un DORT kosulu da bir dosya kronolojisini engelliyor:
--   (1) kosinus >= 0,935 -> CBAM taslagi ile nihai tuzuk bu kadar benzemez
--   (2) FARKLI KAYNAK zorunlu -> dosyanin asamalarini genelde AYNI kaynak
--       yayinlar (Resmî Gazete, EUR-Lex)
--   (3) <= 4 gun ara -> dosya aylar surer
--   (4) sayisal uyum -> asamalarin rakamlari farklidir
-- clusters'i gevsetmek tekillestirmeyi bozar. Bu yuzden ayri ve kasten
-- daha gevsek bir katman; ama MAKINE yeniden kullanilir (embed,
-- searchNeighbors, union-find).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS topic_threads (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  thread_key      CHAR(40) NOT NULL,       -- sha1(cekirdek haberin url_hash'i)
  label           VARCHAR(300) NOT NULL,
  kind            ENUM('mevzuat','olay','kurum','serbest') NOT NULL DEFAULT 'serbest',
  anchor_tag_slug VARCHAR(80) NULL,        -- 'cbam', 'anti-damping'
  ref_code        VARCHAR(60) NULL,        -- '(AB) 2023/956', '11752 sayili', 'Section 232'
  member_count    SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  first_seen_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_article_id INT UNSIGNED NULL,
  -- Editor onayi. Onaysiz dosya kullaniciya yalnizca "olabilir" diye
  -- cekinceli gosterilir; ne "Dosya" sayfasi ne e-posta satiri uretir.
  is_confirmed    TINYINT(1) NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_threads_key (thread_key),
  KEY ix_threads_last (last_seen_at DESC),
  KEY ix_threads_anchor (anchor_tag_slug),
  KEY ix_threads_confirmed (is_confirmed, last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS topic_thread_items (
  thread_id       INT UNSIGNED NOT NULL,
  article_id      INT UNSIGNED NOT NULL,
  similarity      DECIMAL(4,3) NULL,
  -- Dosya bir KRONOLOJI: daima daha eskiye baglanir.
  prev_article_id INT UNSIGNED NULL,
  join_reason     ENUM('etiket','embedding','ref-kodu','editor','kume') NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (thread_id, article_id),
  KEY ix_tti_article (article_id),
  CONSTRAINT fk_tti_thread  FOREIGN KEY (thread_id)  REFERENCES topic_threads (id) ON DELETE CASCADE,
  CONSTRAINT fk_tti_article FOREIGN KEY (article_id) REFERENCES articles (id)      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_thread_follows (
  user_id     INT UNSIGNED NOT NULL,
  thread_id   INT UNSIGNED NOT NULL,
  followed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source      ENUM('otomatik','elle') NOT NULL DEFAULT 'elle',
  PRIMARY KEY (user_id, thread_id),
  KEY ix_utf_thread (thread_id),
  CONSTRAINT fk_utf_user   FOREIGN KEY (user_id)   REFERENCES users (id)         ON DELETE CASCADE,
  CONSTRAINT fk_utf_thread FOREIGN KEY (thread_id) REFERENCES topic_threads (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- article_changes : GLOBAL degisiklik gunlugu (kullanicidan bagimsiz)
-- Pipeline yazar, ayri is degil: bu olaylarin hepsi runPipeline()'in
-- zaten yaptigi isin yan urunu. Ayri bir is bunlari ogrenmek icin
-- kumelemeyi YENIDEN hesaplamak zorunda kalirdi.
--
-- change_key UNIQUE + INSERT IGNORE ile IDEMPOTENT. UNIQUE(article_id,
-- change_type, thread_id) ise YARAMAZ: MySQL'de NULL'lar birbirinden
-- farkli sayilir ve thread_id IS NULL satirlari cogalir.
--
-- band-yukseldi TUZAGI: bant yuzdelik tabanli ve recency her gece her
-- skoru degistiriyor; naif bir "skor degisti" olayi her gece 131 haberin
-- TAMAMINDA tetiklenir. Koruma: importance_factors'i RECENCY HARIC
-- karsilastir ve yalnizca YUKARI yonlu bant degisimini kaydet.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS article_changes (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  article_id  INT UNSIGNED NOT NULL,
  thread_id   INT UNSIGNED NULL,
  change_type ENUM('yeni','dosya-gelismesi','kume-buyudu','band-yukseldi','ozet-guncellendi') NOT NULL,
  detail      JSON NULL,      -- {"from":"ORTA","to":"KRITIK"} / {"prev_article_id":42,"similarity":0.941}
  change_key  CHAR(40) NOT NULL,
  run_id      INT UNSIGNED NULL,
  detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_changes_key (change_key),
  KEY ix_changes_detected (detected_at DESC),
  KEY ix_changes_type (change_type, detected_at),
  KEY ix_changes_thread (thread_id, detected_at),
  KEY ix_changes_article (article_id),
  CONSTRAINT fk_changes_article FOREIGN KEY (article_id) REFERENCES articles (id)        ON DELETE CASCADE,
  CONSTRAINT fk_changes_thread  FOREIGN KEY (thread_id)  REFERENCES topic_threads (id)   ON DELETE SET NULL,
  CONSTRAINT fk_changes_run     FOREIGN KEY (run_id)     REFERENCES collection_runs (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- user_article_scores : MATERYALIZE
--
-- OKUMA YOLU BU TABLOYA BAGIMLI DEGIL. Tablo bossa site yine dogru
-- siralar. Yalnizca istegi asmasi gerekenler icin gece yazilir:
--   - e-posta bulteni (yeniden uretilebilir ve denetlenebilir olmali)
--   - "son ziyaretten beri" deltalari
--
-- signals JSON: importance_factors'in kisisel karsiligi. Her bilesen ayri
-- yazilir; sonradan "bu neden ustte?" sorusu ancak boyle cevaplanabilir.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_article_scores (
  user_id         INT UNSIGNED NOT NULL,
  article_id      INT UNSIGNED NOT NULL,
  personal_score  DECIMAL(5,2) NOT NULL,
  final_score     DECIMAL(6,3) NOT NULL,
  is_pinned       TINYINT(1) NOT NULL DEFAULT 0,   -- KRITIK omurga tabani
  signals         JSON NOT NULL,
  weights_version VARCHAR(20) NOT NULL,
  computed_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, article_id),
  KEY ix_uascore_rank (user_id, is_pinned DESC, final_score DESC, article_id),
  CONSTRAINT fk_uascore_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE CASCADE,
  CONSTRAINT fk_uascore_article FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- app_settings : SMTP + yonetim ayarlari, tek anahtar/deger tablosu
--
-- Genis tek satirli ayar tablosu DEGIL: her yeni ayar bir ALTER TABLE
-- olmasin. Bedeli kolon basina tip yok -> uygulama katmaninda zod semasi
-- (zod zaten bagimlilikta).
--
-- is_secret=1 olan degerler API yanitinda ASLA dondurulmez, yalnizca
-- "tanimli/tanimsiz" bilgisi verilir. SMTP sifresi AES-256-GCM ile
-- SETTINGS_SECRET anahtariyla saklanir. SETTINGS_SECRET yoksa sifre
-- kaydetmeyi REDDET ve admine soyle - sessizce duz metin yazmak en kotu
-- secenek.
--
-- Anahtarlar: smtp, auth, personalization, digest, branding
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(80) NOT NULL,
  value       JSON NOT NULL,
  is_secret   TINYINT(1) NOT NULL DEFAULT 0,
  updated_by  INT UNSIGNED NULL,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key),
  CONSTRAINT fk_settings_user FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- email_log
-- Govde SAKLANMAZ (KVKK + boyut), yalnizca ozeti. article_ids "ayni
-- haberi iki kez gondermeyelim" icin.
-- uq_email_once: is iki kez kosarsa bulten iki kez gitmesin.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_log (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id             INT UNSIGNED NULL,      -- kullanici silinse de kayit kalsin
  to_email            VARCHAR(190) NOT NULL,  -- anlik kopya (e-posta degisebilir)
  kind                ENUM('dogrulama','sifre-sifirlama','bulten','davet','paylasim','uyari','test') NOT NULL,
  digest_date         DATE NULL,
  subject             VARCHAR(300) NULL,
  body_hash           CHAR(40) NULL,
  article_ids         JSON NULL,
  status              ENUM('kuyrukta','gonderildi','hata','iptal') NOT NULL DEFAULT 'kuyrukta',
  error               VARCHAR(500) NULL,
  provider_message_id VARCHAR(190) NULL,
  attempt_count       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  report_id           INT UNSIGNED NULL,
  queued_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at             DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email_once (user_id, kind, digest_date),
  KEY ix_email_status (status, queued_at),
  KEY ix_email_user (user_id, kind, sent_at DESC),
  CONSTRAINT fk_email_user   FOREIGN KEY (user_id)   REFERENCES users (id)   ON DELETE SET NULL,
  CONSTRAINT fk_email_report FOREIGN KEY (report_id) REFERENCES reports (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
