/**
 * DURUM FILTRESI — sunucu tarafi Link seridi.
 *
 * JS gerektirmez: her secenek `/durum?durum=...` adresine giden normal bir
 * baglantidir, yani Tab ile gezilir, Enter ile acilir, yeni sekmede
 * acilabilir ve JavaScript kapaliyken de calisir. Secili olan
 * `aria-current="page"` tasir.
 */

import Link from "next/link";

import type { Durum } from "@/lib/feature-status";
import { DURUM_SIRA } from "@/lib/feature-status";

import { DURUM_KISA, DURUM_SIMGE } from "./Parts";

export function DurumFiltre({
  secili,
  sayilar,
  toplam,
}: {
  secili: Durum | null;
  sayilar: Record<Durum, number>;
  toplam: number;
}) {
  const ogeler: { key: Durum | null; label: string; simge: string; sayi: number }[] = [
    { key: null, label: "Tümü", simge: "≡", sayi: toplam },
    ...DURUM_SIRA.map((d) => ({
      key: d as Durum | null,
      label: DURUM_KISA[d],
      simge: DURUM_SIMGE[d],
      sayi: sayilar[d],
    })),
  ];

  return (
    <nav aria-label="Duruma göre filtre" className="durum-filtre">
      <ul className="durum-filtre-liste">
        {ogeler.map((oge) => {
          const aktif = secili === oge.key;
          return (
            <li key={oge.label}>
              <Link
                href={oge.key ? `/durum?durum=${oge.key}` : "/durum"}
                aria-current={aktif ? "page" : undefined}
                className="durum-filtre-oge"
                data-aktif={aktif ? "1" : undefined}
                data-durum={oge.key ?? "tumu"}
              >
                <span aria-hidden="true" className="durum-filtre-simge">
                  {oge.simge}
                </span>
                <span>{oge.label}</span>
                <span className="durum-filtre-sayi tabular-nums">{oge.sayi}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
