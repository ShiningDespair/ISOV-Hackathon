"use client";

/**
 * "SON ZİYARETİNİZDEN BERİ N DEĞİŞİKLİK" ÖZETİ.
 *
 * `GET /me/changes` oturum gerektirir ve oturum httpOnly çerezde taşınır.
 * Bu yüzden istek TARAYICIDAN atılır: sunucu bileşeninden çağırmak çerezi
 * elle iletmeyi gerektirir, o da her sayfayı oturuma bağımlı kılar.
 *
 * Görünmediği durumlar (hepsi sessiz):
 *  - uç nokta henüz yok (501/404)  → özellik yok, satır da yok
 *  - oturum yok (401/403)          → kişisel bilgi zaten gösterilemez
 *  - ağ hatası                     → sayı uydurmak yerine hiç göstermeyiz
 */

import { useEffect, useState } from "react";

import {
  getMeChanges,
  hazirDegil,
  oturumGerekli,
  TEKNIK_TUR,
  type MeChanges,
} from "@/lib/api-me";
import { formatDateTime, formatNumber } from "@/lib/format";

interface Durum {
  total: number;
  since?: string | null;
  sinceSource: MeChanges["sinceSource"];
  /** Teknik "özet güncellendi" kayıtları — sayıdan düşülür, ayrıca söylenir. */
  teknik: number;
}

export function SinceLastVisit() {
  const [durum, setDurum] = useState<Durum | null>(null);

  useEffect(() => {
    let iptal = false;
    (async () => {
      const res = await getMeChanges();
      if (iptal) return;
      if (!res.ok) {
        // 501/404/401/403/ağ — hepsinde satır hiç basılmaz.
        if (!hazirDegil(res.status) && !oturumGerekli(res.status)) {
          setDurum(null);
        }
        return;
      }
      setDurum({
        total: res.data.total,
        since: res.data.since,
        sinceSource: res.data.sinceSource,
        teknik: res.data.counts[TEKNIK_TUR] ?? 0,
      });
    })();
    return () => {
      iptal = true;
    };
  }, []);

  if (!durum) return null;

  // Okura anlamlı sayı: teknik özet yenilemeleri hariç (aşağıdaki listeyle
  // aynı kural — iki yerde iki ayrı sayı olmasın).
  const anlamli = Math.max(0, durum.total - durum.teknik);
  const ilkZiyaret = durum.sinceSource === "ilk-giris";

  return (
    <p className="degis-ziyaret" role="status" aria-live="polite">
      <span className="u-kicker degis-ziyaret-etiket">
        {ilkZiyaret
          ? "İlk ziyaretiniz — son 7 günün değişiklikleri"
          : durum.sinceSource === "onceki-ziyaret"
            ? "Son ziyaretinizden beri"
            : "Bu dönemde"}
      </span>{" "}
      {anlamli > 0 ? (
        <strong className="degis-ziyaret-sayi">
          {formatNumber(anlamli)} değişiklik
        </strong>
      ) : (
        <span className="degis-ziyaret-sayi">yeni değişiklik yok</span>
      )}
      {durum.teknik > 0 ? (
        <span className="degis-ziyaret-tarih">
          {" "}
          (+{formatNumber(durum.teknik)} teknik özet güncellemesi)
        </span>
      ) : null}
      {/* "son giriş" YALNIZCA backend eşiğin gerçek bir önceki ziyaret
          olduğunu söylediğinde. İlk ziyarette `since` 7 günlük pencerenin
          başıdır ve "son giriş" diye basılması ölçülen sahte bilgiydi. */}
      {durum.since && durum.sinceSource === "onceki-ziyaret" ? (
        <span className="degis-ziyaret-tarih">
          {" "}
          · son ziyaret {formatDateTime(durum.since)}
        </span>
      ) : null}
      {durum.since && ilkZiyaret ? (
        <span className="degis-ziyaret-tarih">
          {" "}
          · {formatDateTime(durum.since)} sonrası
        </span>
      ) : null}
    </p>
  );
}

export default SinceLastVisit;
