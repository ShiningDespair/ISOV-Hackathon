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
    ad: "Haber görselleri ve kaynak amblemleri",
    durum: "calisiyor",
    alan: "haber",
    nasil:
      "131 haberin 80'inde gerçek og:image var (%61,1). Kalan 51'inde kaynağa özgü " +
      "satır içi SVG amblem basılıyor: 81 kaynağın TAMAMI bir betikle tarandı, 32'si " +
      "elle tasarlanmış kimliğe (Resmî Gazete, EUR-Lex, Federal Register, İSO, TOBB, " +
      "KOSGEB, TÜBİTAK, ECB, IEA, Eurostat, USTR…), 49'u kaynak türü arketipine " +
      "(basın 50 · kurum 17 · açık veri 6 · mevzuat 5 · uluslararası 3) düştü; boşa " +
      "düşen kaynak YOK. Üçüncü kademe (ad baş harfleri + ülke kodu) sentetik uç " +
      "durumlarla ayrıca sınandı: tür yok, bilinmeyen tür, hiç veri yok — üçünde de " +
      "boş kutu çıkmıyor. Ağ isteği ve dış dosya yok, palet @theme jetonlarından " +
      "türüyor (yeni marka rengi yok) ve slug hash'inden deterministik, yani aynı " +
      "kaynak her zaman aynı amblemi alıyor. data-a11y-image taşındığı için " +
      "\"Görselleri gizle\" ayarı amblemleri de gizliyor.",
    eksik:
      "Amblemler yalnızca GÖRSEL görünümünde basılıyor; panel, gazete ve kart " +
      "görünümleri tasarım gereği görselsiz. Resmî Gazete'nin 20 haberinin " +
      "hiçbirinde gerçek nüsha sayısı yok, künyeye sayı yerine yayım tarihi basılıyor.",
    neden:
      "Başlıklardaki \"Karar Sayısı: 11723\" Cumhurbaşkanı karar numarası, gazetenin " +
      "nüsha numarası DEĞİL; künyeye onu basmak yanlış bilgi olurdu. Sayı " +
      "UYDURULMUYOR: yalnızca 3xxxx aralığı kabul ediliyor ve öncesinde \"Karar\" " +
      "geçen eşleşme reddediliyor (7 birim sınaması). Gerçek sayı geçen bir başlıkta " +
      "amblem \"SAYI 32456\" basıyor.",
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
  {
    id: "profil-ayarlari",
    ad: "Profil ayarları (pozisyon, sektör, ilgi, vakit)",
    durum: "calisiyor",
    alan: "hesap",
    nasil:
      "/ayarlar sayfasının İLK bölümü. PUT /me/profile ucu baştan beri " +
      "çalışıyordu ama onu çağıran hiçbir ekran yoktu: pozisyon, sektör, ilgi " +
      "alanları ve vakit bütçesi yalnızca KAYIT SIRASINDA seçilebiliyor, sonra " +
      "bir daha değiştirilemiyordu. Form, kayıt sihirbazının kendi adım " +
      "bileşenlerini (AdimPozisyon / AdimSektor / AdimIlgi / AdimVakit) yeniden " +
      "kullanıyor — ikinci bir sektör arayüzü yazmak iki formun birbirinden " +
      "kayması demekti. Yeni /auth/me isteği atmıyor, SessionProvider'ın tek " +
      "çağrısını okuyor ve kayıttan sonra aynı bağlamı yeniliyor, böylece üst " +
      "bardaki Hesabım menüsü de güncel pozisyonu gösteriyor. \"Kaydet\" yalnızca " +
      "gerçek değişiklikte açılıyor (dizi karşılaştırması sırayı yok sayıyor) ve " +
      "durum metne yazılı — düğmenin sönük görünmesine bırakılmıyor.",
    eksik:
      "Bölge odağı (region_focus) ve persona alanı formda yok; ikisi de şemada " +
      "duruyor ve uç kabul ediyor.",
    neden:
      "Bölge odağı kişisel skorun en küçük ağırlıklı bileşeni (0,05) ve persona " +
      "ancak bir LLM anahtarı takıldığında iş yapıyor. Form bu turda kullanıcının " +
      "gerçekten değiştirmek istediği dört alanla sınırlı tutuldu.",
  },

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
    ad: "Vakit bazlı içerik yoğunluğu (2/5/10 dk)",
    durum: "calisiyor",
    alan: "kisiselestirme",
    nasil:
      "GET /me/digest sayıldı: 2 dk → 5 haber, tek cümle (en uzunu 99 karakter, sınır 150); 5 dk → 12 haber × 3 madde; 10 dk → 20 haberin ilk 6'sı tam özet + TÜM maddeler (5-6 madde), sonraki 14'ü 3 madde. Üçüncü kademe kullanıcının isteğiyle 15 → 10 dakikaya indi; eski kayıtlardaki 15 değeri geriye uyumlu eşleniyor (ölçüldü: GET /me/digest?time_budget=15 → 10 dk / 20 kalem / 6 tam özet). Aritmetik iki ölçekte doğrulandı — sözleşme özet boyuyla 6×46 sn + 14×16 sn + 20×2 sn tarama = 9,0 dk; bugünkü korpusun GERÇEK kelime sayımıyla (tam özet ort. 119 kelime, maddeli ort. 33,6 kelime) 6,6 dk. Eski 15 dk kademesi aynı ölçekte 13,0 / 10,3 dk veriyordu, yani adı yanlıştı. Metin ÜRETİLMİYOR, mevcut alanlardan seçiliyor: summary_short / summary_medium 131 haberde heuristik dolu (idempotent iş, ikinci koşumda 0 güncelleme), kolon boşsa okuma yolu anlık yardımcıya düşüyor.",
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
    durum: "calisiyor",
    alan: "panel",
    nasil:
      "Dört düzen de gerçekten ayrı çıktı veriyor; ölçüm curl + HTML sayımı (5 dk bütçesiyle): özet 3 KPI / 2 bölüm / 5 haber / 141 KB, aksiyon 4 KPI / 3 bölüm / 5 geri sayımlı kalem + 7 haber / 222 KB, operasyon 4 KPI / 3 bölüm / 2 çubuk grafik / 12 haber / 276 KB, takip 4 KPI / 4 bölüm / 6 takvim kalemi + 6 haber / 222 KB. Özet ölçülerek en kısa: her vakit bütçesinde 5 kalemde sabit ve en küçük HTML. Pozisyon eşlemesi frontend'de DEĞİL: 8 pozisyonun her biri için /auth/me'nin döndürdüğü layout alanı okundu (çerez taklit edilerek 8 istek, hepsi 200) ve beklenen düzeni verdi. Vakit bütçesi bağlayıcı: 2/5/10 dk sırasıyla 5/12/20 kalem basıyor.",
    eksik:
      "Panel ayrı bir sayfa olmaktan çıkıp bültenin \"Bana Özel\" akışı olduktan " +
      "sonra (/?akis=ozel) KB ölçümleri yeniden alınmadı: grafikler ve geniş KPI " +
      "ızgarası kalktığı için eski 141/222/276/222 KB sayıları geçersiz. " +
      "Operasyon düzeni artık 4 KPI + 2 bölüm + /istatistik bağlantısı.",
    neden:
      "Ölçümün kendisi değil sayısı bayat: düzenlerin gerçekten ayrıştığı ve " +
      "pozisyon eşlemesinin frontend'de TÜRETİLMEDİĞİ hâlâ geçerli. /auth/me " +
      "artık yayında (oturumsuz 401, 404/501 değil), yani düzen sahte bir " +
      "vekille değil gerçek uçla geliyor.",
  },
  {
    id: "kpi-seridi",
    ad: "KPI şeridi (sıkı tek satır)",
    durum: "calisiyor",
    alan: "panel",
    nasil:
      "Göstergeler gerçek /stats/overview ve /articles toplamlarından geliyor: " +
      "özet 115 tekil haber / 11 kritik / 81 kaynak; takip 11 mevzuat / 3 vergi; " +
      "operasyon kategori toplamlarını limit=1 sorgularının total alanından " +
      "okuyor. Sayı gelmeyen gösterge '—' basıyor: backend kapalıyken 3 KPI da " +
      "'—' çıktı, sıfır uydurulmadı. Kullanıcının şikâyeti üzerine (\"panelimde " +
      "KPIlar vs çok yer kaplıyo haber görmek için kaydırmak gerekiyor\") şerit " +
      "SIKI kipe alındı: iki sütunlu ızgara yerine saran tek satır, açıklama " +
      "metni ekrandan title niteliğine taşındı (silinmedi). CSS'i " +
      ".pano-kpi[data-sik=\"true\"] nitelik seçicisiyle yazıldı, çünkü kural " +
      "dosyası globals.css'ten ÖNCE yükleniyor ve aynı özgüllükte yazım " +
      "kaybediyordu. Grafikler /istatistik'e taşındı — ilk ekranı yiyen en " +
      "pahalı öğeydi.",
    eksik:
      "\"İlk haber başlığı ilk ekranda görünür\" kuralı GERÇEK TARAYICIDA " +
      "ölçülmedi; sunucuda tarayıcı yok.",
    neden:
      "Piksel yüksekliği ancak yerleşim motoruyla ölçülür. Ölçülebilen şey " +
      "basılan DOM öğesi sayısı ve bölüm sırası oldu: şeritten önce en çok bir " +
      "görünür not var, fazlası <details> içinde; grafik hiç yok.",
  },
  {
    id: "manset-seridi",
    ad: "Yatay önemli konular şeridi",
    durum: "calisiyor",
    alan: "panel",
    nasil:
      "Dört düzenin hepsinde 8 başlık basılıyor (band=KRITIK sorgusu, API sırası " +
      "korunur, 6'ya düşerse ana listeden tamamlanır). Şerit artık haber kanalı " +
      "alt yazısı gibi KENDİLİĞİNDEN ve yavaş kayıyor: liste iki kez basılıp tek " +
      "bir ray CSS ile translateX(0) → translateX(-50%) götürülüyor, dikiş " +
      "görünmüyor, JS zamanlayıcı yok. Süre başlık SAYISIYLA çarpılıyor (9 " +
      "sn/başlık, taban 30 sn) — 8 başlıkta 72 sn, 20 başlıkta 180 sn, yani " +
      "piksel/saniye hızı başlık sayısından bağımsız. Kayma yalnızca bir liste " +
      "kopyası kabı DOLDURUYORSA açılıyor (ResizeObserver ile ölçülüyor); " +
      "açılmasa dönüş noktasında boşluk görünürdü. Sunucu çiziminde kapalı " +
      "başlıyor, yani JS hiç çalışmazsa şerit bozulmuyor, yalnızca kaymıyor. " +
      "Hover, focus-within ve Duraklat/Oynat düğmesiyle duruyor — düğme WCAG " +
      "2.2.2 gereği (5 saniyeden uzun otomatik harekette kullanıcı kontrolü " +
      "zorunlu), süs değil. İkinci liste aria-hidden ve İÇİNDE BAĞLANTI YOK " +
      "(span basılıyor), yani ekran okuyucu başlıkları iki kez okumuyor ve " +
      "kopyada odaklanabilir öğe sıfır (jsdom'da sayıldı). " +
      "prefers-reduced-motion ve data-a11y-motion=\"azalt\" altında hareket hiç " +
      "yok: kopya ve düğme hem CSS'te hem React'te basılmıyor, şerit " +
      "overflow-x:auto + tabindex=0 kabında ok tuşlarıyla gezilen eski hâline " +
      "düşüyor. Özgüllük postcss + @csstools/selector-specificity ile ölçüldü: " +
      "kurallar globals.css'ten 1547 satır ÖNCE geldiği için nitelik seçiciyle " +
      "(0,2,0) bir kademe yukarı çıkıldı, yoksa aynı özgüllükte yazım " +
      "kaybediyordu. Sayfa gövdesi 390 px'te yatay kaymıyor.",
  },

  {
    id: "paylas",
    ad: "Paylaş (WhatsApp, e-posta, bağlantı)",
    durum: "calisiyor",
    alan: "haber",
    nasil:
      "Bileşen yazılmış ama HİÇBİR SAYFADA kullanılmıyordu — persona testinde ekranda sıfır düğme sayıldı. Artık manşet, " +
      "standart kart, Görsel ve Kart kartları, kişisel akış, 3'lü blok ve haber detayında. Mesaj Türkçe özet taşıyor: iki persona " +
      "haberi İngilizce kaynağı açmayacak birine (mali işler direktörü, satış ekibi) iletiyor. Canlıda gerçek tarayıcıda okunan " +
      "wa.me metni: kalın başlık + tek cümlelik Türkçe özet (≤220 karakter) + 'Kaynak: T.C. Resmî Gazete' + kaynak bağlantısı. " +
      "E-postada tam özet ve en çok 3 madde. Bağlantı kaynağın kendi adresi: panel kapalı, hesabı olmayan alıcı /haber/:id'de " +
      "giriş sayfası görür.",
    eksik: "Sunucudan e-posta gönderimi SMTP'ye bağlı ve SMTP doğrulanmadı; mailto yolu çalışıyor.",
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
    durum: "calisiyor",
    alan: "haber",
    nasil:
      "Canlıda gerçek tarayıcıyla uçtan uca ölçüldü (Deniz hesabı): 3'lü bloktaki Gizle → gerekçe diyaloğu → 'Haberi gizle' → " +
      "yerinde 'Bu haber panelinizden çıkarıldı. Haber silinmedi. Geri al' satırı; sayfa yenilenince haber ilk 3'ten çıktı " +
      "(1,70,67 → 45,70,67), PUT /me/articles/:id/hide {hidden:false} ile geri alınca döndü (1,70,67). Kullanıcı başına: başka " +
      "hesabı etkilemiyor. Diyalog role=dialog + aria-modal, odak tuzağı, Escape.",
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
      "Bülten sayfasının sağ üstüne yerleştirme entegrasyon adımında yapılacak; /raporlar içindeki Değişiklikler modülünde çalışıyor.",
    neden:
      "app/page.tsx ve components/Filters.tsx paralel çalışma yüzünden bu işte değiştirilmedi; bileşen prop alan biçimde bağımsız yazıldı.",
  },
  {
    id: "degisiklikler-paneli",
    ad: "Değişiklikler modülü (/raporlar içinde)",
    durum: "kismi",
    alan: "takip",
    nasil:
      "Ayrı sayfa olmaktan çıktı, /raporlar içinde id=\"degisiklikler\" modülü oldu " +
      "(kullanıcı isteği: \"Değişiklikler ve Raporları aynı panele taşıyabilirsin\"). " +
      "Eski /degisiklikler yolu 308 + GÖRELİ Location ile buraya yönleniyor. " +
      "Yönlendirme page.tsx + redirect() ile YAPILMADI, yol işleyicisiyle yapıldı: " +
      "kökte app/loading.tsx durduğu için her sayfa Suspense sınırında ve " +
      "redirect() çağrıldığında kabuk çoktan akmış oluyor — ölçüldü, yanıt " +
      "Location başlığı OLMADAN 200 döndü, yani JS kapalı kullanıcı boş sayfa " +
      "görürdü. Üretim derlemesinde ölçüldü: varsayılan yüzey tam 5 tek satırlık " +
      "kalem ve süzgeç basmıyor; ?tumu=1 ile 12 kayıt 3 gün grubuna ayrıldı ve " +
      "\"235 kayıt · ilk 12 gösteriliyor\" yazdı; ?type=dosya-gelismesi listeyi " +
      "12'den 2'ye daralttı. Üç durum AYRI cümlelerle söyleniyor: 404/501 \"uç " +
      "yayında değil\", 401/403 \"uç çalışıyor, eksik olan giriş\" + giriş " +
      "bağlantısı, 200+0 kayıt \"bu korpusta henüz değişiklik kaydı yok\". 401 " +
      "dalı geçersiz çerezle gerçekten ölçüldü: sayfa 200, doğru Türkçe cümle, " +
      "bilinmeyen sayılarda \"—\", çökme yok.",
    eksik:
      "Geçerli oturumla, 235 satırlık GERÇEK yanıtla render doğrulanmadı — " +
      "sözleşme şekline uygun sabit veriyle doğrulandı. Sayfalama yok: uç 235 " +
      "kayıt bildirdiğinde modül ilk 200'ü çekiyor ve bunu satırda açıkça yazıyor.",
    neden:
      "/api/changes YAYINDA ve oturum istiyor — oturumsuz 401 ölçüldü, 404/501 " +
      "DEĞİL. article_changes tablosunda 235 satır var (yeni 115, " +
      "ozet-guncellendi 115, dosya-gelismesi 5). Doğrulama için üretim " +
      "veritabanına test kullanıcısı yazmak istenmedi.",
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
      "Sapma-only: tercih satırı OLMAYAN kullanıcı da varsayılanla (haftalık, 08:00 TRT, Pazartesi, min_band=YÜKSEK) bültene giriyor. Ölçüldü: Pazartesi 08:00'de 14 aday, aynı gün 09:00'da 0, Salı 08:00'de 0. Bir kullanıcıya günlük/17:00 tercihi yazılınca Salı 17:00'de yalnızca o kullanıcı aday oldu, 18:00'de aday çıkmadı; frequency='kapali' yapılınca listeden düştü. Haber sayısı vakit bütçesinden türüyor (2 dk→5, 5 dk→12, 10 dk→20) ve max_items verilmişse o kazanıyor (max_items=4 → 4 haber).",
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
    id: "hesabim-menusu",
    ad: "Üst bardaki Hesabım menüsü ve çıkış",
    durum: "calisiyor",
    alan: "hesap",
    nasil:
      "Kullanıcının şikâyeti birebir \"giriş çıkış yapılı mı onu bile göremiyoruz\" " +
      "idi: üst barda oturumun varlığına dair hiçbir işaret ve çıkış yapmanın " +
      "arayüzde bir yolu yoktu. Menü dört oturum durumunu AYRI AYRI basıyor: " +
      "bilinmiyor → nötr iskelet ve \"giriş yap\" YAZMIYOR (bilmediğimiz şeyi " +
      "söylemek, giriş yapmış kullanıcıya yanlış bilgi vermek olurdu); var → baş " +
      "harf madalyonu (tr-TR büyütme, \"ismail\" → \"İ\") + ad, e-posta, pozisyon, " +
      "kurum, rol ve Ayarlar / Yönetim (yalnızca admin) / Özellik Durumu / Çıkış " +
      "Yap; yok → Giriş Yap ve Kayıt Ol; belirsiz → nötr \"Hesap\" ve \"oturum " +
      "durumu doğrulanamadı\" notu, kullanıcı oturumundan ATILMIYOR. Boş alan " +
      "varsa satır hiç basılmıyor, \"—\" bile yazılmıyor. Yeni /auth/me isteği " +
      "atmıyor, SessionProvider'ın sayfa başına tek çağrısını okuyor. Çıkış hata " +
      "dönerse menüde Türkçe hata satırı çıkıyor ve oturum KORUNUYOR. " +
      "Erişilebilirlik: aria-expanded / aria-haspopup=\"menu\" / aria-controls, " +
      "Escape kapatıp odağı düğmeye döndürüyor, dışarı pointerdown kapatıyor, " +
      "odak kökten çıkarsa kapanıyor (relatedTarget null ise kapatılmıyor — o, " +
      "odağın tarayıcı arayüzüne gitmesi demek), role=\"menu\" <ul> ÜZERİNDE ve " +
      "kimlik/not/hata satırları menü rolünün dışında (ARIA menu yalnızca " +
      "menuitem/group çocuk kabul ediyor). Yazdırmada gizli.",
  },
  {
    id: "sade-gezinti",
    ad: "Sadeleştirilmiş üst bar (8 bağlantı → 3)",
    durum: "calisiyor",
    alan: "panel",
    nasil:
      "Kullanıcının isteği: \"uygulamanın görünümünü basitleştir şuan her yerde " +
      "bir şeyler var\". Üst bar Bülten · Raporlar · İstatistik'e indi; /panelim " +
      "bültenin akış anahtarına, /degisiklikler /raporlar modülüne, /etiketler " +
      "/istatistik modülüne, /ayarlar ve /admin ve /durum Hesabım menüsüne " +
      "taşındı. ESKİ YOLLARIN HİÇBİRİ 404 VERMİYOR: üçü de yol işleyicisiyle " +
      "gerçek 3xx + Location üretiyor (/panelim 307 geçici, diğer ikisi 308 " +
      "kalıcı) ve sorgu parametreleri aktarılıyor. Ekrandaki üç kural çizgisi " +
      "tek kalın + bir ince kurala indi; NYT'nin imzası olan çift kural " +
      "NewspaperMasthead'de (gazete görünümü ve yazdırma) KORUNDU. Aktif sayfa " +
      "renkle DEĞİL kalınlık + alt çizgi + aria-current=\"page\" ile " +
      "gösteriliyor (WCAG 1.4.1). 390 px'te hesap menüsü ve dört düğmeli görünüm " +
      "anahtarı aynı satıra sığıyor; anahtar yalnızca üst bar sarmalayıcısı " +
      "içinde daraltılıyor, /ayarlar sayfasında tam boy kalıyor.",
  },
  {
    id: "akis-anahtari",
    ad: "Bülten içinde Bana Özel / Genel akış anahtarı",
    durum: "calisiyor",
    alan: "panel",
    nasil:
      "Kullanıcının isteği: \"Panelim kısmı ayrı bir sayfa olmasın bülten ile " +
      "aynı sayfa olsun bi yerde switch ekle\". Tek sayfa, iki akış, dört " +
      "görünüm. ?akis= içeriği ve yoğunluğu seçiyor, görünüm anahtarı sunumu " +
      "seçiyor ve ikisi BAĞIMSIZ — böylece \"üst yönetici → görsel, normal " +
      "kullanıcı → kart\" varsayılanı kişisel akışta da anlam kazanıyor: kabuk " +
      "(başlık, sıkı KPI şeridi, şerit) yuvaların dışında bir kez basılıyor, " +
      "haber akışı dört yuvaya (panel/gazete → ArticleFlow, görsel → " +
      "VisualFront, kart → DigestFront). Varsayılan akış profilden geliyor: " +
      "/auth/me \"etkin\" ve bir layout döndürdüyse Bana Özel, aksi halde Genel. " +
      "Anahtar Link tabanlı, yani JS'siz çalışıyor ve diğer arama " +
      "parametrelerini koruyor. Oturum yokken Bana Özel seçilirse YÖNLENDİRME " +
      "YAPILMIYOR: panel kendi dürüst notunu gösteriyor, altına küçük bir giriş " +
      "bağlantısı düşüyor. Filtre bağlantılarının akis/vakit'i düşürdüğü hata " +
      "ayrıca kapatıldı (withParam yalnızca kendisine verilen alanları " +
      "taşıyordu; bölge çipine basan kullanıcı genel bültene dönüyordu).",
  },
  {
    id: "rol-bazli-gorunum",
    ad: "Pozisyona göre açılış görünümü",
    durum: "calisiyor",
    alan: "panel",
    nasil:
      "Kullanıcının isteği: \"En üst düzey yöneticiler için Görsel olan açılsın / " +
      "Normal kullanıcılar için Kart görünümü açılsın / Kullanıcılar yine şuanki " +
      "gibi kendileri değiştirebilir olsun\". POSITION_VIEW tek eşleme noktası " +
      "(backend/src/lib/positions.js); DB kolonu YOK, layoutOf() ile aynı " +
      "ilkeyle türetiliyor. 8 pozisyonun her biri için viewOf() gerçekten " +
      "çağrıldı: ust-yonetim → gorsel, diğer 7 → kart, profil yok / bilinmeyen " +
      "pozisyon → panel. viewOf() bilinçli olarak normalizePosition() " +
      "KULLANMIYOR — o bilinmeyeni ust-yonetim'e çekiyor ve profilsiz " +
      "kullanıcıya gorsel açardı. /auth/me default_view döndürüyor ve backend " +
      "isov_view çerezi yazıyor; çerez httpOnly DEĞİL çünkü hidrasyondan ÖNCE " +
      "satır içi betikte okunması gerekiyor (yoksa mizanpaj sıçrar), oturum " +
      "taşımıyor ve kurcalanması yetki artışı değil yalnızca yanlış mizanpaj " +
      "demek. Gerçek Set-Cookie ölçüldü: kayıt → isov_view=panel, pozisyon " +
      "ust-yonetim → gorsel, mevzuat-hukuk → kart, çıkış → Expires=1970; " +
      "isov_view satırlarında HttpOnly yok, oturum çerezinde var. Öncelik " +
      "sırası hem satır içi betikte hem ViewProvider'da aynı: " +
      "localStorage['isov:view'] (kullanıcının AÇIK seçimi) → isov_view çerezi → " +
      "'panel'. Betik sahte localStorage/document.cookie ile koşturularak 6 " +
      "senaryoda ölçüldü; açık seçim çerezi eziyor, bozuk çerez panel'e düşüyor, " +
      "my_isov_view gibi önek tuzağı yakalanmıyor.",
  },
  // --- TUR 4: bes personanin gercek tarayici testi ve duzeltmeler -----
  {
    id: "gercek-tarayici-testi",
    ad: "Gerçek tarayıcıyla kullanıcı testi (5 persona)",
    durum: "calisiyor",
    alan: "panel",
    nasil:
      "scripts/tarayici.sh: backend imajındaki Chromium'la gerçek oturum, tıklama, ekran görüntüsü ve ilk ekran ölçümü. " +
      "Beş persona (genel müdür, İSOV teşvik uzmanı, ihracat müdürü, üretim mühendisi, İSO basın müdürü) kayıt sihirbazından " +
      "başlayarak siteyi kullandı. Önceki turların hiçbirinde tarayıcı testi yoktu; bu test üç P0 buldu ve üçü de beşer/dörder " +
      "personada bağımsız ölçüldü: giriş sonrası /giris'e geri atılma (kimse arayüzden giriş yapamıyordu), Görsel/Kart " +
      "görünümünde boş haber ve rapor sayfası, hiç görünmeyen Paylaş/Gizle düğmeleri.",
  },
  {
    id: "bugun-uc-sey",
    ad: "Bugün Bilmeniz Gereken 3 Şey (ilk ekran)",
    durum: "calisiyor",
    alan: "kisiselestirme",
    nasil:
      "Ürünün en büyük geri bildirimi 'ilgi süresi yetmiyor' idi; mobilde (390×844) Bana Özel'in ilk ekranında TEK haber yoktu " +
      "(ilk başlık y=813–872). Artık en üstte kişisel sıranın ilk 3'ü: başlık, tek cümle, 'Neden sizin için' satırı ve 44 px " +
      "WhatsApp düğmesi. Canlıda gerçek tarayıcıyla ölçüldü (Emre/Kart, Nilgün/Görsel, Deniz/Kart): üçünde de kaydırmadan 3 gerçek " +
      "başlık, ilk başlık y=314, yatay taşma yok. Gerekçe YALNIZCA gerçek eşleşmeden: backend matched_interests, yoksa etiket ∩ ilgi " +
      "alanı, yoksa bölge; eşleşme yoksa kişisel gerekçe yazılmıyor ('Neden burada: korpus genelinde kritik'). Ölçülen örnekler: " +
      "Nilgün 'İlgi alanınız: Faiz Kararı', Emre 'Alüminyum, Çelik', Deniz 'İhracat, Serbest Ticaret Anlaşması'.",
    eksik: "Bloktaki WhatsApp düğmesi paylaşım kaydı (recordShare) atmıyor; Paylaş menüsündeki WhatsApp atıyor.",
  },
  {
    id: "ilgi-alani-yuvasi",
    ad: "Açık ilgi alanları için sıralama yuvası",
    durum: "calisiyor",
    alan: "kisiselestirme",
    nasil:
      "Ölçülen hata: ihracat müdürünün kendi seçtiği CBAM haberi Bana Özel'de 19., tarife 18. — 12 kalemlik listenin dışında; " +
      "kişiselleştirme kullanıcının konusunu GENEL akıştan daha aşağı itiyordu. Teşhis ağırlık değil temsil: interest_tags eşleşme " +
      "SAYISINA bakıyor, geniş 'ihracat' etiketi (30+ haber) tek başına listeyi dolduruyordu. Çözüm oran tabanlı yuva (her 4 slotun " +
      "sonuncusu henüz temsil edilmemiş açık ilgi alanına; DÜŞÜK bant ve sessize alınmış etiket giremez). Canlıda ölçüldü: Deniz CBAM " +
      "19→4, tarife 18→12, ilgi kapsaması 5/7→7/7; Nilgün CBAM 5'lik listede 4. Filtre balonu korunuyor: global örtüşme medyanı 6/10 " +
      "(değişmedi, alarm 3/10), çiftler arası 5→4/10.",
  },
  {
    id: "giris-hiz-siniri",
    ad: "Giriş hız sınırı (kurumsal ağ dostu)",
    durum: "calisiyor",
    alan: "hesap",
    nasil:
      "Beş personanın dördü giriş sırasında 429 aldı: sınır yalnızca IP'ye bağlıydı ve BAŞARILI girişleri de sayıyordu; 1.400 " +
      "çalışanlı bir fabrika tek NAT IP'sinden çıkar. Artık yalnızca başarısız denemeler sayılıyor: IP + e-posta 10/15 dk, IP 200/15 dk. " +
      "Canlıda ölçüldü: aynı IP'den 12 ardışık doğru giriş, 12×200 (önce 11.'si 429). Hesap bazlı kilit (5 hata → 15 dk) aynen duruyor.",
  },
  {
    id: "paylasilan-veri-yetkisi",
    ad: "Paylaşılan veriye yazma yetkisi",
    durum: "calisiyor",
    alan: "yonetim",
    nasil:
      "Persona testi sırasında sıradan bir üye hesabının (rol 'uye') haftalık raporu yeniden üretebildiği görüldü. Denetimde aynı " +
      "sınıfta altı uç çıktı: rapor üretme, toplama başlatma, kaynak ekleme, kaynağın otorite ağırlığını değiştirme (gizli önem " +
      "skorunun bileşeni — herhangi bir üye HERKESİN sıralamasını kaydırabiliyordu), öneri kabul/ret ve görsel toplama. Hepsi artık " +
      "admin/editor'e kapalı; canlıda üye hesabıyla ölçüldü: 6/6 uç 403, okuma uçları 200, kaynak otoritesi değişmedi. Arayüz de " +
      "üyeye bu düğmeleri göstermiyor; üye kaynağı 'Kaynak Öner'den önerebiliyor.",
  },
  {
    id: "veri-tazeligi",
    ad: "Veri tazeliği göstergesi",
    durum: "calisiyor",
    alan: "haber",
    nasil:
      "İSO basın müdürü personasının P0'ı: künye bugünün tarihini ve bugünden türeyen sayı numarasını basıyordu, en yeni haber ise " +
      "12 Eylül (13 günlük). Artık künye, gazete künyesi ve altbilgide 'Son veri: 12 Eylül 2026 · 13 gün önce'; 2 günden eskiyse " +
      "'⚠ Eski veri' (renk tek gösterge değil: sözcük, işaret ve kesik kenarlık). Kaynak GET /stats/freshness, MAX(published_at): son " +
      "toplama çalışması 19 Eylül ama 0 yeni haber getirdiği için onu göstermek veriyi olduğundan taze gösterirdi. Sayı No artık " +
      "verinin gününden türüyor.",
    eksik: "Sürekli toplama çalışmıyor; gösterge sorunu DÜRÜSTÇE söylüyor, çözmüyor.",
  },
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
