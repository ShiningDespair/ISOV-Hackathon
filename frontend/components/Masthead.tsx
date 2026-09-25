/**
 * NYT tarzı üst bar / künye.
 * Solda tarih + sayı no, ortada büyük serif masthead, sağda "Hesabım"
 * menüsü ve görünüm anahtarı. Altında tek bir kalın kural çizgisi,
 * bölüm gezintisi ve bir ince kural.
 *
 * SADELEŞTİRME (docs/SADELESTIRME.md §2): gezinti 8 bağlantıdan 3'e indi.
 * Taşınanlar: /panelim -> "/" içindeki anahtar, /degisiklikler -> /raporlar,
 * /etiketler -> /istatistik, /ayarlar + /admin + /durum -> Hesabım menüsü.
 * Eski yollar yaşamaya devam eder (redirect), yani paylaşılmış bağlantı
 * 404 vermez.
 *
 * TİPOGRAFİK KARAR — çift kural tek kurala indi: ekran künyesinde üç ayrı
 * kural çizgisi vardı (çift kural + gezinti altı ince kural). NYT'nin çift
 * kuralı BASILI sayfanın imzası; o yüzden `NewspaperMasthead` içinde
 * (gazete görünümü ve yazdırma) AYNEN KORUNDU. Ekranda tek kalın kural +
 * gezinti altı ince kural kaldı: iki hairline yerine bir, serif masthead
 * ve kicker karakteri bozulmadan.
 */

import Link from "next/link";
import { formatMasthead, issueNumber } from "@/lib/format";
import { ViewSwitch } from "./ViewSwitch";
import { AccountMenu } from "./AccountMenu";
import { SectionNav, type NavItem } from "./SectionNav";

/**
 * Bölüm gezintisi — üç bölüm.
 *
 * Oturum gerektiren bölümler gizlenmiyor: middleware çerezsiz isteği
 * /giris'e yönlendiriyor ve bağlantıyı gizlemek, kullanıcının özelliğin
 * varlığını hiç öğrenmemesine yol açardı.
 *
 * "Yönetim" artık burada DEĞİL — Hesabım menüsünde ve yalnızca admin
 * için basılıyor (components/AccountMenu.tsx).
 */
const NAV: readonly NavItem[] = [
  { href: "/", label: "Bülten" },
  { href: "/raporlar", label: "Raporlar" },
  { href: "/istatistik", label: "İstatistik" },
];

export function Masthead() {
  const now = new Date();

  return (
    <header className="bg-paper print-hidden">
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6">
        {/* Üst satır: tarih · masthead · hesap + görünüm anahtarı.
            Üç kolonlu ızgara korunuyor; sağ kolon artık iki denetim
            taşıdığı için kendi `hesap-arac` sarmalayıcısında. */}
        <div className="grid grid-cols-1 items-center gap-3 py-3 sm:grid-cols-[1fr_auto_1fr] sm:py-4">
          <div className="u-kicker order-2 hidden text-ink-faint sm:order-1 sm:block">
            <time dateTime={now.toISOString()}>{formatMasthead(now.toISOString())}</time>
            <span aria-hidden="true"> · </span>
            <span>Sayı No {issueNumber(now)}</span>
          </div>

          <div className="order-1 text-center sm:order-2">
            <Link href="/" aria-label="Ana sayfa">
              <p className="u-headline font-black tracking-[0.01em] text-[clamp(1.15rem,3.4vw,2.15rem)] leading-none uppercase">
                İSO <span className="text-ink-faint">·</span> İSOV
              </p>
              <div className="u-kicker mt-1 text-ink">
                Dış Kaynak İzleme
              </div>
            </Link>
          </div>

          <div className="hesap-arac order-3">
            <AccountMenu />
            <ViewSwitch />
          </div>
        </div>

        {/* Tek kalın kural — masthead ile gezintiyi ayıran ana çizgi */}
        <div className="border-t border-ink" />

        <SectionNav items={NAV} />

        <div className="border-t border-rule" />
      </div>
    </header>
  );
}

/**
 * Gazete görünümü künyesi — basılı sayfa başlığı.
 * Yazdırmada da görünür (print-hidden yok).
 */
export function NewspaperMasthead({
  subtitle = "Açık Kaynak İstihbarat Bülteni",
  date,
}: {
  subtitle?: string;
  date?: string | null;
}) {
  const now = new Date();
  const stamp = date ?? now.toISOString();

  return (
    <header className="mb-5 text-center">
      <div className="newspaper-folio flex flex-wrap items-center justify-between gap-2 border-b border-ink pb-1">
        <span>İstanbul Sanayi Odası · İSOV</span>
        <span className="hidden sm:inline">Sayı No {issueNumber(now)}</span>
        <span>Fiyatı Yoktur</span>
      </div>

      <h1 className="u-headline mt-3 text-[clamp(1.8rem,7vw,4.5rem)] font-black uppercase leading-[0.92] tracking-[0.005em]">
        İSO · İSOV Dış Kaynak İzleme
      </h1>

      <div className="mt-2 border-t border-ink" />
      <div className="mt-[2px] border-t border-ink" />

      <div className="newspaper-folio flex flex-wrap items-center justify-between gap-2 py-1.5">
        <time dateTime={stamp}>{formatMasthead(stamp)}</time>
        <span className="hidden font-normal normal-case tracking-normal sm:inline">
          {subtitle}
        </span>
        <span>Basıma Hazır Nüsha</span>
      </div>

      <div className="border-t border-ink" />
    </header>
  );
}
