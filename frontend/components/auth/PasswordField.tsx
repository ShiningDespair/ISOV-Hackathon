"use client";

/**
 * SIFRE ALANI — etiket, gizle/goster dugmesi ve guc gostergesi.
 *
 * ERISILEBILIRLIK KARARLARI:
 *  - `<label htmlFor>` kullaniliyor (girdiyi saran etiket DEGIL): gizle/goster
 *    dugmesi etiketin ICINDE olsa dugmeye her tikta odak girdiye kacar.
 *  - Guc gostergesi renkle DEGIL, once METINLE anlatilir ("Orta"); cubuklar
 *    `aria-hidden`. Renk koru kullanici da durumu okur.
 *  - Guc gostergesi `aria-live` TASIMAZ: her tus vurusunda duyuru yapmak
 *    ekran okuyucuyu bogar. Form duzeyindeki canli bolge hatayi duyurur.
 */

import { useId, useState } from "react";

import { passwordStrength, PASSWORD_MIN_LENGTH } from "./password";

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete = "new-password",
  hint,
  error,
  showStrength = false,
  autoFocus = false,
  name,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  autoComplete?: string;
  hint?: string;
  error?: string | null;
  showStrength?: boolean;
  autoFocus?: boolean;
  name?: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const strength = passwordStrength(value);
  const hintId = `${id}-ipucu`;
  const errorId = `${id}-hata`;
  const strengthId = `${id}-guc`;

  const describedBy = [hint ? hintId : null, error ? errorId : null, showStrength && value ? strengthId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="ayar-field">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="u-kicker block text-ink">
          {label}
        </label>
        <button
          type="button"
          className="otur-mini-btn"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
        >
          {visible ? "Şifreyi gizle" : "Şifreyi göster"}
        </button>
      </div>
      {hint ? (
        <span id={hintId} className="u-body u-body-soft block text-[0.75rem] leading-snug">
          {hint}
        </span>
      ) : null}
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        className="ayar-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        minLength={PASSWORD_MIN_LENGTH}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        spellCheck={false}
      />

      {showStrength && value ? (
        <p id={strengthId} className="otur-guc">
          <span className="otur-guc-cubuk" aria-hidden="true">
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className="otur-guc-parca" data-dolu={strength.score >= n ? "1" : "0"} />
            ))}
          </span>
          <span className="otur-guc-metin">
            Şifre gücü: <strong>{strength.label}</strong>
            {strength.advice ? <span className="otur-guc-ipucu"> {strength.advice}</span> : null}
          </span>
        </p>
      ) : null}

      {error ? (
        <p id={errorId} className="ayar-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Duz metin alani — e-posta / ad soyad icin. Ayni etiketleme deseni. */
export function TextField({
  label,
  value,
  onChange,
  type = "text",
  hint,
  error,
  autoComplete,
  autoFocus = false,
  placeholder,
  name,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  type?: "text" | "email";
  hint?: string;
  error?: string | null;
  autoComplete?: string;
  autoFocus?: boolean;
  placeholder?: string;
  name?: string;
  inputMode?: "email" | "text";
}) {
  const id = useId();
  const hintId = `${id}-ipucu`;
  const errorId = `${id}-hata`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className="ayar-field">
      <label htmlFor={id} className="u-kicker block text-ink">
        {label}
      </label>
      {hint ? (
        <span id={hintId} className="u-body u-body-soft block text-[0.75rem] leading-snug">
          {hint}
        </span>
      ) : null}
      <input
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        className="ayar-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        spellCheck={false}
      />
      {error ? (
        <p id={errorId} className="ayar-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
