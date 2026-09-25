"use client";

/**
 * KAYNAKLAR MODÜLÜ
 *
 * Listeleme + arama/filtre + satır başına "panelde izle" anahtarı + toplu
 * işlemler + yeni kaynak formu.
 *
 * ÇOK KİRACILI DAVRANIŞ (kritik, arayüzde de yazılı): anahtar toplamayı
 * AÇIP KAPATMAZ. Bir kaynağı izlemeyi bırakmak yalnızca bu kurumun panelinde
 * o kaynağın haberlerini gizler. Haberler toplanmaya ve saklanmaya devam
 * eder, çünkü aynı kaynağı izleyen başka kurumlar olabilir. Bu yüzden
 * `is_active` (yönetici alanı) buradan DEĞİŞTİRİLMEZ; yalnızca `is_watched`
 * yazılır — `PUT /sources/:id/watch` ve `PUT /sources/watch/bulk`.
 *
 * Yazma işlemleri tarayıcıdan `NEXT_PUBLIC_API_BASE_URL` (varsayılan `/api`)
 * üzerinden gider. Vekil tanımlı değilse istek 404 döner; `lib/api.ts` bunu
 * "Sunucuya ulaşılamadı." mesajına çevirir — sessiz başarısızlık yok.
 */

import { useSession } from "@/components/SessionProvider";
import { useMemo, useState } from "react";

import {
  createSource,
  setSourceWatched,
  setSourcesWatchedBulk,
} from "@/lib/api";
import { formatNumber } from "@/lib/format";
import {
  SOURCE_TYPES,
  SOURCE_TYPE_HINT,
  SOURCE_TYPE_LABEL,
  normalizeSourceType,
  sourceTypeLabel,
  type Source,
  type SourceType,
} from "@/lib/types";

import { ChipGroup, Field, Meter, Notice, Switch } from "./Parts";

type TypeFilter = SourceType | "TUMU";
type WatchFilter = "TUMU" | "izlenen" | "izlenmeyen";
type Grouping = "tur" | "yok";
type SortKey = "name" | "source_type" | "authority_weight" | "article_count";

interface FormState {
  name: string;
  homepage_url: string;
  source_type: SourceType;
  authority_weight: string;
  country_code: string;
  language: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  homepage_url: "",
  source_type: "basin",
  authority_weight: "50",
  country_code: "TR",
  language: "tr",
};

/** Karşılaştırma için Türkçe duyarlı, küçük harfli anahtar. */
function foldTr(value: string): string {
  return value.toLocaleLowerCase("tr-TR");
}

/** İstemci tarafı doğrulama — backend'e gitmeden anlaşılır uyarı verir. */
function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};

  if (!form.name.trim()) {
    errors.name = "Kaynak adı zorunludur.";
  } else if (form.name.trim().length < 2) {
    errors.name = "Kaynak adı en az iki karakter olmalıdır.";
  }

  const url = form.homepage_url.trim();
  if (!url) {
    errors.homepage_url = "Ana sayfa adresi zorunludur.";
  } else {
    let parsed: URL | null = null;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }
    if (!parsed || !/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes(".")) {
      errors.homepage_url =
        "Geçerli bir adres girin; http:// veya https:// ile başlamalı.";
    }
  }

  const weight = Number(form.authority_weight);
  if (form.authority_weight.trim() === "" || !Number.isFinite(weight)) {
    errors.authority_weight = "Otorite ağırlığı bir sayı olmalıdır.";
  } else if (weight < 0 || weight > 100) {
    errors.authority_weight = "Otorite ağırlığı 0 ile 100 arasında olmalıdır.";
  }

  const cc = form.country_code.trim();
  if (cc && !/^[A-Za-z]{2}$/.test(cc)) {
    errors.country_code = "Ülke kodu iki harf olmalıdır (ör. TR, EU, US).";
  }

  const lang = form.language.trim();
  if (lang && !/^[A-Za-z]{2}$/.test(lang)) {
    errors.language = "Dil kodu iki harf olmalıdır (ör. tr, en).";
  }

  return errors;
}

export function SourcesPanel({
  initialSources,
  initialError,
}: {
  initialSources: Source[];
  initialError: string | null;
}) {
  const [sources, setSources] = useState<Source[]>(initialSources);
  const { canEdit } = useSession();

  // Filtreler
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("TUMU");
  const [watchFilter, setWatchFilter] = useState<WatchFilter>("TUMU");
  const [grouping, setGrouping] = useState<Grouping>("tur");
  const [sortKey, setSortKey] = useState<SortKey>("authority_weight");
  const [sortDesc, setSortDesc] = useState(true);

  // İzleme anahtarı durumu
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toggleMsg, setToggleMsg] = useState<{
    kind: "basari" | "hata";
    text: string;
  } | null>(null);

  // Yeni kaynak formu
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<{
    kind: "basari" | "hata";
    text: string;
  } | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  /** `is_watched` gelmemişse kaynak izleniyor sayılır (güvenli varsayılan). */
  const watchedCount = useMemo(
    () => sources.filter((s) => s.is_watched !== false).length,
    [sources],
  );

  const filtered = useMemo(() => {
    const needle = foldTr(q.trim());
    return sources.filter((s) => {
      if (typeFilter !== "TUMU" && normalizeSourceType(s.source_type) !== typeFilter) {
        return false;
      }
      const isWatched = s.is_watched !== false;
      if (watchFilter === "izlenen" && !isWatched) return false;
      if (watchFilter === "izlenmeyen" && isWatched) return false;
      if (!needle) return true;
      const haystack = foldTr(
        [s.name, s.slug, s.homepage_url ?? "", s.country_code ?? ""].join(" "),
      );
      return haystack.includes(needle);
    });
  }, [sources, q, typeFilter, watchFilter]);

  const sorted = useMemo(() => {
    const dir = sortDesc ? -1 : 1;
    const value = (s: Source): string | number => {
      switch (sortKey) {
        case "name":
          return foldTr(s.name ?? "");
        case "source_type":
          return sourceTypeLabel(s.source_type);
        case "article_count":
          return Number(s.article_count ?? 0);
        case "authority_weight":
        default:
          return Number(s.authority_weight ?? 0);
      }
    };
    return [...filtered].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb), "tr-TR");
      }
      if (cmp !== 0) return cmp * dir;
      // İkincil anahtar: ad — sıralama her zaman kararlı olsun.
      return foldTr(a.name ?? "").localeCompare(foldTr(b.name ?? ""), "tr-TR");
    });
  }, [filtered, sortKey, sortDesc]);

  /** Gruplu görünüm için: tür -> kaynaklar. Boş gruplar atlanır. */
  const groups = useMemo(() => {
    if (grouping === "yok") return null;
    return SOURCE_TYPES.map((type) => ({
      type,
      rows: sorted.filter((s) => normalizeSourceType(s.source_type) === type),
    })).filter((g) => g.rows.length > 0);
  }, [sorted, grouping]);

  function requestSort(key: SortKey) {
    if (key === sortKey) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      // Sayısal kolonlarda yüksekten başlamak daha faydalı.
      setSortDesc(key === "authority_weight" || key === "article_count");
    }
  }

  function ariaSort(key: SortKey): "ascending" | "descending" | "none" {
    if (key !== sortKey) return "none";
    return sortDesc ? "descending" : "ascending";
  }

  async function onToggle(source: Source, next: boolean) {
    const id = source.id;
    if (typeof id !== "number") {
      setToggleMsg({
        kind: "hata",
        text: "Bu kaynağın kimliği bilinmiyor, izleme durumu değiştirilemedi.",
      });
      return;
    }

    setPending((prev) => new Set(prev).add(id));
    setToggleMsg(null);

    const res = await setSourceWatched(id, next);

    setPending((prev) => {
      const copy = new Set(prev);
      copy.delete(id);
      return copy;
    });

    if (!res.ok) {
      setToggleMsg({
        kind: "hata",
        text: `“${source.name}” için izleme durumu değiştirilemedi. ${res.error}`,
      });
      return;
    }

    // Sunucu güncel kaydı döndürdüyse onu kullan, yoksa yalnızca durumu yaz.
    setSources((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              ...(res.data && typeof res.data === "object" ? res.data : {}),
              is_watched:
                typeof res.data?.is_watched === "boolean"
                  ? res.data.is_watched
                  : next,
            }
          : s,
      ),
    );
    setToggleMsg({
      kind: "basari",
      text: next
        ? `“${source.name}” panelinizde izleniyor.`
        : `“${source.name}” panelinizden kaldırıldı. Haberleri toplanmaya ve saklanmaya devam ediyor.`,
    });
  }

  /**
   * Toplu izleme değişikliği.
   * `scope: "filtre"` yalnızca o an listelenen kaynakları, `"tumu"` bütün
   * listeyi kapsar. Tek istekte gider — 81 kaynak için 81 istek atılmaz.
   */
  async function onBulk(scope: "filtre" | "tumu", next: boolean) {
    // Yalnızca durumu gerçekten değişecek kaynaklar gönderilir.
    const target = (scope === "filtre" ? sorted : sources).filter(
      (s) => typeof s.id === "number" && (s.is_watched !== false) !== next,
    );
    const ids = target.map((s) => s.id as number);

    if (ids.length === 0) {
      setToggleMsg({
        kind: "basari",
        text: next
          ? "Seçili kaynakların hepsi zaten izleniyor."
          : "Seçili kaynakların hiçbiri zaten izlenmiyor.",
      });
      return;
    }

    setBulkBusy(true);
    setToggleMsg(null);

    const res = await setSourcesWatchedBulk(ids, next);

    setBulkBusy(false);

    if (!res.ok) {
      setToggleMsg({
        kind: "hata",
        text: `Toplu işlem tamamlanamadı. ${res.error}`,
      });
      return;
    }

    // Sunucu güncel kayıtları döndürdüyse onları esas al; yoksa yerel yaz.
    const returned = new Map<number, Source>();
    if (Array.isArray(res.data)) {
      for (const item of res.data) {
        if (typeof item?.id === "number") returned.set(item.id, item);
      }
    }
    const changed = new Set(ids);
    setSources((prev) =>
      prev.map((s) => {
        if (typeof s.id !== "number") return s;
        const fresh = returned.get(s.id);
        if (fresh) return { ...s, ...fresh };
        return changed.has(s.id) ? { ...s, is_watched: next } : s;
      }),
    );
    setToggleMsg({
      kind: "basari",
      text: next
        ? `${ids.length} kaynak panelinizde izlemeye alındı.`
        : `${ids.length} kaynak panelinizden kaldırıldı. Haberleri toplanmaya ve saklanmaya devam ediyor.`,
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormMsg(null);

    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFormMsg({ kind: "hata", text: "Formda düzeltilmesi gereken alanlar var." });
      return;
    }

    setSubmitting(true);
    const res = await createSource({
      name: form.name.trim(),
      homepage_url: form.homepage_url.trim(),
      source_type: form.source_type,
      authority_weight: Math.round(Number(form.authority_weight)),
      country_code: form.country_code.trim().toUpperCase() || undefined,
      language: form.language.trim().toLowerCase() || undefined,
    });
    setSubmitting(false);

    if (!res.ok) {
      setFormMsg({ kind: "hata", text: res.error });
      return;
    }

    const created: Source =
      res.data && typeof res.data === "object" && res.data.name
        ? res.data
        : {
            slug: form.name.trim(),
            name: form.name.trim(),
            homepage_url: form.homepage_url.trim(),
            source_type: form.source_type,
            authority_weight: Math.round(Number(form.authority_weight)),
            country_code: form.country_code.trim().toUpperCase() || null,
            language: form.language.trim().toLowerCase() || null,
            is_active: true,
            is_watched: true,
            article_count: 0,
          };

    setSources((prev) => [created, ...prev]);
    setForm(EMPTY_FORM);
    setErrors({});
    setFormMsg({
      kind: "basari",
      text: `“${created.name}” eklendi. Haberleri bir sonraki toplamada görünecek.`,
    });
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  }

  const row = (s: Source, index: number) => {
    const isWatched = s.is_watched !== false;
    const busy = typeof s.id === "number" && pending.has(s.id);
    return (
      <tr key={s.id ?? `${s.slug}-${index}`} data-inactive={!isWatched}>
        <td>
          <span className="u-body block text-[0.9375rem] leading-snug">{s.name}</span>
          {s.homepage_url ? (
            <a
              href={s.homepage_url}
              target="_blank"
              rel="noopener noreferrer"
              className="u-kicker u-link-underline block text-ink-faint"
            >
              {s.homepage_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          ) : (
            <span className="u-kicker block text-ink-faint">{s.slug}</span>
          )}
        </td>
        <td className="u-kicker whitespace-nowrap text-ink-soft">
          {sourceTypeLabel(s.source_type)}
        </td>
        <td className="whitespace-nowrap">
          <Meter value={Number(s.authority_weight ?? 0)} />
        </td>
        <td className="tabular-nums whitespace-nowrap">
          {formatNumber(Number(s.article_count ?? 0))}
        </td>
        <td className="whitespace-nowrap">
          <Switch
            checked={isWatched}
            busy={busy}
            label={`${s.name} — panelde izle`}
            onLabel="İzleniyor"
            offLabel="İzlenmiyor"
            onChange={(next) => void onToggle(s, next)}
          />
        </td>
      </tr>
    );
  };

  const header = (
    <thead>
      <tr>
        <th scope="col" aria-sort={ariaSort("name")}>
          <button
            type="button"
            className="ayar-sort"
            onClick={() => requestSort("name")}
          >
            Kaynak
            <span aria-hidden="true">
              {sortKey === "name" ? (sortDesc ? "▼" : "▲") : "↕"}
            </span>
          </button>
        </th>
        <th scope="col" aria-sort={ariaSort("source_type")}>
          <button
            type="button"
            className="ayar-sort"
            onClick={() => requestSort("source_type")}
          >
            Tür
            <span aria-hidden="true">
              {sortKey === "source_type" ? (sortDesc ? "▼" : "▲") : "↕"}
            </span>
          </button>
        </th>
        <th scope="col" aria-sort={ariaSort("authority_weight")}>
          <button
            type="button"
            className="ayar-sort"
            onClick={() => requestSort("authority_weight")}
          >
            Otorite
            <span aria-hidden="true">
              {sortKey === "authority_weight" ? (sortDesc ? "▼" : "▲") : "↕"}
            </span>
          </button>
        </th>
        <th scope="col" aria-sort={ariaSort("article_count")}>
          <button
            type="button"
            className="ayar-sort"
            onClick={() => requestSort("article_count")}
          >
            Haber
            <span aria-hidden="true">
              {sortKey === "article_count" ? (sortDesc ? "▼" : "▲") : "↕"}
            </span>
          </button>
        </th>
        <th scope="col">Panelde İzle</th>
      </tr>
    </thead>
  );

  return (
    <div>
      {/* İZLEMEYİ BIRAKMANIN ANLAMI — en kritik açıklama, listenin üstünde */}
      <p className="ayar-uyari u-body">
        <strong>
          Bir kaynağı izlemeyi bırakmak yalnızca sizin panelinizi etkiler.
        </strong>{" "}
        Haberler toplanmaya ve saklanmaya devam eder; hiçbir kayıt silinmez ve
        aynı kaynağı izleyen diğer kurumlar etkilenmez. Tekrar izlemeye
        aldığınızda o kaynağın geçmiş haberleri de panelinizde yeniden görünür.
      </p>

      {initialError ? (
        <p className="ayar-bildirim mt-4" data-tur="hata">
          Kaynak listesi yüklenemedi. {initialError} Sayfayı yenilemeyi deneyin.
        </p>
      ) : null}

      {/* Filtre çubuğu */}
      <div className="mt-5 space-y-2.5 border-y border-rule py-3">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <label className="block min-w-[14rem] flex-1">
            <span className="u-kicker block text-ink">Kaynak ara</span>
            <input
              type="search"
              className="ayar-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ad, kısa ad ya da adres"
            />
          </label>
          <p className="u-kicker pb-2 text-ink-faint">
            {formatNumber(sources.length)} kaynaktan{" "}
            {formatNumber(watchedCount)} tanesi izleniyor
            {sorted.length !== sources.length
              ? ` · listede ${formatNumber(sorted.length)} kaynak`
              : ""}
          </p>
        </div>

        <ChipGroup<TypeFilter>
          label="Tür"
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { key: "TUMU", label: "Tümü" },
            ...SOURCE_TYPES.map((t) => ({ key: t, label: SOURCE_TYPE_LABEL[t] })),
          ]}
        />

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <ChipGroup<WatchFilter>
            label="İzleme"
            value={watchFilter}
            onChange={setWatchFilter}
            options={[
              { key: "TUMU", label: "Tümü" },
              { key: "izlenen", label: "İzlenen" },
              { key: "izlenmeyen", label: "İzlenmeyen" },
            ]}
          />
          <ChipGroup<Grouping>
            label="Gruplama"
            value={grouping}
            onChange={setGrouping}
            options={[
              { key: "tur", label: "Türe göre" },
              { key: "yok", label: "Tek liste" },
            ]}
          />
        </div>

        {/* Toplu izleme işlemleri — tek istekte gider */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="u-kicker mr-1 text-ink-faint">Toplu işlem</span>
          <button
            type="button"
            className="ayar-btn"
            disabled={bulkBusy || sorted.length === 0}
            onClick={() => void onBulk("filtre", true)}
          >
            Listedekileri İzle
          </button>
          <button
            type="button"
            className="ayar-btn"
            disabled={bulkBusy || sorted.length === 0}
            onClick={() => void onBulk("filtre", false)}
          >
            Listedekileri Bırak
          </button>
          <button
            type="button"
            className="ayar-btn"
            disabled={bulkBusy || sources.length === 0}
            onClick={() => void onBulk("tumu", true)}
          >
            Tümünü İzle
          </button>
          <button
            type="button"
            className="ayar-btn"
            disabled={bulkBusy || sources.length === 0}
            onClick={() => void onBulk("tumu", false)}
          >
            Tümünü Bırak
          </button>
          {bulkBusy ? (
            <span className="u-kicker text-ink-faint">Uygulanıyor…</span>
          ) : null}
        </div>
      </div>

      {/* İzleme değişikliğinin duyurulduğu canlı bölge */}
      <div className="mt-3">
        <Notice kind={toggleMsg?.kind ?? null} message={toggleMsg?.text ?? null} />
      </div>

      {/* Liste */}
      {sorted.length === 0 ? (
        <p className="u-body u-body-soft mt-6 border-t border-rule pt-6 text-center text-[0.9375rem]">
          {sources.length === 0
            ? "Gösterilecek kaynak yok."
            : "Bu filtrelerle eşleşen kaynak yok. Aramayı ya da filtreleri gevşetin."}
        </p>
      ) : (
        <div className="ayar-scroll mt-3">
          <table className="ayar-table">
            <caption className="sr-only-custom">
              Kaynaklar: ad, tür, otorite ağırlığı, haber sayısı ve panelde
              izlenme durumu.
            </caption>
            {header}
            {groups ? (
              groups.map((g) => (
                <tbody key={g.type}>
                  <tr className="ayar-group-row">
                    <th scope="colgroup" colSpan={5}>
                      <span className="u-kicker text-ink">
                        {SOURCE_TYPE_LABEL[g.type]} · {formatNumber(g.rows.length)}
                      </span>
                      <span className="u-body u-body-soft ml-2 text-[0.75rem] font-normal normal-case tracking-normal">
                        {SOURCE_TYPE_HINT[g.type]}
                      </span>
                    </th>
                  </tr>
                  {g.rows.map(row)}
                </tbody>
              ))
            ) : (
              <tbody>{sorted.map(row)}</tbody>
            )}
          </table>
        </div>
      )}

      {/* YENİ KAYNAK FORMU — yalnızca editor/admin.
          Kaynak ekleme sistem GENELİNDE toplanır ve otorite ağırlığı gizli
          önem skorunu herkes için etkiler; backend bu ucu artık rolle
          koruyor. Üye, kaynağı yandaki "Kaynak Öner" ile önerir. */}
      {canEdit ? (
      <div className="mt-8 border-t border-ink pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="u-headline text-[1.0625rem] font-bold">
            Yeni Kaynak Ekle
          </h3>
          <button
            type="button"
            className="ayar-btn"
            aria-expanded={formOpen}
            aria-controls="ayar-kaynak-formu"
            onClick={() => setFormOpen((o) => !o)}
          >
            {formOpen ? "Formu Kapat" : "Formu Aç"}
          </button>
        </div>

        <div id="ayar-kaynak-formu" hidden={!formOpen}>
          <p className="u-body u-body-soft mt-2 text-[0.875rem] leading-snug">
            Eklenen kaynak hemen izlemeye alınır; haberleri bir sonraki toplama
            çalışmasında görünür. Otorite ağırlığı önem skorunun bileşenlerinden
            biridir — resmî gazeteler 100, genel basın 40-70 aralığında tutulur.
          </p>

          <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Kaynak adı *"
                error={errors.name}
                errorId="hata-kaynak-ad"
              >
                <input
                  type="text"
                  className="ayar-input"
                  value={form.name}
                  required
                  maxLength={190}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? "hata-kaynak-ad" : undefined}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Örn. Ticaret Bakanlığı Duyurular"
                />
              </Field>

              <Field
                label="Ana sayfa adresi *"
                error={errors.homepage_url}
                errorId="hata-kaynak-url"
              >
                <input
                  type="url"
                  inputMode="url"
                  className="ayar-input"
                  value={form.homepage_url}
                  required
                  maxLength={500}
                  aria-invalid={Boolean(errors.homepage_url)}
                  aria-describedby={
                    errors.homepage_url ? "hata-kaynak-url" : undefined
                  }
                  onChange={(e) => update("homepage_url", e.target.value)}
                  placeholder="https://www.ornek.gov.tr"
                />
              </Field>

              <Field
                label="Tür *"
                hint={SOURCE_TYPE_HINT[form.source_type]}
              >
                <select
                  className="ayar-select"
                  value={form.source_type}
                  onChange={(e) => update("source_type", e.target.value as SourceType)}
                >
                  {SOURCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {SOURCE_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Otorite ağırlığı (0-100)"
                error={errors.authority_weight}
                errorId="hata-kaynak-agirlik"
              >
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  inputMode="numeric"
                  className="ayar-input"
                  value={form.authority_weight}
                  aria-invalid={Boolean(errors.authority_weight)}
                  aria-describedby={
                    errors.authority_weight ? "hata-kaynak-agirlik" : undefined
                  }
                  onChange={(e) => update("authority_weight", e.target.value)}
                />
              </Field>

              <Field
                label="Ülke kodu"
                hint="İki harf: TR, EU, US…"
                error={errors.country_code}
                errorId="hata-kaynak-ulke"
              >
                <input
                  type="text"
                  className="ayar-input"
                  value={form.country_code}
                  maxLength={2}
                  aria-invalid={Boolean(errors.country_code)}
                  aria-describedby={
                    errors.country_code ? "hata-kaynak-ulke" : undefined
                  }
                  onChange={(e) => update("country_code", e.target.value)}
                />
              </Field>

              <Field
                label="Dil"
                hint="İki harf: tr, en…"
                error={errors.language}
                errorId="hata-kaynak-dil"
              >
                <input
                  type="text"
                  className="ayar-input"
                  value={form.language}
                  maxLength={2}
                  aria-invalid={Boolean(errors.language)}
                  aria-describedby={errors.language ? "hata-kaynak-dil" : undefined}
                  onChange={(e) => update("language", e.target.value)}
                />
              </Field>
            </div>

            <Notice kind={formMsg?.kind ?? null} message={formMsg?.text ?? null} />

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="ayar-btn ayar-btn-primary"
                disabled={submitting}
              >
                {submitting ? "Ekleniyor…" : "Kaynağı Ekle"}
              </button>
              <button
                type="button"
                className="ayar-btn"
                disabled={submitting}
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setErrors({});
                  setFormMsg(null);
                }}
              >
                Formu Temizle
              </button>
            </div>
          </form>
        </div>
      </div>
      ) : (
        <p className="u-body u-body-soft mt-8 border-t border-ink pt-4 text-[0.875rem] leading-snug">
          Yeni kaynak eklemek yönetici yetkisi gerektiriyor, çünkü kaynaklar
          tüm kurumlar için toplanıyor. İzlenmesini istediğiniz bir adresi
          yandaki <strong>Kaynak Öner</strong> bölümünden önerebilirsiniz.
        </p>
      )}
    </div>
  );
}
