"use client";

/**
 * KAYIT SIHIRBAZININ ADIMLARI
 *
 * Her adim SAF SUNUM bilesenidir: durum tutmaz, dogrulama yapmaz, istek
 * atmaz. Durum ve dogrulama `KayitSihirbazi.tsx`'te tek yerde toplu
 * (adim basina ayri state, adimlar arasi tutarsizligin en kestirme yolu).
 *
 * FORM PARCALARI YENIDEN KULLANILIYOR: `components/settings/Parts.tsx`
 * icindeki `Switch` ve `components/auth/PasswordField.tsx` bu dosyada
 * yeniden yazilmadi.
 *
 * SECIM KONTROLLERI NATIF: radio ve checkbox. `aria-pressed` tasiyan
 * dugmelerden farkli olarak ok tuslariyla gezinme, "3 seçenekten 2.'si"
 * duyurusu ve form semantigi bedava gelir.
 */

import { useMemo, useState } from "react";

import { Switch } from "@/components/settings/Parts";
import { PasswordField, TextField } from "@/components/auth/PasswordField";
import { PASSWORD_MIN_LENGTH } from "@/components/auth/password";
import type {
  InterestTag,
  PositionOption,
  SectorOption,
  TimeBudgetOption,
} from "@/lib/types-auth";

/* ------------------------------------------------------------------ */
/* Yardimcilar                                                         */
/* ------------------------------------------------------------------ */

/**
 * Arama icin metin normalizasyonu.
 * "kagit" yazan kullanici "Kâğıt ve kâğıt ürünleri"ni bulabilmeli. NFD ile
 * ayrıştırıp birleşen işaretleri atiyoruz; `ı` harfinin ayrıştırmasi yok,
 * o yuzden onu once elle degistiriyoruz.
 */
export function aramaAnahtari(value: string): string {
  return value
    .toLowerCase()
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Cip bicimli onay kutusu — natif input, gorsel kabuk span. */
function Cip({
  checked,
  onChange,
  label,
  name,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  name?: string;
}) {
  return (
    <label className="otur-cip">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="otur-cip-govde">{label}</span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Hesap                                                            */
/* ------------------------------------------------------------------ */

export function AdimHesap({
  fullName,
  email,
  password,
  onChange,
  errors,
}: {
  fullName: string;
  email: string;
  password: string;
  onChange: (patch: { fullName?: string; email?: string; password?: string }) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-4">
      <p className="u-body u-body-soft text-[0.9375rem] leading-snug">
        Üç alan. Kurum, pozisyon ve ilgi alanlarını sonraki adımlarda
        soracağız; hepsinin hazır bir varsayılanı var.
      </p>
      <TextField
        label="Ad ve soyad"
        value={fullName}
        onChange={(v) => onChange({ fullName: v })}
        autoComplete="name"
        error={errors.fullName}
        autoFocus
      />
      <TextField
        label="E-posta"
        type="email"
        inputMode="email"
        value={email}
        onChange={(v) => onChange({ email: v })}
        autoComplete="email"
        error={errors.email}
        hint="Giriş yaparken bu adresi kullanacaksınız."
        placeholder="ad.soyad@kurum.com.tr"
      />
      <PasswordField
        label="Şifre"
        value={password}
        onChange={(v) => onChange({ password: v })}
        autoComplete="new-password"
        error={errors.password}
        hint={`En az ${PASSWORD_MIN_LENGTH} karakter, en az bir harf ve bir rakam. Özel karakter zorunlu değil.`}
        showStrength
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Pozisyon                                                         */
/* ------------------------------------------------------------------ */

export function AdimPozisyon({
  positions,
  value,
  onChange,
}: {
  positions: PositionOption[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div>
      <p className="u-body u-body-soft text-[0.9375rem] leading-snug">
        Pozisyon iki şeyi belirler: panelin düzeni ve hangi konuların üste
        çıkacağı. Sonradan ayarlardan değiştirebilirsiniz.
      </p>
      {/* Natif radio grubu + fieldset/legend. `role="radiogroup"` tasiyan bir
          <ul> listeyi de eziyor (li'ler listitem rolunu kaybediyor); fieldset
          hem grubu adlandirir hem liste semantigini bozmaz. */}
      <fieldset className="otur-grup mt-3">
      <legend className="sr-only">Pozisyonunuz</legend>
      <ul className="otur-liste">
        {positions.map((p) => (
          <li key={p.code}>
            <label className="otur-secenek">
              <input
                type="radio"
                name="otur-pozisyon"
                value={p.code}
                checked={value === p.code}
                onChange={() => onChange(p.code)}
              />
              <span className="otur-secenek-govde">
                <span className="otur-secenek-ad">{p.label}</span>
                {p.layoutLabel ? (
                  <span className="otur-secenek-not">
                    Panel düzeni: {p.layoutLabel}
                  </span>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      </fieldset>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Sektor                                                           */
/* ------------------------------------------------------------------ */

export function AdimSektor({
  sectors,
  primary,
  secondary,
  onPrimary,
  onSecondary,
  errors,
  maxSecondary = 3,
}: {
  sectors: SectorOption[];
  primary: string;
  secondary: string[];
  onPrimary: (code: string) => void;
  onSecondary: (codes: string[]) => void;
  errors: Record<string, string>;
  maxSecondary?: number;
}) {
  const [q, setQ] = useState("");
  const [uyari, setUyari] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const key = aramaAnahtari(q);
    if (!key) return sectors;
    const parts = key.split(" ").filter(Boolean);
    return sectors.filter((s) => {
      const hay = `${aramaAnahtari(s.label)} ${aramaAnahtari(s.code)} ${aramaAnahtari(s.group ?? "")}`;
      return parts.every((p) => hay.includes(p));
    });
  }, [q, sectors]);

  function toggleSecondary(code: string, next: boolean) {
    setUyari(null);
    if (next) {
      if (code === primary) {
        setUyari("Birincil sektörünüzü ikincil olarak da seçmeniz gerekmez.");
        return;
      }
      if (secondary.length >= maxSecondary) {
        setUyari(
          `En çok ${maxSecondary} ikincil sektör seçebilirsiniz. Önce birini kaldırın.`,
        );
        return;
      }
      onSecondary([...secondary, code]);
      return;
    }
    onSecondary(secondary.filter((c) => c !== code));
  }

  return (
    <div>
      <p className="u-body u-body-soft text-[0.9375rem] leading-snug">
        Bir birincil sektör zorunlu, en çok {maxSecondary} ikincil sektör
        seçebilirsiniz. Sektör eşleşmesi haberleri <strong>sıralar,
        filtrelemez</strong>: eşleşmeyen haberler de listede kalır.
      </p>

      <div className="mt-3">
        <label htmlFor="otur-sektor-ara" className="u-kicker block text-ink">
          Sektör ara
        </label>
        <input
          id="otur-sektor-ara"
          type="search"
          className="ayar-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="makine, tekstil, kâğıt, C24…"
          autoComplete="off"
        />
        <p className="u-kicker mt-1 text-ink-faint" aria-live="polite">
          {filtered.length} / {sectors.length} sektör listeleniyor
        </p>
      </div>

      <div aria-live="polite">
        {uyari ? <p className="ayar-error">{uyari}</p> : null}
        {errors.sectorPrimary ? <p className="ayar-error">{errors.sectorPrimary}</p> : null}
      </div>

      <ul className="otur-liste mt-2">
        {filtered.map((s) => {
          const isSecondary = secondary.includes(s.code);
          return (
            <li key={s.code} className="otur-sektor" data-birincil={primary === s.code ? "1" : "0"}>
              <span className="otur-sektor-kod" aria-hidden="true">
                {s.code}
              </span>
              <span className="otur-sektor-ad">{s.label}</span>
              <span className="otur-sektor-secim">
                <label className="otur-onay">
                  <input
                    type="radio"
                    name="otur-sektor-birincil"
                    checked={primary === s.code}
                    onChange={() => onPrimary(s.code)}
                    aria-label={`${s.label} — birincil sektör`}
                  />
                  <span>Birincil</span>
                </label>
                <label className="otur-onay">
                  <input
                    type="checkbox"
                    checked={isSecondary}
                    onChange={(e) => toggleSecondary(s.code, e.target.checked)}
                    aria-label={`${s.label} — ikincil sektör`}
                  />
                  <span>İkincil</span>
                </label>
              </span>
            </li>
          );
        })}
      </ul>
      {filtered.length === 0 ? (
        <p className="u-body u-body-soft mt-2 text-[0.875rem]">
          Aramanıza uyan sektör yok. Aramayı temizleyip listeye göz atabilirsiniz.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Ilgi alanlari                                                    */
/* ------------------------------------------------------------------ */

export function AdimIlgi({
  interests,
  selected,
  onChange,
  maxSelection = 12,
  positionLabel,
}: {
  interests: InterestTag[];
  selected: string[];
  onChange: (next: string[]) => void;
  maxSelection?: number;
  positionLabel: string;
}) {
  const [uyari, setUyari] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, InterestTag[]>();
    for (const t of interests) {
      const g = t.group || "Diğer";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(t);
    }
    return [...map.entries()];
  }, [interests]);

  function toggle(slug: string, next: boolean) {
    setUyari(null);
    if (next) {
      if (selected.length >= maxSelection) {
        setUyari(
          `En çok ${maxSelection} ilgi alanı seçebilirsiniz. Önce birini kaldırın.`,
        );
        return;
      }
      onChange([...selected, slug]);
      return;
    }
    onChange(selected.filter((s) => s !== slug));
  }

  return (
    <div>
      <p className="u-body u-body-soft text-[0.9375rem] leading-snug">
        <strong>{positionLabel}</strong> pozisyonu için sık takip edilen
        başlıklar önceden işaretlendi — şu anda {selected.length} seçim var.
        Dilediğinizi kaldırıp yerine başkasını ekleyebilirsiniz; en çok{" "}
        {maxSelection} seçim.
      </p>

      <div aria-live="polite" className="mt-1">
        {uyari ? <p className="ayar-error">{uyari}</p> : null}
      </div>

      <div className="mt-3 space-y-4">
        {groups.map(([group, tags]) => (
          <fieldset key={group} className="otur-grup">
            <legend className="u-kicker text-ink-soft">{group}</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <Cip
                  key={t.slug}
                  label={t.label}
                  checked={selected.includes(t.slug)}
                  onChange={(next) => toggle(t.slug, next)}
                />
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <p className="u-kicker mt-3 text-ink-faint" aria-live="polite">
        {selected.length} / {maxSelection} seçili
      </p>
      {selected.length === 0 ? (
        <p className="u-body u-body-soft text-[0.875rem] leading-snug">
          Hiç seçim yapmazsanız sıralama yalnızca pozisyon ve sektörünüzle
          şekillenir — panel yine dolu gelir.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Vakit                                                            */
/* ------------------------------------------------------------------ */

export function AdimVakit({
  options,
  value,
  onChange,
}: {
  options: TimeBudgetOption[];
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div>
      <p className="u-body u-body-soft text-[0.9375rem] leading-snug">
        Bu seçim haber sayısını ve özet uzunluğunu belirler. Sayılar okuma
        süresi aritmetiğinden geliyor (Türkçe akıcı okuma yaklaşık 200
        kelime/dakika).
      </p>
      <fieldset className="otur-grup mt-3">
      <legend className="sr-only">Günlük vaktiniz</legend>
      <ul className="otur-liste">
        {options.map((o) => (
          <li key={o.minutes}>
            <label className="otur-secenek">
              <input
                type="radio"
                name="otur-vakit"
                checked={value === o.minutes}
                onChange={() => onChange(o.minutes)}
              />
              <span className="otur-secenek-govde">
                <span className="otur-secenek-ad">{o.label}</span>
                {o.detail ? <span className="otur-secenek-not">{o.detail}</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      </fieldset>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6. Bulten                                                           */
/* ------------------------------------------------------------------ */

const SAATLER = Array.from({ length: 24 }, (_, i) => i);

export function AdimBulten({
  subscribed,
  frequency,
  sendHour,
  onChange,
}: {
  subscribed: boolean;
  frequency: "gunluk" | "haftalik";
  sendHour: number;
  onChange: (patch: {
    subscribed?: boolean;
    frequency?: "gunluk" | "haftalik";
    sendHour?: number;
  }) => void;
}) {
  return (
    <div>
      <p className="u-body u-body-soft text-[0.9375rem] leading-snug">
        Bülten, panelinizdeki sıralamanın e-posta kopyasıdır. Kapalı
        bırakabilirsiniz; panel her durumda çalışır.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3">
        <span className="u-body text-[0.9375rem]">E-posta bülteni</span>
        <Switch
          checked={subscribed}
          onChange={(next) => onChange({ subscribed: next })}
          label="E-posta bülteni aboneliği"
          onLabel="Açık"
          offLabel="Kapalı"
        />
      </div>

      <fieldset className="mt-4 border-t border-rule pt-3" disabled={!subscribed}>
        <legend className="u-kicker text-ink">Sıklık</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(
            [
              { key: "gunluk" as const, label: "Her gün", note: "Her sabah bir derleme" },
              { key: "haftalik" as const, label: "Haftada bir", note: "Pazartesi sabahı toplu derleme" },
            ]
          ).map((o) => (
            <label key={o.key} className="otur-secenek otur-secenek-sik">
              <input
                type="radio"
                name="otur-bulten-siklik"
                checked={frequency === o.key}
                onChange={() => onChange({ frequency: o.key })}
              />
              <span className="otur-secenek-govde">
                <span className="otur-secenek-ad">{o.label}</span>
                <span className="otur-secenek-not">{o.note}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="mt-4 max-w-[12rem]">
          <label htmlFor="otur-bulten-saat" className="u-kicker block text-ink">
            Gönderim saati
          </label>
          <select
            id="otur-bulten-saat"
            className="ayar-select"
            value={sendHour}
            onChange={(e) => onChange({ sendHour: Number(e.target.value) })}
          >
            {SAATLER.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}.00
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <p className="ayar-uyari u-body mt-4">
        <strong>Dürüstlük notu:</strong> bülten gönderimi henüz yayında değil.
        Tercihiniz kaydedilir ve gönderim açıldığında uygulanır — şu an size
        e-posta gitmeyecek.
      </p>
    </div>
  );
}
