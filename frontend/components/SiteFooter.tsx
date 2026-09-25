/** Sayfa altı künyesi. */

import Link from "next/link";
import { DataFreshness } from "./DataFreshness";

export function SiteFooter() {
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
              içerik.
              {/* Eskiden "Son güncelleme: {bugün}" yazıyordu — veri 13 gündür
                  güncellenmemişken (Selin P0-1). Artık en yeni haberin
                  tarihi; bilinmiyorsa hiçbir tarih basılmaz. */}
              <DataFreshness variant="sentence" />
            </p>
          </div>
          {/* ÜST BARDAN KALKAN BAĞLANTILARIN İKİNCİ EVİ
              (docs/SADELESTIRME.md §2). Üst bar üç bağlantıya indi; burada
              hiçbir bölüme erişim tamamen kaybolmasın diye /ayarlar ve
              /durum en az bir yerden daha açık tutuluyor (ikisi ayrıca
              Hesabım menüsünde). Etiketler bağlantısı DOĞRUDAN
              yeni adrese (/istatistik#etiketler) gidiyor: eski /etiketler
              yolu 308 ile yine çalışıyor, ama kendi arayüzümüzden fazladan
              bir yönlendirme sıçraması geçirmenin gerekçesi yok. */}
          <nav aria-label="Alt gezinti">
            <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
              <li>
                <Link href="/" className="u-kicker u-link-underline">
                  Bülten
                </Link>
              </li>
              <li>
                <Link
                  href="/istatistik#etiketler"
                  className="u-kicker u-link-underline"
                >
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
              <li>
                <Link href="/ayarlar" className="u-kicker u-link-underline">
                  Ayarlar
                </Link>
              </li>
              {/* Oturumsuz da açık: hangi özelliğin çalıştığını görmek için
                  giriş yapmak gerekmesin.

                  Etiket "Durum" değil "Özellik Durumu": üst bardan kalkan
                  bağlantı Hesabım menüsünde de bu adla duruyor, iki yerde
                  iki ad aynı sayfayı iki ayrı şey gibi gösterirdi. */}
              <li>
                <Link href="/durum" className="u-kicker u-link-underline">
                  Özellik Durumu
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
