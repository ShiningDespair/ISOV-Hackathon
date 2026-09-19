/**
 * NYT tarzı üst bar / künye.
 * Solda tarih, ortada büyük serif masthead, sağda görünüm anahtarı.
 * Altında ince çift kural çizgisi ve bölüm gezintisi.
 */

import Link from "next/link";
import { formatMasthead, issueNumber } from "@/lib/format";
import { ViewSwitch } from "./ViewSwitch";
import { AdminNavLink } from "./AdminNavLink";

/**
 * Bolum gezintisi.
 *
 * "Panelim" ve "Degisiklikler" oturum gerektirir; middleware zaten cerezsiz
 * istegi /giris'e yonlendirdigi icin baglantiyi gizlemiyoruz - gizlemek,
 * kullanicinin ozelligin varligini hic ogrenmemesine yol acardi.
 *
 * "Yonetim" yalnizca role='admin' icin gorunur (asagida suzuluyor):
 * yetkisi olmayana gosterip 403 yedirmek kotu bir deneyim.
 */
const NAV = [
  { href: "/", label: "Bülten" },
  { href: "/panelim", label: "Panelim" },
  { href: "/degisiklikler", label: "Değişiklikler" },
  { href: "/raporlar", label: "Raporlar" },
  { href: "/etiketler", label: "Etiketler" },
  { href: "/istatistik", label: "İstatistik" },
  { href: "/ayarlar", label: "Ayarlar" },
];

/** Yalnizca yonetici gezintisinde gorunen bolumler. */
const ADMIN_NAV = [{ href: "/admin", label: "Yönetim" }];

export function Masthead() {
  const now = new Date();

  return (
    <header className="bg-paper print-hidden">
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6">
        {/* Üst satır: tarih · masthead · görünüm anahtarı */}
        <div className="grid grid-cols-1 items-center gap-3 py-3 sm:grid-cols-[1fr_auto_1fr] sm:py-4">
          <div className="u-kicker order-2 hidden sm:order-1 sm:block">
            <time dateTime={now.toISOString()}>{formatMasthead(now.toISOString())}</time>
            <div className="mt-0.5 text-ink-faint">
              Sayı No {issueNumber(now)}
            </div>
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

          <div className="order-3 flex items-center justify-center gap-3 sm:justify-end">
            <ViewSwitch />
          </div>
        </div>

        {/* Çift kural çizgisi */}
        <div className="border-t border-ink" />
        <div className="mt-[2px] border-t border-ink" />

        {/* Bölüm gezintisi */}
        <nav aria-label="Bölümler" className="flex justify-center">
          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 py-2 sm:gap-x-8">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="u-kicker u-link-underline text-ink hover:text-accent"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            {ADMIN_NAV.map((item) => (
              <AdminNavLink key={item.href} href={item.href} label={item.label} />
            ))}
          </ul>
        </nav>
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
