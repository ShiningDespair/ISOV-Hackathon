"use client";

/** Yazdırma düğmesi — gazete nüshasını A4 olarak bastırır. */

export function PrintButton({ label = "Bu Nüshayı Yazdır" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="u-kicker no-print border border-ink px-3 py-1.5 text-ink transition-colors hover:bg-ink hover:text-paper"
    >
      {label}
    </button>
  );
}
