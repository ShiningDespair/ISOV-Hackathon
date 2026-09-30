"use client";

/**
 * BÖLÜM GEZİNTİSİ — üst bardaki üç bağlantı ve aktif sayfa göstergesi
 *
 * Neden ayrı (istemci) bileşen: aktif sayfayı bilmek `usePathname()`
 * gerektiriyor, ama `Masthead` sunucu bileşeni olarak kalmalı — tarih ve
 * sayı numarası sunucuda üretiliyor ve bunu istemciye taşımak hidrasyon
 * uyuşmazlığı üretirdi. Gezinti burada izole edildi.
 *
 * Aktiflik RENKLE GÖSTERİLMEZ (WCAG 1.4.1): kalınlık + alt çizgi
 * (`.hesap-nav-link[aria-current="page"]`) ve `aria-current="page"` ile
 * duyurulur.
 *
 * YÖNETİM: admin oturumunda gezintinin sonuna "Yönetim" eklenir. Yalnızca
 * Hesabım menüsünde durduğunda adminler paneli bulamıyordu. Oturum istemcide
 * bilindiği için bu ekleme burada yapılır; admin olmayan hiç görmez.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "./SessionProvider";

export interface NavItem {
  href: string;
  label: string;
}

/** `/raporlar/12` de "Raporlar"ı aktif sayar; `/` yalnızca tam eşleşir. */
function aktifMi(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const ADMIN_ITEM: NavItem = { href: "/admin", label: "Yönetim" };

export function SectionNav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  const { isAdmin } = useSession();
  const gorunen = isAdmin ? [...items, ADMIN_ITEM] : items;

  return (
    <nav aria-label="Bölümler" className="flex justify-center">
      <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 py-2 sm:gap-x-10">
        {gorunen.map((item) => {
          const aktif = aktifMi(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className="u-kicker hesap-nav-link"
                aria-current={aktif ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
