"use client";

/**
 * NACE SEKTÖR KAPSAMI
 *
 * "Hangi sektörde kaç haber var" — asıl soru ise ZAYIF OLANLARIN nerede
 * olduğu. Bu yüzden liste varsayılan olarak veri kalınlığına göre ARTAN
 * sıralanır: en ince kapsam en üstte durur, göze çarpar.
 *
 * Eşleşme `entities.sektor` serbest metninin `lib/sectors.js` sözlüğüyle
 * kesişiminden gelir; hangi terimin tuttuğu satırda yazılı, böylece bir
 * sayının neden öyle olduğu sorulabilir. Hiçbir kaleme girmeyen terimler
 * ayrı listede — sözlüğün büyümesi gereken yer orası.
 */

import { useEffect, useMemo, useState } from "react";

import { formatDateTime, formatNumber } from "@/lib/format";
import {
  getAdminNaceCoverage,
  type NaceKalemi,
  type NaceKapsamYaniti,
} from "@/lib/api-admin";

import { DurumSatiri, Rozet, SayiKutusu, SiraliBaslik } from "./Parts";

type Sutun = "kod" | "ad" | "haber" | "tekil";

function durumRozeti(k: NaceKalemi) {
  if (k.durum === "yok") return <Rozet tur="kotu">Veri yok</Rozet>;
  if (k.durum === "zayif") return <Rozet tur="uyari">İnce</Rozet>;
  return <Rozet tur="iyi">Yeterli</Rozet>;
}

export function NaceCoverageSection() {
  const [veri, setVeri] = useState<NaceKapsamYaniti | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [sutun, setSutun] = useState<Sutun>("tekil");
  const [yon, setYon] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    let iptal = false;
    (async () => {
      const res = await getAdminNaceCoverage();
      if (iptal) return;
      setYukleniyor(false);
      if (!res.ok) {
        setHata(res.error);
        return;
      }
      setHata(null);
      setVeri(res.data);
    })();
    return () => {
      iptal = true;
    };
  }, []);

  // 26 kalem — sıralama istemcide yapılır, tek sayfa ve tam liste geliyor.
  const kalemler = useMemo(() => {
    const arr = [...(veri?.data ?? [])];
    const carpan = yon === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sutun) {
        case "kod":
          return carpan * a.code.localeCompare(b.code, "tr");
        case "ad":
          return carpan * a.label.localeCompare(b.label, "tr");
        case "haber":
          return carpan * (a.article_count - b.article_count);
        default:
          return carpan * (a.unique_count - b.unique_count);
      }
    });
    return arr;
  }, [veri, sutun, yon]);

  function sirala(yeni: Sutun) {
    if (yeni === sutun) setYon((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSutun(yeni);
      setYon(yeni === "kod" || yeni === "ad" ? "asc" : "asc");
    }
  }

  const o = veri?.ozet;

  return (
    <div>
      <DurumSatiri
        yukleniyor={yukleniyor}
        hata={hata}
        bos={Boolean(veri && veri.data.length === 0)}
        bosMesaj="Kapsam verisi hesaplanamadı."
      />

      {o ? (
        <div className="yon-kutu-grid">
          <SayiKutusu
            etiket="NACE kalemi"
            deger={formatNumber(o.nace_kalem_sayisi)}
            not={`${formatNumber(o.kapsanan_kalem)} kalemde en az bir haber var`}
          />
          <SayiKutusu
            etiket="Veri yok"
            deger={formatNumber(o.bos_kalem.length)}
            vurgu={o.bos_kalem.length > 0}
            not={o.bos_kalem.length > 0 ? o.bos_kalem.join(", ") : "Tüm kalemlerde veri var"}
          />
          <SayiKutusu
            etiket="İnce kapsam"
            deger={formatNumber(o.zayif_kalem.length)}
            not={`Tekil haber sayısı ${formatNumber(o.zayif_esik)} altında: ${
              o.zayif_kalem.length > 0 ? o.zayif_kalem.join(", ") : "yok"
            }`}
          />
          <SayiKutusu
            etiket="Sektör bilgisi olan haber"
            deger={formatNumber(o.sektor_bilgisi_olan)}
            not={`${formatNumber(o.sektor_bilgisi_olmayan)} haberde sektör bilgisi yok`}
          />
          <SayiKutusu
            etiket="Kesişen haber"
            deger={formatNumber(o.kesisen_haber)}
            not="Sektörden bağımsız (imalat, sanayi, KOBİ, ihracat…) — herkesi ilgilendirir"
          />
        </div>
      ) : null}

      {kalemler.length > 0 ? (
        <div className="ayar-scroll mt-5">
          <table className="ayar-table yon-tablo">
            <caption className="sr-only">
              NACE sektör bölümlerine göre haber sayıları ve veri kalınlığı
            </caption>
            <thead>
              <tr>
                <SiraliBaslik
                  baslik="Kod"
                  aktif={sutun === "kod"}
                  yon={yon}
                  onClick={() => sirala("kod")}
                  genislik="4.5rem"
                />
                <SiraliBaslik
                  baslik="Sektör"
                  aktif={sutun === "ad"}
                  yon={yon}
                  onClick={() => sirala("ad")}
                />
                <SiraliBaslik
                  baslik="Haber"
                  aktif={sutun === "haber"}
                  yon={yon}
                  onClick={() => sirala("haber")}
                  genislik="5rem"
                />
                <SiraliBaslik
                  baslik="Tekil"
                  aktif={sutun === "tekil"}
                  yon={yon}
                  onClick={() => sirala("tekil")}
                  genislik="5rem"
                />
                <th scope="col">Kapsam</th>
                <th scope="col">Eşleşen terimler</th>
              </tr>
            </thead>
            <tbody>
              {kalemler.map((k) => (
                <tr key={k.code} data-inactive={k.article_count === 0 ? "true" : undefined}>
                  <th scope="row" className="font-normal tabular-nums">
                    {k.code}
                  </th>
                  <td>
                    {k.label}
                    {k.last_published_at ? (
                      <span className="u-body u-body-soft block text-[0.75rem]">
                        Son haber: {formatDateTime(k.last_published_at)}
                      </span>
                    ) : null}
                  </td>
                  <td className="tabular-nums">{formatNumber(k.article_count)}</td>
                  <td className="tabular-nums">{formatNumber(k.unique_count)}</td>
                  <td>
                    {durumRozeti(k)}
                    {k.bands.KRITIK > 0 ? (
                      <span className="u-body u-body-soft block text-[0.75rem]">
                        {formatNumber(k.bands.KRITIK)} kritik
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {k.matched_terms.length === 0 ? (
                      <span className="u-body u-body-soft text-[0.8125rem]">—</span>
                    ) : (
                      <span className="u-body u-body-soft text-[0.8125rem] leading-snug">
                        {k.matched_terms
                          .slice(0, 5)
                          .map((t) => `${t.term} (${formatNumber(t.adet)})`)
                          .join(", ")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {veri && veri.eslesmeyen_terimler.length > 0 ? (
        <div className="yon-altbolum">
          <h3 className="u-kicker text-ink">Sözlükte karşılığı olmayan sektör terimleri</h3>
          <p className="u-body u-body-soft mt-1 text-[0.875rem] leading-snug">
            Bu terimler haberlerde geçiyor ama hiçbir NACE kalemine eşlenmiyor.
            Sözlüğün (<code>lib/sectors.js</code>) büyümesi gereken yer burası;
            kapsam boşluğu bu listeden kapanır.
          </p>
          <p className="u-body mt-2 text-[0.875rem] leading-snug">
            {veri.eslesmeyen_terimler
              .map((t) => `${t.term} (${formatNumber(t.adet)})`)
              .join(" · ")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
