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
  { id: "kayit-giris", ad: "Kayıt, giriş ve oturum", durum: "yok", alan: "hesap" },
  { id: "kayit-sihirbazi", ad: "Adım adım kayıt sihirbazı", durum: "yok", alan: "hesap" },
  { id: "roller", ad: "Roller (üye / editör / admin)", durum: "yok", alan: "hesap" },
  { id: "kurum-baglantisi", ad: "Kullanıcının kuruma bağlanması", durum: "yok", alan: "hesap" },
  { id: "profil-ayarlari", ad: "Profil ayarları (pozisyon, sektör, ilgi, vakit)", durum: "yok", alan: "hesap" },

  { id: "kisisel-siralama", ad: "Kişisel haber sıralaması", durum: "yok", alan: "kisiselestirme" },
  { id: "semantik-katman", ad: "Anlamsal eşleştirme (profil vektörü)", durum: "yok", alan: "kisiselestirme" },
  { id: "vakit-yogunlugu", ad: "Vakit bazlı içerik yoğunluğu (2/5/15 dk)", durum: "yok", alan: "kisiselestirme" },
  { id: "rol-bazli-ozet", ad: "Role göre özet metni", durum: "yok", alan: "kisiselestirme" },
  { id: "filtre-balonu-korumasi", ad: "Filtre balonu koruması (kritik haber enjeksiyonu)", durum: "yok", alan: "kisiselestirme" },

  { id: "rol-bazli-panel", ad: "Pozisyona göre ilk sayfa düzeni", durum: "yok", alan: "panel" },
  { id: "kpi-seridi", ad: "KPI şeridi ve basit grafikler", durum: "yok", alan: "panel" },
  { id: "manset-seridi", ad: "Yatay önemli konular şeridi", durum: "yok", alan: "panel" },

  { id: "paylas", ad: "Paylaş (WhatsApp, e-posta, bağlantı)", durum: "yok", alan: "haber" },
  { id: "paylas-sunucu", ad: "Sunucudan e-posta ile paylaşım", durum: "yok", alan: "haber" },
  { id: "haber-gizle", ad: "Haberi gizle ve gerekçe bildir", durum: "yok", alan: "haber" },
  { id: "okuma-suresi", ad: "Haber okuma süresi göstergesi", durum: "yok", alan: "haber" },

  { id: "tarih-filtresi", ad: "Tarih aralığı filtresi", durum: "yok", alan: "takip" },
  { id: "degisiklikler-paneli", ad: "Değişiklikler paneli", durum: "yok", alan: "takip" },
  { id: "son-ziyaretten-beri", ad: "Son ziyaretten beri yenilikler", durum: "yok", alan: "takip" },
  { id: "dosya-takibi", ad: "Aynı mevzuat dosyasında gelişme takibi", durum: "yok", alan: "takip" },

  { id: "pdf-sunucu", ad: "Sunucu tarafında PDF üretimi", durum: "yok", alan: "dagitim" },
  { id: "smtp-ayarlari", ad: "SMTP yapılandırması", durum: "yok", alan: "dagitim" },
  { id: "bulten-gonderimi", ad: "Günlük / haftalık bülten gönderimi", durum: "yok", alan: "dagitim" },
  { id: "bulten-abonelik", ad: "Kullanıcı başına bülten aboneliği", durum: "yok", alan: "dagitim" },

  { id: "admin-paneli", ad: "Admin paneli", durum: "yok", alan: "yonetim" },
  { id: "kullanici-yonetimi", ad: "Kullanıcı ve rol yönetimi", durum: "yok", alan: "yonetim" },
  { id: "nace-kapsami", ad: "NACE sektör kapsamı göstergesi", durum: "yok", alan: "yonetim" },
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
