/**
 * Dört mizanpajı da DOM'a basan yuvalar.
 * Görünürlüğü globals.css içindeki html[data-view] kuralları belirler; böylece
 * doğru mizanpaj ilk boyamada görünür ve hidrasyon sıçraması olmaz.
 */

import type { ReactNode } from "react";

export function PanelView({ children }: { children: ReactNode }) {
  return <div data-view-slot="panel">{children}</div>;
}

export function NewspaperView({ children }: { children: ReactNode }) {
  return <div data-view-slot="gazete">{children}</div>;
}

/** Ana tasarım + haber görselleri. */
export function VisualView({ children }: { children: ReactNode }) {
  return <div data-view-slot="gorsel">{children}</div>;
}

/** Az metin, yalnızca konu özetleri. */
export function DigestView({ children }: { children: ReactNode }) {
  return <div data-view-slot="kart">{children}</div>;
}
