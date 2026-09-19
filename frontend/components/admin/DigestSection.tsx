"use client";

/**
 * BÜLTEN
 *
 * Varsayılan gönderim saati ve üst sınır + elle gönderim düğmesi.
 *
 * Buradaki değerler VARSAYILAN: kullanıcı kendi bülten tercihlerinde
 * (`/ayarlar`) başka bir saat seçebilir. Sapma-only desen: kullanıcının
 * satırı yoksa bu ayar geçerlidir.
 *
 * Elle gönderim, gönderim servisi henüz yayında değilse 200 + dürüst
 * açıklama döner; düğme sessizce başarısız olmaz.
 */

import { useEffect, useState } from "react";

import { Field, Notice, Switch } from "@/components/settings/Parts";
import {
  putAdminSetting,
  sendDigestNow,
  type AyarZarfi,
  type BultenAyari,
} from "@/lib/api-admin";

export function DigestSection({
  zarf,
  onKaydedildi,
}: {
  zarf: AyarZarfi<BultenAyari>;
  onKaydedildi: (yeni: AyarZarfi<BultenAyari>) => void;
}) {
  const [enabled, setEnabled] = useState(zarf.value.enabled);
  const [hour, setHour] = useState(String(zarf.value.default_hour));
  const [maxItems, setMaxItems] = useState(String(zarf.value.max_items));
  const [kaydediyor, setKaydediyor] = useState(false);
  const [bildirim, setBildirim] = useState<{ kind: "basari" | "hata"; text: string } | null>(null);

  const [gonderiyor, setGonderiyor] = useState(false);
  const [gonderimMesaji, setGonderimMesaji] = useState<{
    kind: "basari" | "hata";
    text: string;
  } | null>(null);

  useEffect(() => {
    setEnabled(zarf.value.enabled);
    setHour(String(zarf.value.default_hour));
    setMaxItems(String(zarf.value.max_items));
  }, [zarf]);

  const saatHatasi =
    hour.trim() === "" || !Number.isInteger(Number(hour)) || Number(hour) < 0 || Number(hour) > 23
      ? "Gönderim saati 0 ile 23 arasında bir tam sayı olmalıdır."
      : null;
  const sayiHatasi =
    maxItems.trim() === "" ||
    !Number.isInteger(Number(maxItems)) ||
    Number(maxItems) < 1 ||
    Number(maxItems) > 60
      ? "Haber sayısı 1 ile 60 arasında bir tam sayı olmalıdır."
      : null;

  async function kaydet(e: React.FormEvent) {
    e.preventDefault();
    if (saatHatasi || sayiHatasi) {
      setBildirim({ kind: "hata", text: "Formda düzeltilmesi gereken alanlar var." });
      return;
    }
    setKaydediyor(true);
    setBildirim(null);
    const res = await putAdminSetting<BultenAyari>("digest", {
      enabled,
      default_hour: Number(hour),
      max_items: Number(maxItems),
    });
    setKaydediyor(false);
    if (!res.ok) {
      setBildirim({ kind: "hata", text: res.error });
      return;
    }
    onKaydedildi(res.data);
    setBildirim({ kind: "basari", text: "Bülten ayarları kaydedildi." });
  }

  async function elleGonder() {
    setGonderiyor(true);
    setGonderimMesaji(null);
    const res = await sendDigestNow();
    setGonderiyor(false);
    if (!res.ok) {
      setGonderimMesaji({ kind: "hata", text: res.error });
      return;
    }
    const d = res.data;
    // Neden dökümü varsa açıklamaya eklenir: "0 gönderildi" tek başına
    // kullanıcıya hiçbir şey anlatmaz, nedeni anlatır.
    const nedenler = d.nedenler
      ? Object.entries(d.nedenler)
          .map(([ad, n]) => `${ad}: ${n}`)
          .join(", ")
      : "";
    setGonderimMesaji({
      kind: d.gonderildi > 0 ? "basari" : "hata",
      text: nedenler ? `${d.aciklama} Döküm — ${nedenler}.` : d.aciklama,
    });
  }

  return (
    <div className="max-w-3xl">
      <form onSubmit={kaydet} noValidate>
        <div className="ayar-field">
          <span className="u-kicker block text-ink">Bülten</span>
          <span className="u-body u-body-soft block text-[0.8125rem] leading-snug">
            Kapalıysa zamanlanmış gönderim çalışmaz ve elle gönderim düğmesi
            reddeder. Kullanıcıların abonelik tercihleri silinmez.
          </span>
          <div className="mt-2">
            <Switch
              checked={enabled}
              onChange={(v) => {
                setEnabled(v);
                setBildirim(null);
              }}
              label="Bülten gönderimi"
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <Field
            label="Varsayılan gönderim saati"
            hint="Türkiye saati (0–23). Kullanıcı kendi tercihinde değiştirebilir."
            error={saatHatasi}
            errorId="bulten-saat-hata"
          >
            <input
              className="ayar-input"
              type="number"
              min={0}
              max={23}
              value={hour}
              aria-invalid={saatHatasi ? true : undefined}
              aria-describedby={saatHatasi ? "bulten-saat-hata" : undefined}
              onChange={(e) => {
                setHour(e.currentTarget.value);
                setBildirim(null);
              }}
            />
          </Field>

          <Field
            label="Bültendeki en fazla haber"
            hint="5 dakikalık okuma bütçesi yaklaşık 12 habere karşılık gelir."
            error={sayiHatasi}
            errorId="bulten-sayi-hata"
          >
            <input
              className="ayar-input"
              type="number"
              min={1}
              max={60}
              value={maxItems}
              aria-invalid={sayiHatasi ? true : undefined}
              aria-describedby={sayiHatasi ? "bulten-sayi-hata" : undefined}
              onChange={(e) => {
                setMaxItems(e.currentTarget.value);
                setBildirim(null);
              }}
            />
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="submit" className="ayar-btn ayar-btn-primary" disabled={kaydediyor}>
            {kaydediyor ? "Kaydediliyor…" : "Bülten ayarlarını kaydet"}
          </button>
        </div>
        <div className="mt-3">
          <Notice kind={bildirim?.kind ?? null} message={bildirim?.text ?? null} />
        </div>
      </form>

      <div className="yon-altbolum">
        <h3 className="u-kicker text-ink">Elle gönderim</h3>
        <p className="u-body u-body-soft mt-1 text-[0.875rem] leading-snug">
          Bülteni zamanlamayı beklemeden şimdi gönderir. Aynı kullanıcıya aynı
          gün ikinci bülten gitmez — bu kısıt veritabanında tanımlı.
        </p>
        <div className="mt-3">
          <button
            type="button"
            className="ayar-btn"
            onClick={elleGonder}
            disabled={gonderiyor || !zarf.value.enabled}
          >
            {gonderiyor ? "Gönderiliyor…" : "Bülteni şimdi gönder"}
          </button>
          {!zarf.value.enabled ? (
            <span className="u-kicker ml-3 text-ink-faint">
              Bülten kapalı — önce açıp kaydedin
            </span>
          ) : null}
        </div>
        <div className="mt-3">
          <Notice kind={gonderimMesaji?.kind ?? null} message={gonderimMesaji?.text ?? null} />
        </div>
      </div>
    </div>
  );
}
