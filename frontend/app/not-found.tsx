/** 404 — bulunamayan sayfa. */

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6">
      <section className="mx-auto my-16 max-w-xl border-y-[3px] border-double border-ink py-12 text-center">
        <p className="u-kicker u-kicker-accent">Hata 404</p>
        <h1 className="u-headline u-headline-lg mt-2">Sayfa bulunamadı</h1>
        <p className="u-body u-body-soft mt-3">
          Aradığınız nüsha arşivde yok ya da adres değişmiş olabilir.
        </p>
        <Link
          href="/"
          className="u-kicker mt-6 inline-block border border-ink px-4 py-2 transition-colors hover:bg-ink hover:text-paper"
        >
          Bültene Dön
        </Link>
      </section>
    </div>
  );
}
