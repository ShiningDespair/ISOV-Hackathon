"use client";

/** Beklenmeyen hata sınırı — sayfa çökmesin, temiz durum gösterilsin. */

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Demo ortamında konsola düşsün; kullanıcıya teknik ayrıntı gösterilmez.
    console.error("Sayfa hatası:", error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6">
      <section className="mx-auto my-16 max-w-xl border-y-[3px] border-double border-ink py-12 text-center">
        <p className="u-kicker u-kicker-accent">Beklenmeyen Durum</p>
        <h1 className="u-headline u-headline-lg mt-2">
          İçerik şu anda gösterilemiyor
        </h1>
        <p className="u-body u-body-soft mt-3">
          Veri kaynağına ulaşılamadı ya da yanıt beklenen biçimde değil.
          Birazdan yeniden deneyebilirsiniz.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="u-kicker border border-ink px-4 py-2 transition-colors hover:bg-ink hover:text-paper"
          >
            Yeniden Dene
          </button>
          <Link
            href="/"
            className="u-kicker border border-rule px-4 py-2 transition-colors hover:border-ink"
          >
            Bültene Dön
          </Link>
        </div>
      </section>
    </div>
  );
}
