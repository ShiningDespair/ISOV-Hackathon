/** Sayfa altı künyesi. */

import Link from "next/link";
import { formatMasthead } from "@/lib/format";

export function SiteFooter() {
  const now = new Date().toISOString();

  return (
    <footer className="print-hidden mt-12 border-t border-ink">
      <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6">
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <p className="u-kicker text-ink">
              İstanbul Sanayi Odası · İSOV Dış Kaynak İzleme ve Özet Botu
            </p>
            <p className="u-body u-body-soft mt-1 text-[0.8125rem]">
              Açık kaynaklardan otomatik toplanan, tekilleştirilen ve özetlenen
              içerik. Son güncelleme: {formatMasthead(now)}.
            </p>
          </div>
          <nav aria-label="Alt gezinti">
            <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
              <li>
                <Link href="/" className="u-kicker u-link-underline">
                  Bülten
                </Link>
              </li>
              <li>
                <Link href="/etiketler" className="u-kicker u-link-underline">
                  Etiketler
                </Link>
              </li>
              <li>
                <Link href="/raporlar" className="u-kicker u-link-underline">
                  Raporlar
                </Link>
              </li>
              <li>
                <Link href="/istatistik" className="u-kicker u-link-underline">
                  İstatistik
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
