/**
 * OZELLIK LISTESI — alana gore gruplu, semantik liste.
 *
 * Yapi: her alan bir <section>, icindeki ozellikler <ul>/<li>, her
 * ozelligin kanit/eksik/neden notlari <dl> icinde dt/dd cifti.
 * Satirin durumu hem metin etiketinden hem simgeden hem de sol kenar
 * cizgisinin kalinlik/desen farkindan okunur — renk tek gosterge degildir.
 */

import { SectionRule } from "@/components/States";
import type { AlanGrubu } from "@/lib/feature-status";

import { DurumEtiketi, DurumNotu } from "./Parts";

export function OzellikListesi({ gruplar }: { gruplar: AlanGrubu[] }) {
  if (gruplar.length === 0) {
    return (
      <p className="u-body u-body-soft mt-6 text-[0.95rem]">
        Bu durumda özellik yok.
      </p>
    );
  }

  return (
    <div className="durum-gruplar">
      {gruplar.map((grup) => (
        <section key={grup.alan} className="durum-grup" aria-labelledby={`alan-${grup.alan}`}>
          <div id={`alan-${grup.alan}`}>
            <SectionRule
              title={grup.label}
              right={`${grup.ozellikler.length} özellik`}
            />
          </div>

          <ul className="durum-liste">
            {grup.ozellikler.map((o) => (
              <li key={o.id} className="durum-satir" data-durum={o.durum}>
                <div className="durum-satir-bas">
                  <h3 className="durum-satir-ad">{o.ad}</h3>
                  <DurumEtiketi durum={o.durum} />
                </div>

                {o.nasil || o.eksik || o.neden ? (
                  <dl className="durum-notlar">
                    {o.nasil ? <DurumNotu tur="kanit" metin={o.nasil} /> : null}
                    {o.eksik ? <DurumNotu tur="eksik" metin={o.eksik} /> : null}
                    {o.neden ? <DurumNotu tur="neden" metin={o.neden} /> : null}
                  </dl>
                ) : null}

                <p className="durum-satir-kimlik">
                  <span className="sr-only">Özellik kimliği: </span>
                  {o.id}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
