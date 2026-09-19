"use client";

/**
 * Üst bardaki "Yönetim" bağlantısı — yalnızca role='admin' iken görünür.
 *
 * Yetkisi olmayana gösterip 403 yedirmek kötü bir deneyim; ama bağlantıyı
 * gizlemek güvenlik önlemi DEĞİL — korumayı backend `requireRole('admin')`
 * ile yapıyor. Bu yalnızca arayüz nezaketi.
 */

import Link from "next/link";
import { useSession } from "./SessionProvider";

export function AdminNavLink({ href, label }: { href: string; label: string }) {
  const { isAdmin } = useSession();
  if (!isAdmin) return null;

  return (
    <li>
      <Link
        href={href}
        className="u-kicker u-link-underline text-accent hover:text-ink"
      >
        {label}
      </Link>
    </li>
  );
}
