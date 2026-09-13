"use client";

/**
 * Yazdırma / PDF düğmesi.
 *
 * PDF çıktısı tarayıcının yazdırma penceresinden alınır (Hedef → "PDF olarak
 * kaydet"). Ayrı bir PDF kütüphanesi yüklemiyoruz: sayfanın @media print
 * kuralları zaten A4 gazete mizanpajı üretiyor, tarayıcının kendi PDF motoru
 * da yazı tiplerini ve sütunları olduğu gibi koruyor.
 *
 * NOT: Bu düğme bir süre boş sayfa üretiyordu. Sebebi buton değil, globals.css
 * içindeki öncelik çakışmasıydı — panel görünümündeyken her iki mizanpaj da
 * gizleniyordu. Ayrıntı için globals.css'teki yazdırma bloğunun yorumuna bakın.
 */

export function PrintButton({
  label = "PDF / Yazdır",
}: {
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      title="Açılan pencerede Hedef olarak “PDF olarak kaydet”i seçin"
      className="u-kicker no-print border border-ink px-3 py-1.5 text-ink transition-colors hover:bg-ink hover:text-paper"
    >
      {label}
    </button>
  );
}
