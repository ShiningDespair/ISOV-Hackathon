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

import { getMeChanges, hazirDegil, oturumGerekli } from "@/lib/api-me";
import { formatDateTime, formatNumber } from "@/lib/format";

interface Durum {
  total: number;
  since?: string | null;
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
      setDurum({ total: res.data.total, since: res.data.since });
    })();
    return () => {
      iptal = true;
    };
  }, []);

  if (!durum) return null;

  return (
    <p className="degis-ziyaret" role="status" aria-live="polite">
      <span className="u-kicker degis-ziyaret-etiket">Son ziyaretinizden beri</span>{" "}
      {durum.total > 0 ? (
        <strong className="degis-ziyaret-sayi">
          {formatNumber(durum.total)} değişiklik
        </strong>
      ) : (
        <span className="degis-ziyaret-sayi">yeni değişiklik yok</span>
      )}
      {durum.since ? (
        <span className="degis-ziyaret-tarih">
          {" "}
          · son giriş {formatDateTime(durum.since)}
        </span>
      ) : null}
    </p>
  );
}

export default SinceLastVisit;
