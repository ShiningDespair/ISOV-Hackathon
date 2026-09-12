/** Yükleniyor durumu — gazete tonunda sade iskelet. */

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-16 sm:px-6">
      <p className="u-kicker text-center text-ink-faint">Bülten hazırlanıyor…</p>
      <div className="mx-auto mt-4 w-24 border-t border-ink" />
    </div>
  );
}
