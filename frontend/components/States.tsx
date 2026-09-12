/**
 * Hata ve boş durum bileşenleri.
 * Backend demo sırasında geç ayağa kalkabilir — sayfa çökmemeli,
 * temiz bir "Veri kaynağına ulaşılamadı" mesajı görünmeli.
 */

export function DataUnavailable({
  message = "Veri kaynağına ulaşılamadı.",
  hint = "Toplama servisi henüz yanıt vermiyor olabilir. Sayfayı birazdan yenileyin.",
}: {
  message?: string;
  hint?: string;
}) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="mx-auto my-10 max-w-xl border border-rule bg-surface px-6 py-10 text-center"
    >
      <p className="u-kicker u-kicker-accent">Bağlantı Durumu</p>
      <h2 className="u-headline u-headline-md mt-3">{message}</h2>
      <p className="u-body u-body-soft mt-3 text-[0.95rem]">{hint}</p>
      <div className="mx-auto mt-6 w-16 border-t border-ink" />
    </section>
  );
}

export function EmptyState({
  title = "Sonuç bulunamadı",
  hint = "Filtreleri gevşetmeyi ya da arama teriminizi değiştirmeyi deneyin.",
}: {
  title?: string;
  hint?: string;
}) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="my-10 border-t border-rule py-12 text-center"
    >
      <p className="u-kicker">Bülten</p>
      <h2 className="u-headline u-headline-md mt-2">{title}</h2>
      <p className="u-body u-body-soft mt-2 text-[0.95rem]">{hint}</p>
    </section>
  );
}

/** Bölüm başlığı — kural çizgisiyle birlikte. */
export function SectionRule({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4 border-b border-ink pb-1">
      <h2 className="u-kicker text-ink">{title}</h2>
      {right ? <div className="u-kicker text-ink-faint">{right}</div> : null}
    </div>
  );
}
