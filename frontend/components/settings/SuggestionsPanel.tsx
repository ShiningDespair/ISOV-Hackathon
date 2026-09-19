"use client";

/**
 * KAYNAK ÖNER
 *
 * Kaynaklar modülünün yanında duran ayrı bölüm: herkes izlenmesini istediği
 * bir adresi önerebilir, yetkili kişi öneriyi kabul ya da reddeder.
 *
 * Aynı adres ikinci kez önerilirse backend 409 döndürür (uq_source_sug_url);
 * `lib/api.ts` bunu "Bu kaynak zaten önerilmiş." mesajına çevirir.
 *
 * Liste ilk yüklemede sunucu bileşeninden gelir. Bir işlemden sonra listeyi
 * tarayıcıdan tazelemeye çalışırız; `/api` vekili tanımlı değilse tazeleme
 * başarısız olur — bu durumda yerel durum güncellenir ve kullanıcı yine de
 * ne olduğunu görür.
 */

import { useMemo, useState } from "react";

import {
  createSourceSuggestion,
  getSourceSuggestions,
  patchSourceSuggestion,
} from "@/lib/api";
import { formatDateShort } from "@/lib/format";
import {
  SOURCE_TYPES,
  SOURCE_TYPE_LABEL,
  SUGGESTION_STATUSES,
  SUGGESTION_STATUS_LABEL,
  normalizeSuggestionStatus,
  sourceTypeLabel,
  type SourceSuggestion,
  type SourceType,
  type SuggestionStatus,
} from "@/lib/types";

import { ChipGroup, Field, Notice } from "./Parts";

type StatusFilter = SuggestionStatus | "TUMU";

interface FormState {
  name: string;
  url: string;
  reason: string;
  submitted_by: string;
  source_type: SourceType | "";
}

const EMPTY_FORM: FormState = {
  name: "",
  url: "",
  reason: "",
  submitted_by: "",
  source_type: "",
};

function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};

  if (!form.name.trim()) {
    errors.name = "Kaynak adı zorunludur.";
  }

  const url = form.url.trim();
  if (!url) {
    errors.url = "Adres zorunludur.";
  } else {
    let parsed: URL | null = null;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }
    if (!parsed || !/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes(".")) {
      errors.url = "Geçerli bir adres girin; http:// veya https:// ile başlamalı.";
    }
  }

  if (form.reason.trim().length > 2000) {
    errors.reason = "Gerekçe çok uzun.";
  }

  return errors;
}

export function SuggestionsPanel({
  initialSuggestions,
  initialError,
}: {
  initialSuggestions: SourceSuggestion[];
  initialError: string | null;
}) {
  const [items, setItems] = useState<SourceSuggestion[]>(initialSuggestions);
  const [listError, setListError] = useState<string | null>(initialError);
  const [filter, setFilter] = useState<StatusFilter>("TUMU");

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<{
    kind: "basari" | "hata";
    text: string;
  } | null>(null);

  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const [rowMsg, setRowMsg] = useState<{
    kind: "basari" | "hata";
    text: string;
  } | null>(null);

  const counts = useMemo(() => {
    const acc: Record<SuggestionStatus, number> = { beklemede: 0, kabul: 0, red: 0 };
    for (const it of items) acc[normalizeSuggestionStatus(it.status)] += 1;
    return acc;
  }, [items]);

  const visible = useMemo(
    () =>
      filter === "TUMU"
        ? items
        : items.filter((it) => normalizeSuggestionStatus(it.status) === filter),
    [items, filter],
  );

  /** Listeyi tarayıcıdan tazele; başarısız olursa yerel durumu bozmaz. */
  async function refresh(): Promise<boolean> {
    const res = await getSourceSuggestions();
    if (!res.ok) return false;
    setItems(res.data);
    setListError(null);
    return true;
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
    const res = await createSourceSuggestion({
      name: form.name.trim(),
      url: form.url.trim(),
      reason: form.reason.trim() || undefined,
      submitted_by: form.submitted_by.trim() || undefined,
      source_type: form.source_type || undefined,
    });
    setSubmitting(false);

    if (!res.ok) {
      setFormMsg({ kind: "hata", text: res.error });
      return;
    }

    setFormMsg({
      kind: "basari",
      text: "Öneriniz alındı. Değerlendirildikten sonra listeye işlenecek.",
    });
    setForm(EMPTY_FORM);
    setErrors({});

    const refreshed = await refresh();
    if (!refreshed) {
      const created: SourceSuggestion =
        res.data && typeof res.data === "object" && res.data.name
          ? res.data
          : {
              id: -Date.now(),
              name: form.name.trim(),
              url: form.url.trim(),
              reason: form.reason.trim() || null,
              submitted_by: form.submitted_by.trim() || null,
              source_type: form.source_type || null,
              status: "beklemede",
              created_at: new Date().toISOString(),
            };
      setItems((prev) => [created, ...prev]);
    }
  }

  async function onStatus(item: SourceSuggestion, status: SuggestionStatus) {
    setPending((prev) => new Set(prev).add(item.id));
    setRowMsg(null);

    const res = await patchSourceSuggestion(item.id, status);

    setPending((prev) => {
      const copy = new Set(prev);
      copy.delete(item.id);
      return copy;
    });

    if (!res.ok) {
      setRowMsg({
        kind: "hata",
        text: `“${item.name}” önerisinin durumu değiştirilemedi. ${res.error}`,
      });
      return;
    }

    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id
          ? { ...it, status, reviewed_at: new Date().toISOString() }
          : it,
      ),
    );
    setRowMsg({
      kind: "basari",
      text: `“${item.name}” önerisi ${SUGGESTION_STATUS_LABEL[status].toLocaleLowerCase("tr-TR")} olarak işaretlendi.`,
    });
    void refresh();
  }

  return (
    <div>
      <form onSubmit={onSubmit} noValidate className="space-y-3.5">
        <Field label="Kaynak adı *" error={errors.name} errorId="hata-oneri-ad">
          <input
            type="text"
            className="ayar-input"
            value={form.name}
            required
            maxLength={190}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "hata-oneri-ad" : undefined}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Örn. Dünya Gazetesi Sanayi Eki"
          />
        </Field>

        <Field label="Adres *" error={errors.url} errorId="hata-oneri-url">
          <input
            type="url"
            inputMode="url"
            className="ayar-input"
            value={form.url}
            required
            maxLength={500}
            aria-invalid={Boolean(errors.url)}
            aria-describedby={errors.url ? "hata-oneri-url" : undefined}
            onChange={(e) => update("url", e.target.value)}
            placeholder="https://www.ornek.com/sanayi"
          />
        </Field>

        <Field
          label="Neden izlenmeli?"
          hint="İSO/İSOV üyesine ne katacağını bir iki cümleyle anlatın."
          error={errors.reason}
          errorId="hata-oneri-gerekce"
        >
          <textarea
            className="ayar-textarea"
            value={form.reason}
            maxLength={2000}
            aria-invalid={Boolean(errors.reason)}
            aria-describedby={errors.reason ? "hata-oneri-gerekce" : undefined}
            onChange={(e) => update("reason", e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field label="Öneren" hint="Ad ya da e-posta — isteğe bağlı.">
            <input
              type="text"
              className="ayar-input"
              value={form.submitted_by}
              maxLength={190}
              onChange={(e) => update("submitted_by", e.target.value)}
            />
          </Field>

          <Field label="Tür" hint="Bilmiyorsanız boş bırakın.">
            <select
              className="ayar-select"
              value={form.source_type}
              onChange={(e) =>
                update("source_type", e.target.value as SourceType | "")
              }
            >
              <option value="">Belirtilmedi</option>
              {SOURCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SOURCE_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Notice kind={formMsg?.kind ?? null} message={formMsg?.text ?? null} />

        <button
          type="submit"
          className="ayar-btn ayar-btn-primary"
          disabled={submitting}
        >
          {submitting ? "Gönderiliyor…" : "Öneriyi Gönder"}
        </button>
      </form>

      {/* ---- Mevcut öneriler ---- */}
      <div className="mt-7 border-t border-ink pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="u-headline text-[1.0625rem] font-bold">Gelen Öneriler</h3>
          <p className="u-kicker text-ink-faint">
            {counts.beklemede} beklemede · {counts.kabul} kabul · {counts.red} red
          </p>
        </div>

        <div className="mt-3">
          <ChipGroup<StatusFilter>
            label="Durum"
            value={filter}
            onChange={setFilter}
            options={[
              { key: "TUMU", label: "Tümü" },
              ...SUGGESTION_STATUSES.map((s) => ({
                key: s,
                label: SUGGESTION_STATUS_LABEL[s],
              })),
            ]}
          />
        </div>

        <div className="mt-3">
          <Notice kind={rowMsg?.kind ?? null} message={rowMsg?.text ?? null} />
        </div>

        {listError ? (
          <p className="ayar-bildirim mt-3" data-tur="hata">
            Öneri listesi yüklenemedi. {listError}
          </p>
        ) : null}

        {!listError && visible.length === 0 ? (
          <p className="u-body u-body-soft mt-4 text-[0.9375rem]">
            {items.length === 0
              ? "Henüz kaynak önerisi yok. İlk öneriyi yukarıdaki formla siz bırakın."
              : "Bu durumda öneri yok."}
          </p>
        ) : null}

        <ul className="mt-2 divide-y divide-rule">
          {visible.map((item) => {
            const status = normalizeSuggestionStatus(item.status);
            const busy = pending.has(item.id);
            return (
              <li key={item.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="u-headline min-w-0 text-[1rem] font-bold">
                    {item.name}
                  </p>
                  <span className="ayar-durum" data-durum={status}>
                    {SUGGESTION_STATUS_LABEL[status]}
                  </span>
                </div>

                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="u-kicker u-link-underline mt-0.5 block break-all text-ink-faint"
                >
                  {item.url.replace(/^https?:\/\//, "")}
                </a>

                {item.reason ? (
                  <p className="u-body u-body-soft mt-1 text-[0.875rem] leading-snug">
                    {item.reason}
                  </p>
                ) : null}

                <p className="u-kicker mt-1 text-ink-faint">
                  {[
                    item.submitted_by ? `Öneren: ${item.submitted_by}` : null,
                    item.source_type ? sourceTypeLabel(item.source_type) : null,
                    item.created_at ? formatDateShort(item.created_at) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  {SUGGESTION_STATUSES.filter((s) => s !== status).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="ayar-btn"
                      disabled={busy}
                      onClick={() => void onStatus(item, s)}
                    >
                      {busy
                        ? "…"
                        : s === "beklemede"
                          ? "Beklemeye Al"
                          : s === "kabul"
                            ? "Kabul Et"
                            : "Reddet"}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
