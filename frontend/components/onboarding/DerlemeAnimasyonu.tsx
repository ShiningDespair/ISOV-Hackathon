"use client";

/**
 * KAYIT SONRASI DERLEME EKRANI
 *
 * NE YAPAR: sirayla degisen metinler ve ilerleyen bir serit gosterir,
 * yaklasik 3,6 saniye sonra `onDone()` cagirir.
 *
 * NE YAPMAZ: HICBIR IS YAPMAZ. Arka planda haber toplanmiyor, ozet
 * uretilmiyor, model yuklenmiyor. Bu ekran KOZMETIK ve boyle oldugu
 * `lib/feature-status.ts` icinde `onboarding-animasyon` satirinda
 * "arayuz" olarak yazili.
 *
 * DURUSTLUK CIZGISI: metinler "hazirlaniyor / derleniyor / ayiklaniyor"
 * diyor — yani panelin KURULUSUNU anlatiyor. "Sizin icin yeni haber
 * topluyoruz" DEMIYOR, cunku o cumle yalan olurdu. Ekranin altinda da
 * kozmetik oldugu aciklikla yaziyor.
 *
 * ERISILEBILIRLIK: `prefers-reduced-motion: reduce` ya da
 * `html[data-a11y-motion="azalt"]` (erisilebilirlik widget'i) durumunda
 * animasyon HIC OYNAMAZ, `onDone()` aninda cagrilir. Hareket duyarliligi
 * olan kullaniciyi 4 saniye bekletmenin bir bedeli var, kazanci yok.
 */

import { useEffect, useRef, useState } from "react";

/** Her satirin ekranda kalma suresi (ms). */
const SATIR_SURESI = 900;

export interface DerlemeGirdisi {
  sectorLabel: string;
  interestLabels: string[];
  minutes: number;
  items: number;
}

/**
 * Animasyon metinlerini kullanicinin SECIMLERINDEN uretir.
 * Jenerik "yükleniyor" yerine kendi sektorunu ve ilgi alanini gormek,
 * kurulumun gercekten kaydedildigi hissini verir.
 */
export function derlemeSatirlari(g: DerlemeGirdisi): string[] {
  const ilgi = g.interestLabels.slice(0, 2).join(" ve ");
  const satirlar = [
    `${g.sectorLabel} sektörü taranıyor…`,
    ilgi ? `${ilgi} başlıkları ayıklanıyor…` : "Öne çıkan başlıklar ayıklanıyor…",
    "Aynı haberi yazan kaynaklar tekilleştiriliyor…",
    `${g.minutes} dakikalık bülteniniz derleniyor…`,
  ];
  return satirlar;
}

export function DerlemeAnimasyonu({
  lines,
  onDone,
  items,
}: {
  lines: string[];
  onDone: () => void;
  /** Kac haberin siralandigi — alt satirdaki somut bilgi. */
  items?: number;
}) {
  const [index, setIndex] = useState(0);
  const [atlandi, setAtlandi] = useState(false);
  // onDone her render'da yeni referans olabilir; zamanlayici yeniden
  // baslamasin diye ref'te tutuluyor.
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const azalt = (() => {
      try {
        return (
          window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
          document.documentElement.dataset.a11yMotion === "azalt"
        );
      } catch {
        return false;
      }
    })();

    if (azalt || lines.length === 0) {
      setAtlandi(true);
      doneRef.current();
      return;
    }

    let step = 0;
    const timer = window.setInterval(() => {
      step += 1;
      if (step >= lines.length) {
        // Son satir da 900 ms ekranda kaldi; toplam sure 4 x 900 = 3,6 sn.
        // Burada ek bir bekleme koymak toplami 4,5 sn'ye cikariyordu.
        window.clearInterval(timer);
        doneRef.current();
        return;
      }
      setIndex(step);
    }, SATIR_SURESI);

    return () => window.clearInterval(timer);
  }, [lines.length]);

  const yuzde = lines.length
    ? Math.round(((index + 1) / lines.length) * 100)
    : 100;

  if (atlandi) {
    // Hareket azaltilmis: animasyon yok, yalnizca tek satir bilgi.
    return (
      <div className="otur-derleme" data-durgun="1">
        <p className="u-kicker u-kicker-accent">Kurulum tamamlandı</p>
        <p className="u-headline u-headline-md mt-1">Paneliniz hazırlanıyor</p>
      </div>
    );
  }

  return (
    <div className="otur-derleme">
      <p className="u-kicker u-kicker-accent">Kurulum tamamlandı</p>
      <h2 className="u-headline u-headline-md mt-1">Paneliniz hazırlanıyor</h2>

      <div className="otur-derleme-kural" aria-hidden="true" />

      {/* Metinler: tek canli bolge, her degisimde okunur. Satirlarin
          kendisi gorsel olarak solup gelir; bolge sabit kalir ki ekran
          okuyucu her seferinde bastan okumasin. */}
      <p className="otur-derleme-satir" aria-live="polite" role="status">
        {/* Canli bolgenin KENDISI hic degismiyor, yalnizca icindeki span
            yeniden monte oluyor: bolgeyi remount etmek bazi ekran
            okuyuculari degisikligi duyurmaz yapiyor. */}
        <span key={index} className="otur-derleme-metin">
          {lines[index]}
        </span>
      </p>

      <div className="otur-derleme-serit" role="presentation">
        <span className="otur-derleme-dolgu" style={{ width: `${yuzde}%` }} />
      </div>

      <p className="otur-derleme-adim" aria-hidden="true">
        {index + 1} / {lines.length}
        {items ? ` · ${items} haber sıralanıyor` : ""}
      </p>

      <p className="otur-derleme-not">
        Bu ekran panelin kuruluşunu özetleyen kısa bir tanıtımdır; arka planda
        yeni haber toplanmıyor. Hesabınız ve tercihleriniz zaten kaydedildi.
      </p>
    </div>
  );
}
