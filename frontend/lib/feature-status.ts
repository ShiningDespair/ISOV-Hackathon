/**
 * OZELLIK DURUMU — TEK DOGRULUK KAYNAGI
 *
 * Elle yazilan bir "sunlar calisiyor" metni kacinilmaz olarak gercegi
 * yansitmayi birakir. Bu yuzden durum bilgisi YALNIZCA burada tutulur:
 *   - /durum sayfasi bu diziyi render eder
 *   - arayuzdeki yarim ozellikler AYNI diziden rozet alir
 *     (<DurumRozeti id="..." />)
 * Boylece sayfa ile arayuz ayrisamaz.
 *
 * KURAL: Bir ozellik uzerinde calisan herkes bitirince buradaki satirini
 * gunceller. "calisiyor" demek icin `nasil` alani DOLDURULMUS olmali —
 * yani nasil dogrulandigi yazili olmali. Dogrulanmamis sey "calisiyor"
 * olarak isaretlenmez.
 */

export type Durum = "calisiyor" | "kismi" | "arayuz" | "yok";

export const DURUM_LABELS: Record<Durum, string> = {
  calisiyor: "Çalışıyor",
  kismi: "Kısmi",
  arayuz: "Arayüz hazır, işlev yok",
  yok: "Henüz yok",
};

export const DURUM_SIRA: Durum[] = ["calisiyor", "kismi", "arayuz", "yok"];

export type Alan =
  | "hesap"
  | "kisiselestirme"
  | "panel"
  | "haber"
  | "takip"
  | "dagitim"
  | "yonetim"
  | "erisilebilirlik";

export const ALAN_LABELS: Record<Alan, string> = {
  hesap: "Hesap ve Oturum",
  kisiselestirme: "Kişiselleştirme",
  panel: "Panel ve Görünümler",
  haber: "Haber İşlemleri",
  takip: "Takip ve Değişiklikler",
  dagitim: "Dağıtım (PDF / E-posta)",
  yonetim: "Yönetim",
  erisilebilirlik: "Erişilebilirlik",
};

export interface Ozellik {
  id: string;
  ad: string;
  durum: Durum;
  alan: Alan;
  /** Calisiyorsa NASIL dogrulandigi. Bos ise "calisiyor" denemez. */
  nasil?: string;
  /** Kismi/arayuz ise ne eksik. */
  eksik?: string;
  /** Neden eksik — kullaniciya durust aciklama. */
  neden?: string;
}

/**
 * BASLANGIC DURUMU.
 * Ajanlar isini bitirdikce kendi satirlarini olculen gercege gore
 * guncelleyecek. Su an cogu "yok" — is baslamadan once oldugu gibi.
 */
export const OZELLIKLER: Ozellik[] = [
  // --- Zaten calisan, olculmus olanlar -----------------------------
  {
    id: "dort-gorunum",
    ad: "Dört görünüm varyantı (Panel, Gazete, Görsel, Kart)",
    durum: "calisiyor",
    alan: "panel",
    nasil:
      "Dördü de DOM'a basılıyor, CSS seçiyor. 4 görünüm × ekran/yazdırma = 8 senaryo postcss ile doğrulandı.",
  },
  {
    id: "tekillestirme",
    ad: "Haber tekilleştirme (diller arası dahil)",
    durum: "calisiyor",
    alan: "haber",
    nasil:
      "131 haberden 115 tekil, 16 tekrar elendi (%12,2). 11 çok kaynaklı küme; eşik 0,935 yanlış pozitifi sıfırlayan en düşük değer olarak ölçüldü.",
  },
  {
    id: "gizli-onem-skoru",
    ad: "Gizli önem skoru ve yüzdelik bantlar",
    durum: "calisiyor",
    alan: "haber",
    nasil:
      "6 bileşenli skor, importance_factors JSON'unda açıklanabilir. Bant yüzdelik tabanlı: 11 KRİTİK / 33 YÜKSEK / 41 ORTA / 30 DÜŞÜK. API'de ?reveal=1 olmadan skor null döner.",
  },
  {
    id: "haber-gorselleri",
    ad: "Haber görselleri (og:image)",
    durum: "kismi",
    alan: "haber",
    nasil: "131 haberin 80'inde gerçek görsel bulundu (%61,1), hepsi og:image üzerinden.",
    eksik: "51 haberde görsel yok; tipografik yer tutucu basılıyor.",
    neden:
      "Resmî Gazete (20 haber) ara sertifika göndermiyor, 8 kaynak bot engeli uyguluyor. Mevzuat sayfaları zaten görsel taşımıyor.",
  },
  {
    id: "erisilebilirlik",
    ad: "Erişilebilirlik ayarları (11 ayar)",
    durum: "calisiyor",
    alan: "erisilebilirlik",
    nasil:
      "Yazı tipi (Atkinson Hyperlegible, Lexend), boyut, satır/harf/kelime aralığı, kontrast, renk körlüğü paletleri, okuma cetveli. Widget ve /ayarlar aynı bileşeni kullanıyor.",
  },
  {
    id: "kaynak-izleme",
    ad: "Kurum bazlı kaynak izleme",
    durum: "calisiyor",
    alan: "yonetim",
    nasil:
      "Bir kaynak izlemeden çıkarılınca panel 115 → 95 haber gösteriyor, filtresiz sorgu hâlâ 115 dönüyor. Veri silinmiyor.",
  },
  {
    id: "kaynak-oner",
    ad: "Kaynak önerisi ve değerlendirme",
    durum: "calisiyor",
    alan: "yonetim",
    nasil: "Öneri gönderme, aynı adres 409, kabul edilince sources'a tek transaction ile ekleniyor.",
  },
  {
    id: "rapor-pdf-tarayici",
    ad: "Rapor yazdırma / tarayıcıdan PDF",
    durum: "calisiyor",
    alan: "dagitim",
    nasil:
      "40 haber 5 bölge başlığı altında basılıyor. Yazdırma cascade'i 4 görünümün hepsinde gazete yuvasını basıyor.",
  },

  // --- Bu iste yapilacaklar (ajanlar guncelleyecek) ------------------
  {
    id: "kayit-giris",
    ad: "Kayıt, giriş ve oturum",
    durum: "calisiyor",
    alan: "hesap",
    nasil:
      "8 uç canlı: /auth/register, /auth/login, /auth/logout, /auth/me, /auth/password, " +
      "/auth/password/reset-request, /auth/password/reset, /auth/policy. Çerez akışı gerçek " +
      "istemciyle ölçüldü (curl -c/-b): kayıt 201 + isov_session çerezi, /auth/me 200, çıkış " +
      "sonrası AYNI çerezle /auth/me 401. Şifre özeti veritabanında scrypt$16384$8$1$ öneki " +
      "ile duruyor (32 bayt tuz, 64 bayt özet); sessions.token_hash = çerez değerinin sha256'sı " +
      "ve çerezin kendisinden farklı (ham token saklanmıyor). 5 hatalı şifre hesabı 15 dakika " +
      "kilitliyor ve kilitliyken DOĞRU şifre de 423 alıyor. IP hız sınırı ölçüldü: /auth/login " +
      "11. denemede 429. Var olmayan e-posta ile var olan e-posta aynı mesajı ve benzer süreyi " +
      "döndürüyor (~0,09 s / ~0,10 s, 3 ölçüm), yani hesap varlığı sızmıyor. Şifre sıfırlama " +
      "202 dönüyor, token yanıtta yok, tek kullanımlık (ikinci kullanım 400) ve tüm oturumları " +
      "iptal ediyor. last_seen_at/prev_seen_at 30 dakika kuralı üç durumda doğrulandı.",
  },
  {
    id: "kayit-sihirbazi",
    ad: "Adım adım kayıt sihirbazı (6 adım)",
    durum: "kismi",
    alan: "hesap",
    nasil:
      "Altı adım (hesap · pozisyon · sektör · ilgi alanları · vakit · bülten) çalışıyor: " +
      "her adımın varsayılanı hazır, geri gidilebiliyor, hata satırları aria-live ile " +
      "duyuruluyor, odak adım değişince yeni başlığa gidiyor. Seçenekler canlı uçlardan " +
      "geliyor: GET /api/meta/taxonomy 200 (8 pozisyon + türetilmiş panel düzeni, 26 NACE, " +
      "density) ve GET /api/meta/interests 200 (72 etiket, kullanıma göre azalan). Hesap " +
      "oluşturma sihirbazın gönderdiği gövdeyle denendi (curl -c): POST /auth/register 201 " +
      "+ isov_session çerezi, ardından GET /auth/me aynı kullanıcıyı döndürdü. Sayfalar " +
      "backend TAMAMEN kapalıyken de 200 dönüyor (sunucu tarafında istek yok).",
    eksik:
      "Profil ve bülten tercihleri KAYDEDİLMİYOR: ölçüm anında PUT /me/profile ve " +
      "PUT /me/newsletter 501 döndü. Bu durumda kayıt geçerli sayılıyor — kullanıcı " +
      "\"hesap oluşturuldu, tercihler kaydedilemedi\" özetini ve ayarlar bağlantısını " +
      "görüyor, girdikleri kaybolmuyor.",
    neden:
      "/me uçları ayrı bir iş kaleminde; dosyaları yazıldı ama ölçüm anında çalışan sürüm " +
      "hâlâ yer tutucuydu. Arayüz 501 ile 404'ü AYRI gösteriyor: 501 \"bu özellik henüz " +
      "uygulanmadı\", 404 \"sunucuya ulaşılamadı\". Taksonomi hiç gelmezse sihirbaz yerel " +
      "yedek listeyle çalışmayı sürdürür, boş ekran göstermez.",
  },
  {
    id: "onboarding-animasyon",
    ad: "Kayıt sonrası derleme ekranı",
    durum: "arayuz",
    alan: "hesap",
    eksik:
      "KOZMETİK. Kullanıcının seçimlerinden üretilen 4 metin sırayla akar, şerit ilerler, ~3,6 saniye sonra panele yönlendirir. Arka planda HİÇBİR İŞ YAPILMIYOR: haber toplanmıyor, özet üretilmiyor, profil vektörü hesaplanmıyor.",
    neden:
      "Kasten kozmetik: gerçek toplama gece işinin görevi ve profil vektörü kayıt isteğinin içinde hesaplanamaz (embed() ilk çağrıda modeli yüklüyor). Ekranın metinleri bu yüzden \"hazırlanıyor / derleniyor\" diyor, \"sizin için yeni haber topluyoruz\" DEMİYOR; ekranın altında kozmetik olduğu yazılı. prefers-reduced-motion ve data-a11y-motion=\"azalt\" durumunda animasyon hiç oynamaz, doğrudan yönlendirir.",
  },
  {
    id: "roller",
    ad: "Roller (üye / editör / admin)",
    durum: "calisiyor",
    alan: "hesap",
    nasil:
      "users.role ENUM('uye','editor','admin') + requireAuth / requireRole yardımcıları " +
      "(lib/session.js, middleware/session.js üzerinden yeniden ihraç). Uçtan uca ölçüldü: " +
      "GET /api/admin/users oturumsuz 401, rol=uye ile 403 (\"Bu işlem için Yönetici yetkisi " +
      "gerekiyor.\"), rol=admin ile 200. Birim düzeyinde 7 kombinasyon denendi; oturumsuz istek " +
      "403 değil 401 alıyor ki arayüz \"giriş yap\" ile \"yetkin yok\" ayrımını yapabilsin. " +
      "Oturum JWT değil DB tabanlı olduğu için admin panelden yapılan rol değişikliği AÇIK " +
      "oturumda anında etkili — ölçüldü: rolü admin'e çevrilen kullanıcı yeniden giriş " +
      "yapmadan kurumlar arası sorgulama yetkisi kazandı. Admin kullanıcı `npm run migrate` " +
      "ile ADMIN_EMAIL/ADMIN_PASSWORD üzerinden tohumlanıyor (must_change_password=1).",
  },
  {
    id: "kurum-baglantisi",
    ad: "Kullanıcının kuruma bağlanması",
    durum: "calisiyor",
    alan: "hesap",
    nasil:
      "users.tenant_id -> tenants FK; kayıtta tenant_key doğrulanıyor (olmayan kurum 400, " +
      "verilmezse 'isov'). tenantKeyOf() artık OTURUMUN kurumunu tercih ediyor; query/başlık " +
      "biçimi yalnızca NODE_ENV!=='production' veya role='admin' iken kabul ediliyor. " +
      "İki kurumlu (isov + geçici baskakurum, ikincisinde 81 kaynağın tamamı is_watched=0) " +
      "çift yönlü sızıntı testi ölçüldü: isov üyesi ?tenant_key=baskakurum gönderdiğinde " +
      "articles.total=115 ve 81 izlenen kaynak (kendi kurumu) görüyor; baskakurum üyesi " +
      "?tenant_key=isov gönderdiğinde 0 ve 0 görüyor. X-Tenant-Key başlığı da aynı şekilde " +
      "yoksayılıyor. Admin olarak override KABUL ediliyor (total 0). NODE_ENV=production " +
      "sunucusunda oturumsuz ?tenant_key=baskakurum reddedilip 'isov'a düşüyor (115). " +
      "articles.js artık elle req.query okumuyor, tenantKeyOf()'tan geçiyor.",
  },
  { id: "profil-ayarlari", ad: "Profil ayarları (pozisyon, sektör, ilgi, vakit)", durum: "yok", alan: "hesap" },

  {
    id: "kisisel-siralama",
    ad: "Kişisel haber sıralaması",
    durum: "calisiyor",
    alan: "kisiselestirme",
    nasil:
      "GET /articles?sort=kisisel (oturumsuz 401). 8 pozisyon için birer profil kurulup 118 tekil haberin tamamı skorlandı — aday küme tavanı 300 olduğu için yaklaşıklık hatası sıfır. KULLANICININ GÖRDÜĞÜ ilk 10'da çiftler arası örtüşme medyanı 5/10 (en ayrık çift Enerji ↔ Üretim 2/10, en yakın Mevzuat ↔ Üst Yönetim 7/10). Bileşen standart sapmaları: bölge 26,25 · sektör 23,28 · pozisyon-konu 18,13 · semantik 17,86 · ilgi 13,12.",
    eksik:
      "6 bileşenden biri — source_affinity — kalibrasyonda atıldı; ağırlığı position_topic'e aktarıldı (0,30 → 0,36).",
    neden:
      "115 haber üzerinde ölçülen standart sapması 0,00 puan (eşik 8). Okuma geçmişi (user_article_prefs.read_at) boş ve tenant_source_prefs'te tek satır var, bu yüzden bileşen her habere aynı 50'yi veriyordu — ağırlıklandırılsa gizli bir sabit terim olurdu. Hesaplanmaya devam ediyor ve ?reveal=1 ile görünüyor; okuma geçmişi birikince kalibrasyon yeniden koşulur.",
  },
  {
    id: "semantik-katman",
    ad: "Anlamsal eşleştirme (profil vektörü)",
    durum: "calisiyor",
    alan: "kisiselestirme",
    nasil:
      "Profil vektörü user_profiles.profile_vector'da (768 boyut, Xenova/multilingual-e5-base, yerel CPU, API anahtarı yok); Qdrant'ta ikinci koleksiyon açılmadı. 8 profilin hepsi 'hazir' oldu ve aday kümenin 99-101/115 haberi sıralandı. Bileşen MUTLAK KOSİNÜS DEĞİL, aday küme içindeki SIRA: ölçülen standart sapması 17,86 puan. Mutlak kosinüs kullanılsa dağılım sıkışık (medyan 0,8585) olduğu için bileşen sabit terime dönüşürdü.",
    eksik:
      "Vektör kayıt isteğinin içinde üretilmiyor: profil kaydedilince durum 'bekliyor' yazılır, arka plan işi (npm run profile-vectors) doldurur.",
    neden:
      "embed()'in ilk çağrısı modeli yüklüyor — sıcak önbellekte ölçülen 16,6 saniye, soğuk önbellekte ~1,1 GB indirme. Kayıt isteği bunu bekleyemez. Vektör hazır olmayan kullanıcı yine sıralanır, semantik bileşen tabanı (50) alır.",
  },
  {
    id: "vakit-yogunlugu",
    ad: "Vakit bazlı içerik yoğunluğu (2/5/15 dk)",
    durum: "calisiyor",
    alan: "kisiselestirme",
    nasil:
      "GET /me/digest sayıldı: 2 dk → 5 haber, tek cümle (en uzunu 99 karakter, sınır 150); 5 dk → 12 haber × 3 madde; 15 dk → 30 haberin ilk 10'u tam özet + TÜM maddeler (5-6 madde), sonraki 20'si 3 madde. Metin ÜRETİLMİYOR, mevcut alanlardan seçiliyor: summary_short / summary_medium 131 haberde heuristik dolu (idempotent iş, ikinci koşumda 0 güncelleme), kolon boşsa okuma yolu anlık yardımcıya düşüyor.",
  },
  { id: "rol-bazli-ozet", ad: "Role göre özet metni", durum: "yok", alan: "kisiselestirme" },
  {
    id: "filtre-balonu-korumasi",
    ad: "Filtre balonu koruması (kritik haber enjeksiyonu)",
    durum: "calisiyor",
    alan: "kisiselestirme",
    nasil:
      "Koruma ORAN olarak uygulanıyor: her 5 slotun ilki korpus geneli KRİTİK habere ayrılıyor (interleavePinned), kalan slotlar kişisel sıralamaya gidiyor. Ölçüm: medya-iletişim profilinin 2 dakikalık ilk 5'inde 4 KRİTİK haber var — AB'nin Türkiye menşeli hasır çeliğe anti-damping kaydı (#67) ve ABD'nin Türk mukavva kutularına soruşturması (#92) dahil, bu profil 'ihracat' seçmemiş olmasına rağmen. 30 haberlik listede 11 KRİTİK'in TAMAMI yer alıyor. Her profilin ilk 10'u ile global ilk 10'un kesişimi medyan 5/10 — alarm eşiği 3/10'un üstünde, yani ne sansür ne dondurma.",
    eksik:
      "Önceki uygulama is_pinned'i SIRALAMA ANAHTARI yapıyordu (is_pinned DESC ilk anahtar).",
    neden:
      "Korpusta 11 KRİTİK haber olduğu için ilk 11 slot her kullanıcıda AYNI 11 haberdi; kullanıcının gördüğü ilk 10'da çiftler arası örtüşme 9-10/10 ölçüldü, yani kişiselleştirmenin görünür etkisi sıfırdı. Koruma, koruduğu şeyi yok ediyordu. Sözleşmede yazılı olan bir orandı ('her 5 slotun en az 1'i'), sert sıralama anahtarı değil — oran tabanlı serpiştirmeye çevrildi.",
  },

  {
    id: "rol-bazli-panel",
    ad: "Pozisyona göre ilk sayfa düzeni",
    durum: "kismi",
    alan: "panel",
    nasil:
      "/panelim dört düzeni de gerçekten ayrı çıktı veriyor; ölçüm curl + HTML sayımı (5 dk bütçesiyle): özet 3 KPI / 2 bölüm / 5 haber / 141 KB, aksiyon 4 KPI / 3 bölüm / 5 geri sayımlı kalem + 7 haber / 222 KB, operasyon 4 KPI / 3 bölüm / 2 çubuk grafik / 12 haber / 276 KB, takip 4 KPI / 4 bölüm / 6 takvim kalemi + 6 haber / 222 KB. Özet ölçülerek en kısa: her vakit bütçesinde 5 kalemde sabit ve en küçük HTML. Pozisyon eşlemesi frontend'de DEĞİL: 8 pozisyonun her biri için /auth/me'nin döndürdüğü layout alanı okundu (çerez taklit edilerek 8 istek, hepsi 200) ve beklenen düzeni verdi. Vakit bütçesi bağlayıcı: 2/5/15 dk sırasıyla 5/12/30 kalem basıyor (aksiyon 15 dk: 6 iş + 24 haber = 30).",
    eksik:
      "Gerçek düzen için /auth/me gerekiyor; o uç şu an 404/501 dönüyor. Bu yüzden düzen doğrulaması sahte bir /auth/me vekiliyle yapıldı, canlı oturumla değil.",
    neden:
      "Kullanıcı ve profil uçları paralel yazılıyor. Uç yayına girene kadar panel özet düzenine düşüyor, 'kişiselleştirme henüz etkin değil' notunu gösteriyor ve sort=kisisel göndermiyor — sayfa ne çöküyor ne boş kalıyor (501 vekili ve backend tamamen kapalı senaryolarında ikisi de HTTP 200).",
  },
  {
    id: "kpi-seridi",
    ad: "KPI şeridi ve basit grafikler",
    durum: "calisiyor",
    alan: "panel",
    nasil:
      "Göstergeler gerçek /stats/overview ve /articles toplamlarından geliyor: özet 115 tekil haber / 11 kritik / 81 kaynak; takip 11 mevzuat / 3 vergi; operasyon kategori toplamlarını limit=1 sorgularının total alanından okuyor. Grafikler hazır Charts.tsx bileşenleri (özet: tek küçük Sparkline, operasyon: 2 BarList). Sayı gelmeyen gösterge '—' basıyor: backend kapalıyken 3 KPI da '—' çıktı, sıfır uydurulmadı.",
  },
  {
    id: "manset-seridi",
    ad: "Yatay önemli konular şeridi",
    durum: "calisiyor",
    alan: "panel",
    nasil:
      "Dört düzenin hepsinde 8 başlık basılıyor (band=KRITIK sorgusu, API sırası korunur, 6'ya düşerse ana listeden tamamlanır). Otomatik kaydırma YOK; şerit kendi overflow-x:auto kabında, kap tabindex=0 ve adlandırılmış bölge olduğu için klavyeyle gezilebiliyor, yumuşak kaydırma prefers-reduced-motion ve data-a11y-motion=\"azalt\" ile kapanıyor. Sayfa gövdesi yatay kaymıyor.",
  },

  {
    id: "paylas",
    ad: "Paylaş (WhatsApp, e-posta, bağlantı)",
    durum: "kismi",
    alan: "haber",
    nasil:
      "Menü sunucu tarafında basılıyor (role=menu, oklarla gezinme, Escape, dışına tıklamada kapanma). Üretilen adresler ölçüldü: wa.me/?text=…, LinkedIn share-offsite, mailto (konu=başlık, gövde=başlık — kaynak + bağlantı). Paylaşım metninde özet YOK, kasıtlı.",
    eksik:
      "Tarayıcıda tıklama akışı (clipboard izni, navigator.share penceresi) elle doğrulanmadı.",
    neden:
      "Sunucuda tarayıcı yok; kopyalama ve cihaz paylaşımı yalnızca gerçek tarayıcıda ölçülebilir. Adres üretimi saf fonksiyon olarak lib/api-me.ts'te ve ölçüldü.",
  },
  {
    id: "paylas-sunucu",
    ad: "Sunucudan e-posta ile paylaşım",
    durum: "arayuz",
    alan: "haber",
    nasil:
      "Menüdeki form PUT /me/articles/:id/share {channel:'eposta', to} çağırıyor. 404 ve 501 yanıtlarında kullanıcıya Türkçe, SMTP'ye işaret eden açık hata gösterildiği ölçüldü — sessiz başarısızlık yok.",
    eksik: "Gerçek gönderim yok.",
    neden:
      "/me uçları henüz uygulanmadı (yer tutucu router 501, çalışan imaj 404) ve SMTP yapılandırması yok.",
  },
  {
    id: "haber-gizle",
    ad: "Haberi gizle ve gerekçe bildir",
    durum: "arayuz",
    alan: "haber",
    nasil:
      "Diyalog role=dialog + aria-modal, odak tuzağı, Escape ile kapanma, odak çağıran düğmeye dönüyor. Altı sebep slug'ı backend ENUM'uyla birebir (alakasiz, sektorum-degil, zaten-biliyorum, cok-tekrar, kaynak-guvenilmez, diger), not 200 karakterde kırpılıyor. PUT .../hide 404/501 dönerken 'henüz uygulanmadı' mesajı basılıyor, sayfa çökmüyor.",
    eksik:
      "Kalıcı gizleme ve 'geri al' çalışmıyor; iyimser kaldırma yalnızca açık sayfada geçerli.",
    neden: "/me/articles/:id/hide ucu henüz uygulanmadı.",
  },
  { id: "okuma-suresi", ad: "Haber okuma süresi göstergesi", durum: "yok", alan: "haber" },

  {
    id: "tarih-filtresi",
    ad: "Tarih aralığı filtresi",
    durum: "kismi",
    alan: "takip",
    nasil:
      "Hazır aralıklar Link, özel aralık <details> içinde GET formu — JS gerekmiyor. Daralma ölçüldü: filtresiz 115 haber → from=2026-09-10 ile 42 → +to=2026-09-11 ile 40; to=2026-09-01 ile 13; region=TURKIYE eklenince 9. Tarihler tr-TR / Europe/Istanbul (19.09.2026'da 'Son 7 gün' = 13–19 Eylül).",
    eksik:
      "Bülten sayfasının sağ üstüne yerleştirme entegrasyon adımında yapılacak; /degisiklikler sayfasında çalışıyor.",
    neden:
      "app/page.tsx ve components/Filters.tsx paralel çalışma yüzünden bu işte değiştirilmedi; bileşen prop alan biçimde bağımsız yazıldı.",
  },
  {
    id: "degisiklikler-paneli",
    ad: "Değişiklikler paneli",
    durum: "arayuz",
    alan: "takip",
    nasil:
      "/degisiklikler dev ve production derlemesinde 200 dönüyor, backend tamamen kapalıyken de çökmüyor. Örnek /changes yanıtıyla ölçüldü: 6 kayıt gün gün gruplandı, tür şeridi 6→1 daralttı, kısa ibareler doğru üretildi (\"2 kaynaktan 4'e\", \"Orta → Kritik\"), is_confirmed=0 kaydı \"aynı konuda gelişme olabilir\" diye çekinceli basıldı.",
    eksik:
      "Gerçek veri yok; uç 404/501 dönerken sayfa 'Değişiklik takibi henüz etkin değil' diyor, sayı uydurmuyor.",
    neden: "/api/changes henüz uygulanmadı (yer tutucu router 501 döner).",
  },
  {
    id: "son-ziyaretten-beri",
    ad: "Son ziyaretten beri yenilikler",
    durum: "calisiyor",
    alan: "takip",
    nasil:
      "GET /me/changes eşiği users.prev_seen_at'ten okur (last_seen_at DEĞİL: oturum orta katmanı onu her istekte NOW()'a çekiyor, eşik alınsa liste daima boş dönerdi); damga yoksa son 7 güne düşer. Bugün 235 olay dönüyor: 115 yeni, 115 özet-güncellendi, 5 dosya-gelişmesi. Kullanıcının gizlediği haberin değişikliği akışta da görünmez.",
    eksik:
      "band-yukseldi ve kume-buyudu türleri bu korpusta hiç tetiklenmedi — gerçek bir yükselme/büyüme olmadı.",
    neden:
      "Tuzak koruması ölçüldü: takvim geriye alınıp recency değiştirildiğinde 31 / 6 / 7 haberin bandı yukarı kaydı ve naif bir 'bant değişti' dedektörü o kadar sahte olay yazardı; recency-hariç çekirdek skor karşılaştırması 0 yazdı. Yani tür çalışıyor, yalnızca takvim gürültüsüne tetiklenmiyor.",
  },
  {
    id: "dosya-takibi",
    ad: "Aynı mevzuat dosyasında gelişme takibi",
    durum: "kismi",
    alan: "takip",
    nasil:
      "clusters'tan AYRI bir topic_threads katmanı; makine (embedding, Qdrant komşuluğu, union-find) yeniden kullanıldı, ikinci koleksiyon açılmadı. Hattın 4. adımı olarak koşuyor ve idempotent: pipeline iki kez çalıştırıldı, article_changes 120 satırda sabit kaldı. 115 haberde 4 dosya / 9 üye / 5 gelişme olayı üretildi ve eşleşmeler TEK TEK ELLE incelendi: 3 dosya doğru (COP31 Antalya, TCMB faiz kararı, AB alüminyum hurdası ihracat kısıtlaması), 1 dosya yanlış (Brent petrol fiyatı) → yanlış pozitif %25; kenar bazında 1/5 = %20.",
    eksik:
      "Onaylı (is_confirmed=1) dosya YOK — hepsi çekinceli gösterilmeli ve sıralamaya en çok +2 etki ediyor. Sözleşmedeki eşikler yetmediği için sıkılaştırıldı: kosinüs 0,88 → 0,915, çapa etiket ve mevzuat referans kodu için 'en çok 3 haberde geçmeli' sınırı, küresel union-find yerine kimlik kapsamlı gruplama.",
    neden:
      "0,88 eşiği korpusun kendi gürültü dağılımında ~p88 (sözleşmenin ölçümü: p90 = 0,8870), yani tek başına kanıt değil. 'abd' (10 haber), 'kobi' (15), 'anti-damping' (7) gibi TEMA etiketleriyle birleşince küresel union-find zincirleme yaptı ve 44 ile 14 üyeli sahte dosyalar üretti. Sıkılaştırmanın bedeli düşen recall: doğru olduğu elle görülen ABD-Kanada Section 338 tarife dosyası artık kaçırılıyor, çünkü o kodun geçtiği haber sayısı 4 > 3. Katman recall değil precision için ayarlandı.",
  },

  {
    id: "pdf-sunucu",
    ad: "Sunucu tarafında PDF üretimi",
    durum: "calisiyor",
    alan: "dagitim",
    nasil:
      "Chromium 153 konteyner imajında kurulu (puppeteer-core + sistem chromium). Rapor #1'den GERÇEK dosya üretildi: günlük şablon 2 sayfa / 106 KB, haftalık şablon 5 sayfa / 187 KB. GET /api/reports/:id/pdf oturumsuz 401, oturumlu 200 application/pdf (%PDF-1.4 imzası doğrulandı), olmayan rapor 404. Türkçe: pdftotext çıktısında İ Ğ Ü Ş Ö Ç ı ğ ü ş ö ç harflerinin hepsi var, 0 adet bozuk karakter; gömülü fontlar Liberation Serif/Sans (fallback'e düşmedi). Tarayıcı örneği yeniden kullanılıyor — ilk PDF 2,3 sn, ikincisi 0,45 sn; 5 dakika boşta kalınca kapanıyor.",
    eksik:
      "İki şablon var (günlük, haftalık); aylık/özel raporlar haftalık şablonla basılıyor. Haber görselleri PDF'e girmiyor.",
    neden:
      "Görselleri PDF'e gömmek üretimi ağa bağımlı ve yavaş yapardı; tasarım kasıtlı olarak tipografik ve infografik ağırlıklı (saf SVG, harici kütüphane yok).",
  },
  {
    id: "smtp-ayarlari",
    ad: "SMTP yapılandırması",
    durum: "kismi",
    alan: "dagitim",
    nasil:
      "Yönetim panelinden host/port/TLS/kullanıcı/gönderen kaydediliyor. SETTINGS_SECRET tanımsızken şifre kaydetme denemesi 400 + SETTINGS_SECRET_YOK ile REDDEDİLDİ ve app_settings'e hiçbir satır yazılmadı (ölçüldü: 0 satır). Anahtar tanımlıyken şifre AES-256-GCM ile saklandı — veritabanında yalnızca v1:iv:tag:ciphertext duruyor, düz metin araması 0 satır döndü; API yanıtlarında (GET /admin/settings, /settings/smtp, /overview) şifre yerine yalnızca password_tanimli:true geçiyor. Yanlış anahtarla okuma sessizce geçmedi, SIR_COZULEMEDI hatası verdi.",
    eksik:
      "Gerçek e-posta gönderimi doğrulanamadı; test düğmesi yalnızca denemenin sonucunu kaydediyor.",
    neden:
      "Çalışan bir SMTP hesabı/şifresi yok. (nodemailer artık kurulu — dağıtım katmanıyla birlikte eklendi.) Test ucu bu durumda 200 dönüp email_log'a status='hata' + 'SMTP yapılandırılmadı' yazıyor — sessizce başarılı görünmüyor, neden ekranda yazılı.",
  },
  {
    id: "bulten-gonderimi",
    ad: "Günlük / haftalık bülten gönderimi",
    durum: "kismi",
    alan: "dagitim",
    nasil:
      "Hat uçtan uca ölçüldü. Bir kullanıcı için kişisel sıralamayla 12 haber seçildi, e-posta gövdesi (tablo tabanlı, Outlook uyumlu) ve 3 sayfalık PDF eki üretildi. Yerel bir SMTP sunucusuna karşı GERÇEK gönderim yapıldı: MIME multipart + PDF eki teslim edildi, Türkçe konu RFC 2047 ile doğru kodlandı, email_log'a status='gonderildi' ve provider_message_id yazıldı. SMTP yokken sendMail istisna FIRLATMADI, email_log'a status='hata' + neden yazdı. Aynı gün ikinci koşumda bülten ikinci kez gitmedi (önce kendi kontrolü, force ile atlandığında uq_email_once; email_log'da tek satır kaldı). Hız sınırı ölçüldü: aynı alıcıya 7 deneme → 5 kayıt, 6. ve 7. 'hiz-siniri' ile reddedildi.",
    eksik:
      "Gerçek bir SMTP sağlayıcısına (Gmail, kurumsal posta vb.) gönderim doğrulanmadı. Zamanlayıcı hiç gerçek zamanlı koşmadı.",
    neden:
      "Demo makinesinde çalışan bir SMTP hesabı ve şifresi yok; doğrulama yerel bir SMTP sunucusuyla yapıldı, bu yolla teslimat (SPF/DKIM, sağlayıcı kabulü) ölçülemez. Zamanlayıcı ise DIGEST_SCHEDULER_ENABLED ile VARSAYILAN KAPALI — demo sırasında istenmeyen e-posta gitmesin diye bilinçli tercih; açıkken başlatıldığı ayrıca doğrulandı.",
  },
  {
    id: "bulten-abonelik",
    ad: "Kullanıcı başına bülten aboneliği",
    durum: "calisiyor",
    alan: "dagitim",
    nasil:
      "Sapma-only: tercih satırı OLMAYAN kullanıcı da varsayılanla (haftalık, 08:00 TRT, Pazartesi, min_band=YÜKSEK) bültene giriyor. Ölçüldü: Pazartesi 08:00'de 14 aday, aynı gün 09:00'da 0, Salı 08:00'de 0. Bir kullanıcıya günlük/17:00 tercihi yazılınca Salı 17:00'de yalnızca o kullanıcı aday oldu, 18:00'de aday çıkmadı; frequency='kapali' yapılınca listeden düştü. Haber sayısı vakit bütçesinden türüyor (2 dk→5, 5 dk→12, 15 dk→30) ve max_items verilmişse o kazanıyor (max_items=4 → 4 haber).",
    eksik:
      "only_changes ve format='tam' seçenekleri kodda uygulanıyor ama canlı veriyle ölçülmedi (article_changes tablosu bu korpusta boş).",
    neden:
      "Değişiklik günlüğünü pipeline dolduruyor; bu korpus tek seferlik seed edildiği için henüz değişiklik kaydı üretilmedi.",
  },

  {
    id: "admin-paneli",
    ad: "Admin paneli",
    durum: "calisiyor",
    alan: "yonetim",
    nasil:
      "/admin sekiz bölüm basıyor: Genel Bakış, Kullanıcılar, Genel Ayarlar, SMTP, Kişiselleştirme, Bülten, Gönderim Kaydı, NACE Kapsamı. Yetki üç yoldan ölçüldü: oturumsuz istek /giris'e yönlendi (307, ?devam=/admin), on bir /api/admin ucu oturumsuz 401, üye oturumuyla 403, yönetici oturumuyla 200 döndü. Kişiselleştirme ağırlıkları deploy'suz değişiyor (tek kaydırıcı; toplamı 1 olmayan çift 400 ile reddediliyor). Üretim derlemesi izole kopyada temiz: tsc --noEmit hatasız, next build /admin dahil 14 rota üretti, yon- sınıflarının tamamı üretilen CSS'te.",
    eksik:
      "Panelin tarayıcı içi tıklama akışı el ile denenmedi (sunucuda tarayıcı yok); yerine her uç gerçek yönetici ve üye oturumlarıyla tek tek çağrıldı.",
  },
  {
    id: "kullanici-yonetimi",
    ad: "Kullanıcı ve rol yönetimi",
    durum: "calisiyor",
    alan: "yonetim",
    nasil:
      "14 kullanıcı üzerinde ölçüldü: sayfalı liste, ad/e-posta/unvan araması (LIKE jokeri kaçırılıyor — q=% aramasında 14 değil 0 sonuç), rol ve durum süzgeci, sunucu tarafı sıralama. Yanıtların hiçbirinde password_hash geçmiyor. SON YÖNETİCİ KORUMASI iki katman ve ikisi de test edildi: yönetici kendi rolünü düşürmeyi denediğinde 400, geride aktif yönetici bırakmayan değişiklik 400; iki yönetici varken birini düşürmek 200. Hesap askıya alındığında açık oturumlar iptal ediliyor. Şifre sıfırlama bağlantısı üretildi: veritabanında yalnızca sha256 özeti duruyor (düz token araması 0 satır), süre 2 saat (119 dk ölçüldü), POST /auth/password/reset ile bir kez çalıştı, aynı token ikinci kullanımda 400 döndü.",
  },
  {
    id: "nace-kapsami",
    ad: "NACE sektör kapsamı göstergesi",
    durum: "calisiyor",
    alan: "yonetim",
    nasil:
      "GET /admin/nace-coverage, 131 haberin entities.sektor alanını lib/sectors.js sözlüğüyle eşleştirip 26 NACE kalemini sayıyor. Gerçek sonuç: 25 kalemde veri var, yalnızca C18 (Basım ve yayım) boş; 6 kalem eşiğin altında (tekil haber < 5): B, C16, C21, C31, E36, G. En kalın kalemler C28 makine 38, C24 ana metal 32, D35 enerji 30, C20 kimya 28. Hangi terimin tuttuğu satır bazında yazılı; sözlükte karşılığı olmayan 11 terim ayrı listede.",
    eksik:
      "Uç yalnızca yöneticiye açık (CONTRACT: /admin/* role='admin' ister), bu yüzden /durum sayfası oturumsuz açıldığında bölümü basmıyor.",
  },

  // --- /durum sayfasi ve arayuz rozeti -------------------------------
  {
    id: "durum-sayfasi",
    ad: "Özellik durumu sayfası (/durum) ve arayüz rozeti",
    durum: "calisiyor",
    alan: "yonetim",
    nasil:
      "Sayfa feature-status.ts'i render ediyor: sayaçlar dizi ile birebir tutuyor (HTML'de basılan ad sayısı = OZELLIKLER.length), oturum gerekmiyor, backend kapalıyken de 200 dönüyor. Rozet bilinmeyen id ile null dönüyor, sayfa çökmüyor. NACE kapsam ucu yokken bölüm hiç basılmıyor.",
  },
];

/** Tek ozellige erisim — rozet bileseni bunu kullanir. */
const BY_ID = new Map(OZELLIKLER.map((o) => [o.id, o]));

export function ozellikById(id: string): Ozellik | null {
  return BY_ID.get(id) ?? null;
}

export function ozellikSayilari(): Record<Durum, number> {
  const out: Record<Durum, number> = { calisiyor: 0, kismi: 0, arayuz: 0, yok: 0 };
  for (const o of OZELLIKLER) out[o.durum] += 1;
  return out;
}

/** Toplam ozellik sayisi — sayfa basliklari ve dogrulama icin. */
export function ozellikSayisi(): number {
  return OZELLIKLER.length;
}

/** Alan bazli grup — /durum sayfasi listeyi bu siraya gore basar. */
export interface AlanGrubu {
  alan: Alan;
  label: string;
  ozellikler: Ozellik[];
}

/**
 * Ozellikleri ALAN_LABELS sirasina gore gruplar.
 * `durum` verilirse yalnizca o durumdakiler dondurulur; bos kalan alan
 * grubu hic dondurulmez.
 */
export function ozellikleriAlanaGore(durum?: Durum | null): AlanGrubu[] {
  const gruplar: AlanGrubu[] = [];
  for (const [alan, label] of Object.entries(ALAN_LABELS) as [Alan, string][]) {
    const ozellikler = OZELLIKLER.filter(
      (o) => o.alan === alan && (!durum || o.durum === durum),
    );
    if (ozellikler.length > 0) gruplar.push({ alan, label, ozellikler });
  }

  // ALAN_LABELS'da karsiligi olmayan bir alan eklenirse ozellik LISTEDEN
  // DUSMEZ; sayaclar ile liste ayrisamasin diye ayri bir grupta gosterilir.
  const bilinenAlanlar = new Set(Object.keys(ALAN_LABELS));
  const artakalan = OZELLIKLER.filter(
    (o) => !bilinenAlanlar.has(o.alan) && (!durum || o.durum === durum),
  );
  if (artakalan.length > 0) {
    gruplar.push({
      alan: (artakalan[0] as Ozellik).alan,
      label: "Sınıflandırılmamış",
      ozellikler: artakalan,
    });
  }

  return gruplar;
}

/** Metin bir Durum degeri mi? URL parametresini dogrulamak icin. */
export function durumMu(deger: unknown): deger is Durum {
  return typeof deger === "string" && (DURUM_SIRA as string[]).includes(deger);
}
