/**
 * OTURUM KORUMASI — KATMAN 1 (kenar / Edge)
 *
 * Panel TAMAMEN KAPALI. `isov_session` cerezi olmayan istek /giris'e
 * yonlendirilir ve gelinmek istenen yol `?devam=` ile korunur.
 *
 * BU KATMAN CEREZIN YALNIZCA VARLIGINA BAKAR, GECERLILIGINE BAKMAZ.
 * Sebep teknik: middleware Edge calisma zamaninda kosar, veritabani
 * baglantisi yok; token ozetini `sessions` tablosuyla karsilastirmak
 * mumkun degil. Cerezi burada dogrulamaya calismak ya sahte bir guvenlik
 * hissi (imzasiz degeri "gecerli" saymak) ya da her istekte backend'e ek
 * tur demek olurdu.
 *
 * Bu yuzden KATMAN 2 zorunlu: sayfa icindeki istemci `GET /auth/me`
 * cagirir, 401/403 gelirse ayni `?devam=` mantigiyla /giris'e duser
 * (bkz. components/auth/SessionGuard.tsx). Yani suresi dolmus ya da iptal
 * edilmis bir cerezle gelen kullanici panelin kabugunu bir an gorebilir,
 * ama VERI GORMEZ — veri zaten oturumsuz 401 doner.
 *
 * `/api` KAPSAM DISI: oturum denetimi backend'in kendi isi ve API'nin 401
 * dondurmesi gerekiyor; istegi HTML giris sayfasina yonlendirmek istemci
 * tarafinda "JSON bekleniyordu" hatasina cevirir.
 */

import { NextResponse, type NextRequest } from "next/server";

/** Sozlesmedeki oturum cerezi adi. */
export const SESSION_COOKIE = "isov_session";

/**
 * Oturumsuz erisilebilen yollar.
 * `/durum` acik: ozellik durumu sayfasi projenin durustluk vitrini, onu
 * girisin arkasina koymak "ne calisiyor" sorusunu cevaplanamaz yapar.
 */
const PUBLIC_PATHS = new Set(["/giris", "/kayit", "/durum"]);

/** Oturumsuz erisilebilen yol onekleri. */
const PUBLIC_PREFIXES = ["/_next/", "/static/", "/fonts/", "/images/", "/_vercel/"];

/** Uzantisi olan istekler (statik dosyalar) korumaya girmez. */
const STATIC_FILE = /\.[a-z0-9]+$/i;

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // Alt yollar da acik: /giris/sifirla gibi bir yol eklenirse kapanmasin.
  for (const p of PUBLIC_PATHS) {
    if (pathname.startsWith(`${p}/`)) return true;
  }
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  if (pathname === "/favicon.ico" || pathname === "/robots.txt" || pathname === "/sitemap.xml") {
    return true;
  }
  return STATIC_FILE.test(pathname);
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/giris";
  url.search = "";
  // Ana sayfa icin `devam` eklemiyoruz: giristen sonra varsayilan hedef
  // zaten "/" ve bos parametre adres cubugunu kirletir.
  if (pathname !== "/") {
    url.searchParams.set("devam", `${pathname}${search}`);
  }
  return NextResponse.redirect(url);
}

/**
 * `/api` ve Next'in ic yollari eslesmeden cikarildi; geri kalan HER yol
 * korunur. Yeni bir panel sayfasi eklendiginde otomatik kapali gelir —
 * "eklemeyi unuttum" hatasi imkansiz.
 */
export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
