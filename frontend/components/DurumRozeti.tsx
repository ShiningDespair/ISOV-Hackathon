/**
 * DURUM ROZETI — yarim ozelliklerin yanina konulacak hazir parca
 *
 * KULLANIM
 *   import { DurumRozeti } from "@/components/DurumRozeti";
 *
 *   <h2>Role göre özet <DurumRozeti id="rol-bazli-ozet" /></h2>
 *   <DurumRozeti id="pdf-sunucu" detay />   // eksik/neden metnini de yazar
 *
 * DAVRANIS
 *   - Durum "calisiyor" ise HICBIR SEY basmaz. Calisan ozelligin yanindaki
 *     rozet gereksiz gurultudur; rozetin gorunmesi "burada bir eksik var"
 *     demektir.
 *   - Bilinmeyen id verilirse SESSIZCE null doner (gelistirici hatasi demo
 *     sirasinda sayfayi cokertmesin), yalnizca gelistirme modunda
 *     console.warn ile uyarir.
 *   - Durum bilgisi `lib/feature-status.ts`'ten okunur. Ozelligini bitiren
 *     kisi ORADAKI satirini gunceller; rozet kendiliginden kaybolur.
 *   - Sunucu ya da istemci bileseni icinde kullanilabilir: hook yok,
 *     sunucuya ozel import yok.
 */

import type { Durum } from "@/lib/feature-status";
import { ozellikById } from "@/lib/feature-status";

import { DURUM_KISA, DURUM_SIMGE } from "@/components/durum/Parts";

/** Rozet metninde kullanilan kisa aciklama — `eksik` yoksa `neden`. */
function aciklama(eksik?: string, neden?: string): string | undefined {
  const parcalar = [eksik, neden].filter((p): p is string => Boolean(p && p.trim()));
  return parcalar.length > 0 ? parcalar.join(" ") : undefined;
}

export function DurumRozeti({
  id,
  detay = false,
  className = "",
}: {
  /** `lib/feature-status.ts` icindeki ozellik kimligi. */
  id: string;
  /** true ise eksik/neden metnini rozetin yaninda GORUNUR yazar. */
  detay?: boolean;
  className?: string;
}) {
  const ozellik = ozellikById(id);

  if (!ozellik) {
    if (process.env.NODE_ENV !== "production") {
      // Sessizce null donuyoruz ama gelistirici bunu gormeli.
      console.warn(
        `[DurumRozeti] Bilinmeyen özellik kimliği: "${id}". ` +
          "lib/feature-status.ts içindeki OZELLIKLER dizisine bu id ile bir satır ekleyin.",
      );
    }
    return null;
  }

  // Calisan ozellige rozet basilmaz.
  if (ozellik.durum === "calisiyor") return null;

  const durum: Durum = ozellik.durum;
  const not = aciklama(ozellik.eksik, ozellik.neden);
  const baslik = not ? `${DURUM_KISA[durum]} — ${not}` : DURUM_KISA[durum];

  return (
    <span className={`durum-rozet-sarmal ${className}`.trim()}>
      <span className="durum-rozet" data-durum={durum} title={baslik}>
        <span className="durum-rozet-simge" aria-hidden="true">
          {DURUM_SIMGE[durum]}
        </span>
        <span>{DURUM_KISA[durum]}</span>
      </span>
      {not ? (
        detay ? (
          <span className="durum-rozet-not">{not}</span>
        ) : (
          // Rozetin metin karsiligi: title'a guvenmeyen ekran okuyucular
          // da eksigin ne oldugunu duysun.
          <span className="sr-only">{not}</span>
        )
      ) : null}
    </span>
  );
}

export default DurumRozeti;
