/**
 * İki mizanpajı da DOM'a basan yuvalar.
 * Görünürlüğü globals.css içindeki html[data-view] kuralları belirler.
 */

import type { ReactNode } from "react";

export function PanelView({ children }: { children: ReactNode }) {
  return <div data-view-slot="panel">{children}</div>;
}

export function NewspaperView({ children }: { children: ReactNode }) {
  return <div data-view-slot="gazete">{children}</div>;
}
