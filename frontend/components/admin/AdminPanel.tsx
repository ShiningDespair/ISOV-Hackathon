"use client";

/**
 * YÖNETİM PANELİ — /admin kabuğu
 *
 * NEDEN İSTEMCİ BİLEŞENİ (sunucu bileşeni değil):
 * Oturum httpOnly çerezle taşınıyor. Sunucu bileşeninden çağrılan bir
 * fetch çerezi elle taşımak zorunda kalır ve yönlendirme/yetki hataları
 * sunucu tarafında sessizce 403'e düşer. Tarayıcıdan `credentials:"include"`
 * ile istemek hem daha az kırılgan hem de "yetkiniz yok" ekranını doğru
 * gösterebilmenin tek dürüst yolu.
 *
 * ÜÇ KAPI DURUMU — hiçbiri boş sayfa ya da çökme DEĞİL:
 *   401 / oturum yok      -> "giriş yapın" + /giris bağlantısı
 *   403 / rol yetersiz    -> "yetkiniz yok", hangi rolle girildiği yazılı
 *   404 / 501 / ağ hatası -> "bölüm yayında değil", neden yazılı
 *
 * Bölüm gezintisi sayfa içi çapa bağlantılarıdır; `/admin` tek sayfa
 * olarak kalır. Sekmeli arayüz, panelin tamamını tek bakışta görmeyi ve
 * tarayıcıdan aramayı (Ctrl+F) engellerdi.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { SettingsSection } from "@/components/settings/Parts";
import { getMe } from "@/lib/api-auth";
import { ROL_ETIKET, getAdminOverview, getAdminSettings } from "@/lib/api-admin";
import type {
  AdminOverview,
  AdminRole,
  AuthAyari,
  AyarPaketi,
  AyarZarfi,
  BultenAyari,
  KisiselestirmeAyari,
  MarkaAyari,
  SmtpAyari,
} from "@/lib/api-admin";
import type { SessionUser } from "@/lib/types-auth";

import { DigestSection } from "./DigestSection";
import { EmailLogSection } from "./EmailLogSection";
import { GeneralSection } from "./GeneralSection";
import { NaceCoverageSection } from "./NaceCoverageSection";
import { OverviewSection } from "./OverviewSection";
import { PersonalizationSection } from "./PersonalizationSection";
import { SmtpSection } from "./SmtpSection";
import { UsersSection } from "./UsersSection";

type Kapi =
  | { hal: "yukleniyor" }
  | { hal: "oturumsuz"; mesaj: string }
  | { hal: "yetkisiz"; mesaj: string; rol: AdminRole | null }
  | { hal: "erisilemez"; mesaj: string }
  | { hal: "tamam"; kullanici: SessionUser };

const BOLUMLER: { id: string; ad: string }[] = [
  { id: "genel-bakis", ad: "Genel Bakış" },
  { id: "kullanicilar", ad: "Kullanıcılar" },
  { id: "genel-ayarlar", ad: "Genel Ayarlar" },
  { id: "smtp", ad: "SMTP" },
  { id: "kisiselestirme", ad: "Kişiselleştirme" },
  { id: "bulten", ad: "Bülten" },
  { id: "gonderim-kaydi", ad: "Gönderim Kaydı" },
  { id: "nace-kapsami", ad: "NACE Kapsamı" },
];

/** Yetkisiz / oturumsuz durumların ortak, temiz ekranı. */
function KapiEkrani({
  kicker,
  baslik,
  mesaj,
  ek,
}: {
  kicker: string;
  baslik: string;
  mesaj: string;
  ek?: React.ReactNode;
}) {
  return (
    <div className="yon-kapi">
      <p className="u-kicker u-kicker-accent">{kicker}</p>
      <h1 className="u-headline u-headline-lg mt-1">{baslik}</h1>
      <p className="u-body u-body-soft mt-3 text-[0.9375rem] leading-normal">{mesaj}</p>
      {ek ? <div className="mt-4">{ek}</div> : null}
    </div>
  );
}

export function AdminPanel() {
  const [kapi, setKapi] = useState<Kapi>({ hal: "yukleniyor" });

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewHata, setOverviewHata] = useState<string | null>(null);
  const [overviewYukleniyor, setOverviewYukleniyor] = useState(true);

  const [ayarlar, setAyarlar] = useState<AyarPaketi | null>(null);
  const [ayarHata, setAyarHata] = useState<string | null>(null);

  // --- Kapı: oturum ve rol -------------------------------------------
  useEffect(() => {
    let iptal = false;
    (async () => {
      const res = await getMe();
      if (iptal) return;

      if (!res.ok) {
        if (res.status === 401) {
          setKapi({
            hal: "oturumsuz",
            mesaj:
              "Bu bölümü görmek için giriş yapmanız gerekiyor. Panel tamamen "
              + "kapalıdır; oturumsuz istekler yönetim uçlarına erişemez.",
          });
          return;
        }
        if (res.status === 403) {
          setKapi({ hal: "yetkisiz", mesaj: res.error, rol: null });
          return;
        }
        setKapi({
          hal: "erisilemez",
          mesaj: `${res.error} Yönetim paneli sunucuya ulaşamadığı için veri gösteremiyor.`,
        });
        return;
      }

      const kullanici = res.data?.user ?? null;
      if (!kullanici) {
        setKapi({
          hal: "oturumsuz",
          mesaj: "Oturum bilgisi okunamadı. Lütfen yeniden giriş yapın.",
        });
        return;
      }
      if (kullanici.role !== "admin") {
        setKapi({
          hal: "yetkisiz",
          mesaj:
            "Yönetim paneli yalnızca yöneticilere açıktır. Hesabınızın yetkisi bu bölüm için yeterli değil.",
          rol: kullanici.role,
        });
        return;
      }
      setKapi({ hal: "tamam", kullanici });
    })();
    return () => {
      iptal = true;
    };
  }, []);

  // --- Veri: yalnızca kapı açıldıktan sonra --------------------------
  const overviewYukle = useCallback(async () => {
    setOverviewYukleniyor(true);
    const res = await getAdminOverview();
    setOverviewYukleniyor(false);
    if (!res.ok) {
      setOverviewHata(res.error);
      return;
    }
    setOverviewHata(null);
    setOverview(res.data);
  }, []);

  useEffect(() => {
    if (kapi.hal !== "tamam") return;
    void overviewYukle();
    (async () => {
      const res = await getAdminSettings();
      if (!res.ok) {
        setAyarHata(res.error);
        return;
      }
      setAyarHata(null);
      setAyarlar(res.data);
    })();
  }, [kapi.hal, overviewYukle]);

  /** Bir ayar kaydedildiğinde paketi ve genel bakışı tazele. */
  function ayarGuncelle<K extends keyof AyarPaketi>(anahtar: K, zarf: AyarPaketi[K]) {
    setAyarlar((o) => (o ? { ...o, [anahtar]: zarf } : o));
    void overviewYukle();
  }

  if (kapi.hal === "yukleniyor") {
    return (
      <div className="yon-kapi" aria-live="polite">
        <p className="u-kicker u-kicker-accent">Yönetim</p>
        <h1 className="u-headline u-headline-lg mt-1">Yönetim Paneli</h1>
        <p className="u-body u-body-soft mt-3 text-[0.9375rem]">Yetki kontrol ediliyor…</p>
      </div>
    );
  }

  if (kapi.hal === "oturumsuz") {
    return (
      <KapiEkrani
        kicker="Oturum gerekli"
        baslik="Giriş yapmanız gerekiyor"
        mesaj={kapi.mesaj}
        ek={
          <Link href="/giris?devam=/admin" className="ayar-btn ayar-btn-primary">
            Giriş sayfasına git
          </Link>
        }
      />
    );
  }

  if (kapi.hal === "yetkisiz") {
    return (
      <KapiEkrani
        kicker="Yetki yetersiz"
        baslik="Bu bölüme erişim yetkiniz yok"
        mesaj={kapi.mesaj}
        ek={
          <>
            {kapi.rol ? (
              <p className="u-body u-body-soft text-[0.875rem]">
                Hesabınızın rolü: <strong>{ROL_ETIKET[kapi.rol]}</strong>. Yönetim
                paneli için <strong>Yönetici</strong> rolü gerekir; bu değişikliği
                mevcut bir yönetici yapabilir.
              </p>
            ) : null}
            <p className="mt-4">
              <Link href="/" className="ayar-btn">
                Panele dön
              </Link>
            </p>
          </>
        }
      />
    );
  }

  if (kapi.hal === "erisilemez") {
    return (
      <KapiEkrani
        kicker="Sunucu"
        baslik="Yönetim paneli şu an veri alamıyor"
        mesaj={kapi.mesaj}
        ek={
          <Link href="/durum" className="ayar-btn">
            Özellik durumuna bak
          </Link>
        }
      />
    );
  }

  const ben = kapi.kullanici;

  return (
    <div className="ayar-page yon-page mx-auto w-full max-w-[1440px] px-4 pb-14 sm:px-6">
      <header className="border-b border-ink py-5">
        <p className="u-kicker u-kicker-accent">Yönetim</p>
        <h1 className="u-headline u-headline-lg mt-1">Yönetim Paneli</h1>
        <p className="u-body u-body-soft mt-2 max-w-3xl text-[0.95rem]">
          Kullanıcılar, roller, SMTP yapılandırması ve sıralama ağırlıkları.
          Buradaki değişiklikler <strong>herkes için</strong> geçerlidir ve
          anında etkili olur. {ben.full_name || ben.email} olarak giriş yaptınız.
        </p>
        <nav className="yon-nav" aria-label="Yönetim bölümleri">
          {BOLUMLER.map((b) => (
            <a key={b.id} href={`#${b.id}`} className="yon-nav-baglanti">
              {b.ad}
            </a>
          ))}
        </nav>
      </header>

      <SettingsSection
        id="genel-bakis"
        kicker="Salt Okunur"
        title="Genel Bakış"
        lead="Sistemin güncel durumu: kullanıcılar, korpus, son toplama, e-posta kuyruğu ve eksik yapılandırmalar."
        aside={
          <button type="button" className="ayar-btn" onClick={() => void overviewYukle()}>
            Yenile
          </button>
        }
      >
        <OverviewSection
          veri={overview}
          yukleniyor={overviewYukleniyor}
          hata={overviewHata}
        />
      </SettingsSection>

      <SettingsSection
        id="kullanicilar"
        kicker="Yönetim"
        title="Kullanıcılar"
        lead="Rol ve durum değişiklikleri anında etkilidir: hesap askıya alındığında açık oturumlar da iptal edilir. Şifre sıfırlama bağlantısı SMTP çalışmasa bile üretilebilir."
      >
        <UsersSection benimId={Number(ben.id) || null} />
      </SettingsSection>

      {ayarHata ? (
        <SettingsSection
          id="ayarlar-hata"
          kicker="Ayarlar"
          title="Ayarlar Okunamadı"
          lead="Ayar bölümleri gösterilemiyor."
        >
          <p className="ayar-bildirim" data-tur="hata" role="alert">
            {ayarHata}
          </p>
        </SettingsSection>
      ) : null}

      {ayarlar ? (
        <>
          <SettingsSection
            id="genel-ayarlar"
            kicker="Kurulum"
            title="Genel Ayarlar"
            lead="Kayıt politikası, şifre kuralı, oturum süresi ve site kimliği."
            aside={ayarlar.auth.varsayilan ? "Varsayılan değerler" : undefined}
          >
            <GeneralSection
              authZarf={ayarlar.auth}
              markaZarf={ayarlar.branding}
              onAuthKaydedildi={(z: AyarZarfi<AuthAyari>) => ayarGuncelle("auth", z)}
              onMarkaKaydedildi={(z: AyarZarfi<MarkaAyari>) => ayarGuncelle("branding", z)}
            />
          </SettingsSection>

          <SettingsSection
            id="smtp"
            kicker="Dağıtım"
            title="SMTP Yapılandırması"
            lead="Bülten, doğrulama ve şifre sıfırlama e-postalarının çıkış ayarları. Şifre sunucuda şifrelenmiş saklanır ve hiçbir yanıtta geri dönmez."
            aside={
              ayarlar.smtp.sir_anahtari?.available === false
                ? "Şifre alanı kilitli"
                : undefined
            }
          >
            <SmtpSection
              zarf={ayarlar.smtp}
              onKaydedildi={(z: AyarZarfi<SmtpAyari>) => ayarGuncelle("smtp", z)}
            />
          </SettingsSection>

          <SettingsSection
            id="kisiselestirme"
            kicker="Sıralama"
            title="Kişiselleştirme"
            lead="Editöryal önem ile kişisel uyumun harmanı. Demo sırasında yeniden dağıtım (deploy) gerektirmeden ayarlanabilir."
          >
            <PersonalizationSection
              zarf={ayarlar.personalization}
              onKaydedildi={(z: AyarZarfi<KisiselestirmeAyari>) =>
                ayarGuncelle("personalization", z)
              }
            />
          </SettingsSection>

          <SettingsSection
            id="bulten"
            kicker="Dağıtım"
            title="Bülten"
            lead="Varsayılan gönderim saati ve yoğunluğu; elle gönderim düğmesi."
          >
            <DigestSection
              zarf={ayarlar.digest}
              onKaydedildi={(z: AyarZarfi<BultenAyari>) => ayarGuncelle("digest", z)}
            />
          </SettingsSection>
        </>
      ) : !ayarHata ? (
        <SettingsSection id="ayarlar-yukleniyor" kicker="Ayarlar" title="Ayarlar">
          <p className="u-body u-body-soft py-3 text-[0.9375rem]" aria-live="polite">
            Ayarlar yükleniyor…
          </p>
        </SettingsSection>
      ) : null}

      <SettingsSection
        id="gonderim-kaydi"
        kicker="Salt Okunur"
        title="Gönderim Kaydı"
        lead="Her e-posta denemesi buraya yazılır — başarısız olanlar nedeniyle birlikte. E-posta gövdesi saklanmaz, yalnızca özeti."
      >
        <EmailLogSection />
      </SettingsSection>

      <SettingsSection
        id="nace-kapsami"
        kicker="Veri Kalitesi"
        title="NACE Sektör Kapsamı"
        lead="Hangi sektörde kaç haber var. Liste veri kalınlığına göre sıralanır; en ince kapsam en üstte durur."
      >
        <NaceCoverageSection />
      </SettingsSection>
    </div>
  );
}
