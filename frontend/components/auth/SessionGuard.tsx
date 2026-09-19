"use client";

/**
 * OTURUM KORUMASI — KATMAN 2 (istemci)
 *
 * `middleware.ts` cerezin yalnizca VARLIGINA bakabilir (Edge'de veritabani
 * yok). Suresi dolmus ya da iptal edilmis bir cerez middleware'i gecer.
 * Bu bilesen o bosluğu kapatir: mount aninda `GET /auth/me` cagirir, 401/403
 * gelirse middleware ile AYNI `?devam=` mantigiyla /giris'e yonlendirir.
 *
 * NE ZAMAN YONLENDIRMEZ:
 *  - 501 (uc nokta henuz uygulanmadi) ve 404 (vekil yok) durumlarinda.
 *    Bunlari "oturum gecersiz" saymak, backend'in auth bolumu yayina
 *    girmeden once herkesi giris sayfasina kilitler ve sayfa ile /giris
 *    arasinda dongu uretir.
 *  - Zaman asimi / ag hatasinda. Geciciolabilir; kullaniciyi oturumundan
 *    atmak icin yeterli kanit degil.
 *
 * KULLANIMI: `app/layout.tsx` icinde bir kez render edilir, gorsel cikti
 * uretmez.
 *
 * NOT (entegrasyon): oturumu KENDISI cekmiyor, `SessionProvider` baglamindan
 * okuyor. Sebep: ust bardaki "Yonetim" baglantisi da oturum sahibini bilmek
 * zorunda; ikisi ayri ayri /auth/me cagirsa her sayfa yuklemesinde iki istek
 * olurdu.
 */

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { loginPathFor } from "@/lib/api-auth";
import { useSession } from "@/components/SessionProvider";

/** Oturumsuz gezilebilen yollar — burada denetim yapilmaz. */
const PUBLIC = new Set(["/giris", "/kayit", "/durum"]);

export function SessionGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();

  useEffect(() => {
    if (!pathname || PUBLIC.has(pathname)) return;
    // Yalnizca KESIN olarak oturum yoksa yonlendir. "bilinmiyor" henuz
    // denenmedi, "belirsiz" ise uc yayinda degil / ag hatasi - ikisi de
    // kullaniciyi oturumundan atmak icin yeterli kanit degil.
    if (status !== "yok") return;

    // `useSearchParams()` yerine dogrudan location: o kancayi kullanmak
    // statik render edilen sayfalarda Suspense sarmalayici zorunlu kilar.
    const search = typeof window === "undefined" ? "" : window.location.search;
    router.replace(loginPathFor(pathname, search));
  }, [pathname, router, status]);

  return null;
}
