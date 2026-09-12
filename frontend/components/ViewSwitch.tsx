"use client";

/** Üst bardaki Panel ↔ Gazete anahtarı. */

import { useView } from "./ViewProvider";

export function ViewSwitch({ className = "" }: { className?: string }) {
  const { view, setView } = useView();

  return (
    <div
      className={`view-switch ${className}`}
      role="group"
      aria-label="Görünüm seçimi"
    >
      <button
        type="button"
        aria-pressed={view === "panel"}
        onClick={() => setView("panel")}
      >
        Panel
      </button>
      <button
        type="button"
        aria-pressed={view === "gazete"}
        onClick={() => setView("gazete")}
      >
        Gazete
      </button>
    </div>
  );
}
