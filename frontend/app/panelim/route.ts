/**
 * /panelim — YÖNLENDİRME (`/?akis=ozel`).
 *
 * Kişisel panel artık ayrı bir sayfa değil, bültenin "Bana Özel" akışı.
 * İçerik `components/dashboard/PersonalPanel.tsx` içinde.
 *
 * Bu yol YAŞAMAYA DEVAM EDER: dışarıda paylaşılmış `/panelim` bağlantıları
 * (kayıt sihirbazının son adımı, tarayıcı yer imi, bülten e-postası) 404
 * görmesin.
 *
 * NEDEN `page.tsx` + `redirect()` DEĞİL — ÖLÇÜLDÜ:
 * `app/loading.tsx` kökte durduğu için her sayfa bir Suspense sınırının
 * içinde. Sunucu bileşeninde `redirect()` çağrıldığında kabuk çoktan
 * akıtılmış oluyor; Next durum kodunu artık değiştiremiyor ve yanıt
 * `Location` başlığı OLMADAN 200 dönüyor. Tarayıcı istemci tarafı betikle
 * gidiyor, ama JS kapalıysa kullanıcı boş sayfa görürdü. Aynı tuzak
 * `app/degisiklikler/route.ts` ve `app/etiketler/route.ts` için de ölçüldü;
 * üçü de aynı çözümü kullanıyor.
 *
 * 307 (geçici, yöntem korunur): kalıcı yönlendirme tarayıcıda önbelleğe
 * girer ve yol ileride geri alınırsa kullanıcının önbelleğini temizlemesi
 * gerekirdi. `/degisiklikler` ve `/etiketler` 308 kullanıyor çünkü onlar
 * bir sayfanın bir modüle dönüşmesi — geri dönüşü planlanmıyor.
 */

import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Yeni akışta da anlamlı olan parametreler — kullanıcının seçimi düşmesin. */
const AKTARILAN = [
  "duzen",
  "vakit",
  "region",
  "band",
  "tag",
  "q",
  "category",
  "source",
] as const;

export function GET(request: NextRequest) {
  const gelen = request.nextUrl.searchParams;

  const query = new URLSearchParams();
  query.set("akis", "ozel");
  for (const key of AKTARILAN) {
    const value = gelen.get(key);
    if (value !== null && value.trim() !== "") query.set(key, value);
  }

  /* GÖRELİ `Location` — `NextResponse.redirect()` mutlak URL ister ve onu
     `request.nextUrl.origin`den üretir; vekilin arkasında bu değer iç ağ
     adı (`http://isov-frontend:3000`) olabilir ve dışarıdaki kullanıcıyı
     erişilemez bir adrese gönderir. Göreli yol bu hata sınıfını tamamen
     ortadan kaldırır (RFC 7231 §7.1.2 izinli). */
  return new NextResponse(null, {
    status: 307,
    headers: { Location: `/?${query.toString()}` },
  });
}
