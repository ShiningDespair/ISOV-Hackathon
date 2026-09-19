"use client";

/**
 * BÜLTEN TERCİHLERİ
 *
 * Saklama: localStorage, anahtar `isov:prefs` (A11yProvider ile aynı desen —
 * mount sonrası oku, her değişimde yaz, okuma/yazma try/catch içinde).
 * Hidrasyondan önce uygulanması gereken bir görsel etkisi olmadığı için
 * bootstrap betiği yoktur.
 *
 * DÜRÜSTLÜK NOTU: bu tercihler şu an yalnızca kaydediliyor; bülten listesi
 * henüz onları okumuyor. Arayüzde de aynen böyle yazıyor — "uygulanır"
 * demek kullanıcıyı yanıltırdı.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { BANDS, BAND_LABEL, REGIONS, REGION_LABEL } from "@/lib/types";
import type { ImportanceBand, Region } from "@/lib/types";

export const PREFS_STORAGE_KEY = "isov:prefs";

export const PER_PAGE_OPTIONS = [20, 40, 60] as const;
export type PerPage = (typeof PER_PAGE_OPTIONS)[number];

export interface NewsletterPreferences {
  /** Varsayılan bölge filtresi. "TUMU" = filtre yok. */
  region: Region | "TUMU";
  /** Varsayılan önem bandı filtresi. "TUMU" = filtre yok. */
  band: ImportanceBand | "TUMU";
  /** Sayfa başına haber sayısı. */
  perPage: PerPage;
  /** Aynı olayı bildiren tekrar kayıtlar listede görünsün mü. */
  includeDuplicates: boolean;
  /** Liste satırlarında özet metni görünsün mü. */
  showSummaries: boolean;
}

export const PREFS_DEFAULTS: NewsletterPreferences = {
  region: "TUMU",
  band: "TUMU",
  perPage: 20,
  includeDuplicates: false,
  showSummaries: true,
};

/** Bozuk localStorage içeriği sayfayı çökertmesin. */
export function normalizePrefs(raw: unknown): NewsletterPreferences {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<NewsletterPreferences>;
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fb: T): T =>
    allowed.includes(v as T) ? (v as T) : fb;

  const perPage = Number(o.perPage);
  return {
    region: pick(o.region, ["TUMU", ...REGIONS] as const, PREFS_DEFAULTS.region),
    band: pick(o.band, ["TUMU", ...BANDS] as const, PREFS_DEFAULTS.band),
    perPage: (PER_PAGE_OPTIONS as readonly number[]).includes(perPage)
      ? (perPage as PerPage)
      : PREFS_DEFAULTS.perPage,
    includeDuplicates:
      typeof o.includeDuplicates === "boolean"
        ? o.includeDuplicates
        : PREFS_DEFAULTS.includeDuplicates,
    showSummaries:
      typeof o.showSummaries === "boolean"
        ? o.showSummaries
        : PREFS_DEFAULTS.showSummaries,
  };
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-t border-rule py-3 first:border-t-0">
      <div className="min-w-[12rem] max-w-md flex-1">
        <span className="u-body block text-[0.9375rem] leading-snug">{label}</span>
        {hint ? (
          <span className="u-body u-body-soft block text-[0.8125rem] leading-snug">
            {hint}
          </span>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function NewsletterPrefs() {
  const [prefs, setPrefs] = useState<NewsletterPreferences>(PREFS_DEFAULTS);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let stored: NewsletterPreferences = PREFS_DEFAULTS;
    try {
      const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
      if (raw) stored = normalizePrefs(JSON.parse(raw));
    } catch {
      /* bozuk içerik — varsayılanla devam */
    }
    setPrefs(stored);
    setReady(true);
  }, []);

  const persist = useCallback((next: NewsletterPreferences) => {
    setPrefs(next);
    try {
      window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
      setSaved(true);
    } catch {
      /* gizli sekmede yazma başarısız olabilir */
      setSaved(false);
    }
  }, []);

  const set = useCallback(
    <K extends keyof NewsletterPreferences>(
      key: K,
      value: NewsletterPreferences[K],
    ) => {
      persist(normalizePrefs({ ...prefs, [key]: value }));
    },
    [persist, prefs],
  );

  const changedCount = useMemo(
    () =>
      (Object.keys(PREFS_DEFAULTS) as (keyof NewsletterPreferences)[]).filter(
        (k) => prefs[k] !== PREFS_DEFAULTS[k],
      ).length,
    [prefs],
  );

  return (
    <div>
      <p className="ayar-uyari u-body">
        Bu tercihler tarayıcınıza kaydedilir. <strong>Henüz bülten
        listesine uygulanmıyor</strong> — sonraki sürümde bülten filtrelerinin
        başlangıç değeri olarak okunacak.
      </p>

      <div className="mt-4">
        <Row
          label="Varsayılan bölge"
          hint="Bülten açıldığında hangi bölgenin seçili geleceği."
        >
          <label>
            <span className="sr-only-custom">Varsayılan bölge</span>
            <select
              className="ayar-select"
              value={prefs.region}
              disabled={!ready}
              onChange={(e) =>
                set("region", e.target.value as NewsletterPreferences["region"])
              }
            >
              <option value="TUMU">Tümü</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {REGION_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
        </Row>

        <Row
          label="Varsayılan önem bandı"
          hint="Yalnızca belirli bir bandın haberleriyle başlamak için."
        >
          <label>
            <span className="sr-only-custom">Varsayılan önem bandı</span>
            <select
              className="ayar-select"
              value={prefs.band}
              disabled={!ready}
              onChange={(e) =>
                set("band", e.target.value as NewsletterPreferences["band"])
              }
            >
              <option value="TUMU">Tümü</option>
              {BANDS.map((b) => (
                <option key={b} value={b}>
                  {BAND_LABEL[b]}
                </option>
              ))}
            </select>
          </label>
        </Row>

        <Row
          label="Sayfa başına haber"
          hint="Uzun listede daha az sayfa çevirmek için artırın."
        >
          <div className="flex gap-1.5" role="radiogroup" aria-label="Sayfa başına haber">
            {PER_PAGE_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={prefs.perPage === n}
                disabled={!ready}
                className="ayar-chip"
                onClick={() => set("perPage", n)}
              >
                {n}
              </button>
            ))}
          </div>
        </Row>

        <Row
          label="Tekrar eden haberleri göster"
          hint="Kapalıyken aynı olayı bildiren kümeden yalnızca temsilci haber listelenir."
        >
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-accent)]"
              checked={prefs.includeDuplicates}
              disabled={!ready}
              onChange={(e) => set("includeDuplicates", e.target.checked)}
            />
            <span className="u-kicker text-ink">
              {prefs.includeDuplicates ? "Gösteriliyor" : "Gizli"}
            </span>
          </label>
        </Row>

        <Row
          label="Özetleri listede göster"
          hint="Kapalıyken yalnızca başlık ve künye satırı görünür."
        >
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-accent)]"
              checked={prefs.showSummaries}
              disabled={!ready}
              onChange={(e) => set("showSummaries", e.target.checked)}
            />
            <span className="u-kicker text-ink">
              {prefs.showSummaries ? "Açık" : "Kapalı"}
            </span>
          </label>
        </Row>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-rule pt-3">
        <p className="u-kicker text-ink-faint" aria-live="polite">
          {!ready
            ? "Tercihler yükleniyor…"
            : changedCount > 0
              ? `${changedCount} tercih değiştirildi${saved ? " ve kaydedildi" : ""}`
              : "Tümü varsayılan"}
        </p>
        <button
          type="button"
          className="ayar-btn"
          disabled={!ready || changedCount === 0}
          onClick={() => persist(PREFS_DEFAULTS)}
        >
          Sıfırla
        </button>
      </div>
    </div>
  );
}
