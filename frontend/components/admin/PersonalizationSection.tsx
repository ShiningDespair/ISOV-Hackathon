"use client";

/**
 * KİŞİSELLEŞTİRME AĞIRLIKLARI
 *
 * NEDEN AYAR TABLOSUNDA (kodda sabit değil): ağırlıklar demo günü
 * DEPLOY'SUZ ayarlanabilsin. Sıralama gözle bakılarak kalibre edilen bir
 * şey; yeniden derleme beklemek o döngüyü öldürür.
 *
 * TEK KAYDIRICI, İKİ AĞIRLIK: genel ve kişisel ağırlığın toplamı 1 olmak
 * zorunda (yoksa kişisel skor ölçeği global skorla karşılaştırılamaz ve
 * bant eşikleri kayar). Bu yüzden arayüzde tek kaydırıcı var, diğer
 * ağırlık ondan türetilir — kullanıcı asla geçersiz bir çift üretemez.
 *
 * Her denetimin YANINDA ne yaptığı tek cümleyle yazılı: bir sayıyı
 * açıklamasız değiştirmek, ne olacağını bilmeden değiştirmektir.
 */

import { useEffect, useState } from "react";

import { Notice, Switch } from "@/components/settings/Parts";
import {
  putAdminSetting,
  type AyarZarfi,
  type KisiselestirmeAyari,
} from "@/lib/api-admin";

import { Kaydirici } from "./Parts";

/** 0,62 -> "%62" — ondalık ayracı Türkçede virgül, yüzde daha okunur. */
function yuzde(v: number): string {
  return `%${Math.round(v * 100)}`;
}

export function PersonalizationSection({
  zarf,
  onKaydedildi,
}: {
  zarf: AyarZarfi<KisiselestirmeAyari>;
  onKaydedildi: (yeni: AyarZarfi<KisiselestirmeAyari>) => void;
}) {
  const [enabled, setEnabled] = useState(zarf.value.enabled);
  const [global, setGlobal] = useState(zarf.value.global_weight);
  const [pin, setPin] = useState(zarf.value.pin_ratio);
  const [kaydediyor, setKaydediyor] = useState(false);
  const [bildirim, setBildirim] = useState<{ kind: "basari" | "hata"; text: string } | null>(null);

  useEffect(() => {
    setEnabled(zarf.value.enabled);
    setGlobal(zarf.value.global_weight);
    setPin(zarf.value.pin_ratio);
  }, [zarf]);

  const kisisel = Math.round((1 - global) * 1000) / 1000;
  const degisti =
    enabled !== zarf.value.enabled ||
    Math.abs(global - zarf.value.global_weight) > 0.0005 ||
    Math.abs(pin - zarf.value.pin_ratio) > 0.0005;

  async function kaydet() {
    setKaydediyor(true);
    setBildirim(null);
    const res = await putAdminSetting<KisiselestirmeAyari>("personalization", {
      enabled,
      global_weight: global,
      personal_weight: kisisel,
      pin_ratio: pin,
    });
    setKaydediyor(false);
    if (!res.ok) {
      setBildirim({ kind: "hata", text: res.error });
      return;
    }
    onKaydedildi(res.data);
    setBildirim({
      kind: "basari",
      text: `Kaydedildi. Sıralama artık ${yuzde(global)} editöryal önem, ${yuzde(
        kisisel,
      )} kişisel uyum ağırlığıyla hesaplanacak.`,
    });
  }

  return (
    <div className="max-w-3xl">
      <div className="ayar-field">
        <span className="u-kicker block text-ink">Kişiselleştirme</span>
        <span className="u-body u-body-soft block text-[0.8125rem] leading-snug">
          Kapatıldığında herkes aynı editöryal sıralamayı görür; profil
          bilgileri silinmez, yalnızca sıralamaya katılmaz.
        </span>
        <div className="mt-2">
          <Switch
            checked={enabled}
            onChange={(v) => {
              setEnabled(v);
              setBildirim(null);
            }}
            label="Kişiselleştirilmiş sıralama"
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        <Kaydirici
          etiket="Editöryal önem ağırlığı"
          deger={global}
          min={0}
          max={1}
          adim={0.01}
          bicimle={yuzde}
          disabled={!enabled}
          onChange={(v) => {
            setGlobal(v);
            setBildirim(null);
          }}
          aciklama={
            <>
              Sıralamanın {yuzde(global)}’i gizli önem skorundan, kalan{" "}
              {yuzde(kisisel)}’i kullanıcının pozisyonu, sektörü ve ilgi
              alanlarından gelir. Yükseltmek herkesi aynı manşetlere,
              düşürmek herkesi kendi dar alanına yaklaştırır.
            </>
          }
        />

        <Kaydirici
          etiket="Kritik haber sabitleme payı"
          deger={pin}
          min={0}
          max={0.5}
          adim={0.01}
          bicimle={yuzde}
          disabled={!enabled}
          onChange={(v) => {
            setPin(v);
            setBildirim(null);
          }}
          aciklama={
            <>
              KRİTİK bantlı haberlerin listenin en fazla {yuzde(pin)}’ini
              doldurmasına izin verilir. Filtre balonuna karşı koruma:
              kişisel skoru düşük olsa bile kritik gelişmeler görünür kalır.
            </>
          }
        />
      </div>

      <div className="yon-ozet">
        <span className="u-kicker text-ink-faint">Yürürlükteki formül</span>
        <p className="u-body mt-1 text-[0.9375rem]">
          nihai skor = {global.toLocaleString("tr-TR")} × editöryal önem +{" "}
          {kisisel.toLocaleString("tr-TR")} × kişisel uyum
        </p>
        <p className="u-body u-body-soft mt-1 text-[0.8125rem] leading-snug">
          Kişisel uyumun hiçbir bileşeni sıfırlanmaz; bu sistem sıralar,
          filtrelemez. Gizlenen haber bile veritabanında kalır.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="ayar-btn ayar-btn-primary"
          onClick={kaydet}
          disabled={kaydediyor || !degisti}
        >
          {kaydediyor ? "Kaydediliyor…" : "Ağırlıkları kaydet"}
        </button>
        {!degisti ? (
          <span className="u-kicker text-ink-faint">Kayıtlı değerlerle aynı</span>
        ) : null}
      </div>

      <div className="mt-3">
        <Notice kind={bildirim?.kind ?? null} message={bildirim?.text ?? null} />
      </div>
    </div>
  );
}
