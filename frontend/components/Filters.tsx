/**
 * Bülten filtreleri: bölge sekmeleri, önem bandı ve arama.
 * Sekmeler sunucu tarafı Link'lerle çalışır (JS gerekmez);
 * arama kutusu küçük bir istemci bileşenidir.
 */

import Link from "next/link";
import { BANDS, REGIONS } from "@/lib/types";
import { bandLabel, regionLabel } from "@/lib/format";
import { SearchBox } from "./SearchBox";

/** Ana sayfa filtre durumu. */
export interface FilterState {
  region?: string;
  band?: string;
  tag?: string;
  q?: string;
  category?: string;
  source?: string;
}

/** Mevcut arama parametrelerini koruyarak yeni bir URL üretir. */
export function withParam(
  current: FilterState,
  key: string,
  value?: string,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (v && k !== key && k !== "page") sp.set(k, v);
  }
  if (value) sp.set(key, value);
  const qs = sp.toString();
  return qs ? `/?${qs}` : "/";
}



export function RegionTabs({ state }: { state: FilterState }) {
  const items = [
    { key: undefined, label: "Tümü" },
    ...REGIONS.map((r) => ({ key: r as string, label: regionLabel(r) })),
  ];

  return (
    <nav aria-label="Bölge filtresi" className="overflow-x-auto">
      <ul className="flex min-w-max items-center gap-x-5 sm:gap-x-7">
        {items.map((item) => {
          const active = (state.region ?? undefined) === item.key;
          return (
            <li key={item.label}>
              <Link
                href={withParam(state, "region", item.key)}
                aria-current={active ? "page" : undefined}
                className={`u-kicker block border-b-2 pb-1.5 pt-1 transition-colors ${
                  active
                    ? "border-ink text-ink"
                    : "border-transparent text-ink-soft hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function BandFilter({ state }: { state: FilterState }) {
  const items = [
    { key: undefined, label: "Tüm Bantlar" },
    ...BANDS.map((b) => ({ key: b as string, label: bandLabel(b) })),
  ];

  return (
    <nav aria-label="Önem bandı filtresi" className="flex flex-wrap gap-2">
      {items.map((item) => {
        const active = (state.band ?? undefined) === item.key;
        return (
          <Link
            key={item.label}
            href={withParam(state, "band", item.key)}
            aria-current={active ? "true" : undefined}
            className="tag-chip"
            data-active={active ? "true" : "false"}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Aktif filtreleri özetleyen şerit — tek tek kaldırılabilir. */
export function ActiveFilters({ state }: { state: FilterState }) {
  const chips: { key: keyof FilterState; label: string }[] = [];
  if (state.region) chips.push({ key: "region", label: `Bölge: ${regionLabel(state.region)}` });
  if (state.band) chips.push({ key: "band", label: `Band: ${bandLabel(state.band)}` });
  if (state.tag) chips.push({ key: "tag", label: `Etiket: ${state.tag}` });
  if (state.q) chips.push({ key: "q", label: `Arama: “${state.q}”` });
  if (state.category) chips.push({ key: "category", label: `Kategori: ${state.category}` });
  if (state.source) chips.push({ key: "source", label: `Kaynak: ${state.source}` });

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-3">
      <span className="u-kicker text-ink-faint">Etkin Filtreler</span>
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={withParam(state, chip.key, undefined)}
          className="tag-chip"
          title="Bu filtreyi kaldır"
        >
          {chip.label} <span aria-hidden="true">×</span>
          <span className="sr-only-custom"> filtresini kaldır</span>
        </Link>
      ))}
      <Link href="/" className="u-kicker u-link-underline text-accent">
        Tümünü Temizle
      </Link>
    </div>
  );
}

export { SearchBox };
