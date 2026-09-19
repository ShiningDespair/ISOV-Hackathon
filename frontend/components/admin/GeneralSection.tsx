"use client";

/**
 * GENEL AYARLAR — hesap politikası (`auth`) + marka (`branding`)
 *
 * İki anahtar tek bölümde, çünkü ikisi de "kurulum" niteliğinde ve nadiren
 * değişir; ayrı bölümler yapmak paneli gereksiz uzatırdı.
 *
 * İZİNLİ ALAN ADLARI boş bırakılırsa kısıtlama yoktur. Bu, kapatılmış bir
 * özellik değil bilinçli varsayılan: liste dolduğu anda o alan adları
 * dışından kayıt olunamaz, bu yüzden yanına ne olacağı yazılı.
 */

import { useEffect, useState } from "react";

import { Field, Notice, Switch } from "@/components/settings/Parts";
import {
  putAdminSetting,
  type AuthAyari,
  type AyarZarfi,
  type MarkaAyari,
} from "@/lib/api-admin";

export function GeneralSection({
  authZarf,
  markaZarf,
  onAuthKaydedildi,
  onMarkaKaydedildi,
}: {
  authZarf: AyarZarfi<AuthAyari>;
  markaZarf: AyarZarfi<MarkaAyari>;
  onAuthKaydedildi: (yeni: AyarZarfi<AuthAyari>) => void;
  onMarkaKaydedildi: (yeni: AyarZarfi<MarkaAyari>) => void;
}) {
  const [kayitAcik, setKayitAcik] = useState(authZarf.value.registration_open);
  const [alanlar, setAlanlar] = useState(authZarf.value.allowed_email_domains.join(", "));
  const [minSifre, setMinSifre] = useState(String(authZarf.value.min_password_length));
  const [oturumSaat, setOturumSaat] = useState(String(authZarf.value.session_ttl_hours));
  const [siteAdi, setSiteAdi] = useState(markaZarf.value.site_name);
  const [altNot, setAltNot] = useState(markaZarf.value.footer_note);

  const [kaydediyor, setKaydediyor] = useState(false);
  const [bildirim, setBildirim] = useState<{ kind: "basari" | "hata"; text: string } | null>(null);

  useEffect(() => {
    setKayitAcik(authZarf.value.registration_open);
    setAlanlar(authZarf.value.allowed_email_domains.join(", "));
    setMinSifre(String(authZarf.value.min_password_length));
    setOturumSaat(String(authZarf.value.session_ttl_hours));
  }, [authZarf]);

  useEffect(() => {
    setSiteAdi(markaZarf.value.site_name);
    setAltNot(markaZarf.value.footer_note);
  }, [markaZarf]);

  const sifreHatasi =
    !Number.isInteger(Number(minSifre)) || Number(minSifre) < 8 || Number(minSifre) > 64
      ? "En az şifre uzunluğu 8 ile 64 arasında olmalıdır."
      : null;
  const oturumHatasi =
    !Number.isInteger(Number(oturumSaat)) || Number(oturumSaat) < 1 || Number(oturumSaat) > 8760
      ? "Oturum süresi 1 ile 8.760 saat arasında olmalıdır."
      : null;
  const siteHatasi = siteAdi.trim() === "" ? "Site adı boş olamaz." : null;

  async function kaydet(e: React.FormEvent) {
    e.preventDefault();
    if (sifreHatasi || oturumHatasi || siteHatasi) {
      setBildirim({ kind: "hata", text: "Formda düzeltilmesi gereken alanlar var." });
      return;
    }

    const alanListesi = alanlar
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    setKaydediyor(true);
    setBildirim(null);

    const authRes = await putAdminSetting<AuthAyari>("auth", {
      registration_open: kayitAcik,
      allowed_email_domains: alanListesi,
      min_password_length: Number(minSifre),
      session_ttl_hours: Number(oturumSaat),
    });
    if (!authRes.ok) {
      setKaydediyor(false);
      setBildirim({ kind: "hata", text: authRes.error });
      return;
    }
    onAuthKaydedildi(authRes.data);

    const markaRes = await putAdminSetting<MarkaAyari>("branding", {
      site_name: siteAdi.trim(),
      footer_note: altNot.trim(),
    });
    setKaydediyor(false);
    if (!markaRes.ok) {
      setBildirim({
        kind: "hata",
        text: `Hesap ayarları kaydedildi, marka ayarları kaydedilemedi. ${markaRes.error}`,
      });
      return;
    }
    onMarkaKaydedildi(markaRes.data);
    setBildirim({ kind: "basari", text: "Genel ayarlar kaydedildi." });
  }

  return (
    <form className="max-w-3xl" onSubmit={kaydet} noValidate>
      <div className="ayar-field">
        <span className="u-kicker block text-ink">Yeni kayıt</span>
        <span className="u-body u-body-soft block text-[0.8125rem] leading-snug">
          Kapalıyken kayıt formu istekleri reddedilir; mevcut kullanıcılar
          etkilenmez. Yalnızca yönetici davetiyle hesap açılabilir.
        </span>
        <div className="mt-2">
          <Switch
            checked={kayitAcik}
            onChange={(v) => {
              setKayitAcik(v);
              setBildirim(null);
            }}
            label="Yeni kullanıcı kaydı"
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            label="İzinli e-posta alan adları"
            hint="Virgülle ayırın (örnek: iso.org.tr, isov.org.tr). Boş bırakılırsa kısıtlama uygulanmaz."
          >
            <input
              className="ayar-input"
              type="text"
              value={alanlar}
              autoComplete="off"
              onChange={(e) => {
                setAlanlar(e.currentTarget.value);
                setBildirim(null);
              }}
            />
          </Field>
        </div>

        <Field
          label="En az şifre uzunluğu"
          hint="Karmaşıklık dayatması yok; uzunluk daha iyi koruma sağlar."
          error={sifreHatasi}
          errorId="gen-sifre-hata"
        >
          <input
            className="ayar-input"
            type="number"
            min={8}
            max={64}
            value={minSifre}
            aria-invalid={sifreHatasi ? true : undefined}
            aria-describedby={sifreHatasi ? "gen-sifre-hata" : undefined}
            onChange={(e) => {
              setMinSifre(e.currentTarget.value);
              setBildirim(null);
            }}
          />
        </Field>

        <Field
          label="Oturum süresi (saat)"
          hint="Bu süre sonunda çerez geçersiz olur; 168 = 7 gün."
          error={oturumHatasi}
          errorId="gen-oturum-hata"
        >
          <input
            className="ayar-input"
            type="number"
            min={1}
            max={8760}
            value={oturumSaat}
            aria-invalid={oturumHatasi ? true : undefined}
            aria-describedby={oturumHatasi ? "gen-oturum-hata" : undefined}
            onChange={(e) => {
              setOturumSaat(e.currentTarget.value);
              setBildirim(null);
            }}
          />
        </Field>

        <Field label="Site adı" error={siteHatasi} errorId="gen-site-hata">
          <input
            className="ayar-input"
            type="text"
            value={siteAdi}
            aria-invalid={siteHatasi ? true : undefined}
            aria-describedby={siteHatasi ? "gen-site-hata" : undefined}
            onChange={(e) => {
              setSiteAdi(e.currentTarget.value);
              setBildirim(null);
            }}
          />
        </Field>

        <Field label="Alt bilgi notu" hint="Bülten ve sayfa altında görünen kısa açıklama.">
          <input
            className="ayar-input"
            type="text"
            value={altNot}
            onChange={(e) => {
              setAltNot(e.currentTarget.value);
              setBildirim(null);
            }}
          />
        </Field>
      </div>

      <div className="mt-5">
        <button type="submit" className="ayar-btn ayar-btn-primary" disabled={kaydediyor}>
          {kaydediyor ? "Kaydediliyor…" : "Genel ayarları kaydet"}
        </button>
      </div>
      <div className="mt-3">
        <Notice kind={bildirim?.kind ?? null} message={bildirim?.text ?? null} />
      </div>
    </form>
  );
}
