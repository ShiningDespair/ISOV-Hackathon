"use client";

/**
 * Üst bardaki görünüm anahtarı — dört varyant.
 * Aynı seçim /ayarlar sayfasından da yapılabilir; ikisi de useView() ile
 * aynı bağlamı kullandığı için senkron kalır.
 */

import { useView } from "./ViewProvider";
import { VIEW_LABELS, VIEW_MODES } from "./ViewProvider";

export function ViewSwitch({ className = "" }: { className?: string }) {
  const { view, setView } = useView();

  return (
    <div
      className={`view-switch ${className}`}
      role="group"
      aria-label="Görünüm seçimi"
    >
      {VIEW_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={view === mode}
          title={VIEW_LABELS[mode].hint}
          onClick={() => setView(mode)}
        >
          {VIEW_LABELS[mode].label}
        </button>
      ))}
    </div>
  );
}
