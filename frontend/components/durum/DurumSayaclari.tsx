/**
 * DURUM SAYACLARI — dort sayac ve "kaci calisiyor" oran cubugu.
 * Sayilar `ozellikSayilari()`'ndan gelir; burada elle bir sayi tutulmaz.
 */

import { RatioBar, StatFigure } from "@/components/Charts";
import type { Durum } from "@/lib/feature-status";
import { DURUM_SIRA } from "@/lib/feature-status";

import { DURUM_KISA, DURUM_SIMGE, DURUM_TANIM } from "./Parts";

export function DurumSayaclari({
  sayilar,
  toplam,
}: {
  sayilar: Record<Durum, number>;
  toplam: number;
}) {
  const calisanOran = toplam > 0 ? sayilar.calisiyor / toplam : 0;

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
        {DURUM_SIRA.map((d) => (
          <StatFigure
            key={d}
            label={`${DURUM_SIMGE[d]} ${DURUM_KISA[d]}`}
            value={String(sayilar[d])}
            note={DURUM_TANIM[d]}
          />
        ))}
      </div>

      <div className="mt-6 max-w-xl">
        <RatioBar ratio={calisanOran} label={`Çalışan özellik oranı (${toplam} özellik içinde)`} />
      </div>
    </div>
  );
}
