"use client";

/**
 * Okuma cetveli — imleç hizasında yatay kılavuz şerit.
 * Satır takibini kolaylaştırır; disleksi ve dikkat güçlüğü olan kullanıcılar
 * için yaygın bir yardımcı. Yalnızca ayar açıkken dinleyici bağlanır, kapalıyken
 * hiçbir pointer olayı işlenmez.
 */

import { useEffect, useState } from "react";
import { useA11y } from "./A11yProvider";

export function ReadingRuler() {
  const { settings } = useA11y();
  const [y, setY] = useState<number | null>(null);

  useEffect(() => {
    if (!settings.readingRuler) {
      setY(null);
      return;
    }
    const onMove = (e: PointerEvent) => setY(e.clientY);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [settings.readingRuler]);

  if (!settings.readingRuler || y === null) return null;

  return (
    <div
      className="a11y-ruler"
      aria-hidden="true"
      style={{ top: `calc(${y}px - 1.1rem)` }}
    />
  );
}
