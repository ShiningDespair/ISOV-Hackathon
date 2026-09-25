"use client";

/**
 * Yüzen erişilebilirlik düğmesi ve paneli.
 * Denetimlerin kendisi A11yControls'te; burada yalnızca kabuk var — aynı
 * denetimler /ayarlar sayfasında da görünür ve ikisi aynı bağlamı paylaşır.
 *
 * Klavye: Escape kapatır, açılışta ilk odak panele taşınır, panel açıkken
 * odak dışına tıklamak kapatır.
 */

import { useEffect, useRef, useState } from "react";
import { A11yControls } from "./A11yControls";
import { useA11y } from "./A11yProvider";

export function A11yWidget() {
  const [open, setOpen] = useState(false);
  const { changedCount } = useA11y();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Escape ile kapat + dışına tıklayınca kapat
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <div className="a11y-widget no-print">
      {open ? (
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="false"
          aria-label="Erişilebilirlik ayarları"
          className="a11y-widget-panel"
        >
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="u-headline text-lg font-bold">Erişilebilirlik</h2>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                buttonRef.current?.focus();
              }}
              className="erisim-hedef u-kicker text-ink-soft hover:text-accent"
              aria-label="Paneli kapat"
            >
              Kapat ✕
            </button>
          </div>
          <A11yControls compact />
          <p className="u-body u-body-soft mt-3 border-t border-rule pt-2 text-[0.8125rem] leading-snug">
            Bu ayarlar yalnızca bu tarayıcıda saklanır ve{" "}
            <a href="/ayarlar" className="u-link-underline">
              Ayarlar
            </a>{" "}
            sayfasından da değiştirilebilir.
          </p>
        </div>
      ) : null}

      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={
          changedCount > 0
            ? `Erişilebilirlik ayarları — ${changedCount} ayar etkin`
            : "Erişilebilirlik ayarları"
        }
        className="a11y-widget-button"
      >
        {/* Evrensel erişim simgesi — metin etiketi aria-label'da */}
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="10.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="6.6" r="1.45" fill="currentColor" />
          <path
            d="M6.6 9.5h10.8M12 9.9v4.1m0 0-2.4 5.2m2.4-5.2 2.4 5.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        {changedCount > 0 ? <span className="a11y-widget-dot" aria-hidden="true" /> : null}
      </button>
    </div>
  );
}
