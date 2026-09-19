"use client";

/**
 * Görünüm varyantı seçimi.
 *
 * Üst bardaki `ViewSwitch` ile AYNI bağlamı (`useView`) kullanır, bu yüzden
 * iki denetim her zaman senkrondur — burada seçilen varyant anında üst barda
 * da işaretli görünür. Ad ve açıklamalar `ViewProvider`'daki `VIEW_LABELS`
 * tek kaynağından gelir; burada elle yazılmaz.
 */

import { useView, VIEW_LABELS, VIEW_MODES } from "../ViewProvider";

export function ViewPreferences() {
  const { view, setView, ready } = useView();

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Görünüm varyantı"
        className="grid grid-cols-1 gap-0 sm:grid-cols-2"
      >
        {VIEW_MODES.map((mode) => {
          const selected = view === mode;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setView(mode)}
              className="border-t border-rule px-0 py-3 text-left first:border-t-0 sm:border-t sm:px-4 sm:first:border-t"
            >
              <span className="flex items-baseline gap-2">
                {/* Seçim işareti: renk tek gösterge olmasın */}
                <span
                  aria-hidden="true"
                  className="u-kicker w-4 shrink-0 text-accent"
                >
                  {selected ? "■" : "□"}
                </span>
                <span>
                  <span className="u-headline block text-[1.0625rem] font-bold">
                    {VIEW_LABELS[mode].label}
                  </span>
                  <span className="u-body u-body-soft block text-[0.875rem] leading-snug">
                    {VIEW_LABELS[mode].hint}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="u-body u-body-soft mt-4 border-t border-rule pt-3 text-[0.8125rem] leading-snug">
        Seçim bu tarayıcıda saklanır ve üst bardaki görünüm anahtarıyla
        aynıdır; birinden değiştirmek diğerini de günceller.
        {ready ? "" : " Tercih yükleniyor…"}
      </p>
    </div>
  );
}
