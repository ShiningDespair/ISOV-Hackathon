/**
 * /etiketler — KALICI YÖNLENDİRME (`/istatistik#etiketler`).
 *
 * Etiket dizini artık `/istatistik` içindeki bir modül (bkz.
 * docs/SADELESTIRME.md §2). Bu yol YAŞAMAYA DEVAM EDER: dışarıda paylaşılmış
 * bir bağlantı 404 görmesin. Etikete tıklayınca bültene filtreli dönen
 * `/?tag=<slug>` davranışı modülde AYNEN korundu.
 *
 * `page.tsx` + `redirect()` yerine yol işleyicisi kullanılmasının gerekçesi
 * `app/degisiklikler/route.ts` başındaki notta — kök `loading.tsx` yüzünden
 * sayfa içi `redirect()` `Location` başlığı olmadan 200 dönüyor (ölçüldü).
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  /* GÖRELİ `Location` — `NextResponse.redirect()` mutlak URL ister ve o URL
     `req.nextUrl.origin`den gelir; vekilin arkasında bu değer iç ağ adı
     (`http://isov-frontend:3000`) olabilir ve dışarıdaki kullanıcıyı
     erişilemez bir adrese gönderir. Ölçüldü: dev sunucuda `Host: 127.0.0.1`
     gönderilse bile `origin` "http://localhost:3099" üretti. Göreli yol bu
     sınıfı hatayı tamamen ortadan kaldırır (RFC 7231 §7.1.2 izinli). */
  return new NextResponse(null, {
    status: 308,
    headers: { Location: "/istatistik#etiketler" },
  });
}
