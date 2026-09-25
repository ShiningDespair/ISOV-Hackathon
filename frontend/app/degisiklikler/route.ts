/**
 * /degisiklikler — KALICI YÖNLENDİRME (`/raporlar#degisiklikler`).
 *
 * Değişiklikler paneli artık `/raporlar` içindeki bir modül (bkz.
 * docs/SADELESTIRME.md §2). Bu yol YAŞAMAYA DEVAM EDER: dışarıda paylaşılmış
 * bir bağlantı 404 görmesin.
 *
 * NEDEN `page.tsx` + `redirect()` DEĞİL — ÖLÇÜLDÜ:
 * `app/loading.tsx` kökte durduğu için her sayfa bir Suspense sınırının
 * içinde. Sunucu bileşeninde `redirect()` çağırınca kabuk (shell) çoktan
 * akıtılmış oluyor; Next durum kodunu artık değiştiremiyor ve yanıt
 * `Location` başlığı OLMADAN 200 dönüyor (izlendi: `curl -s -o /dev/null
 * -w '%{http_code} %{redirect_url}'` -> "200 " boş). Tarayıcı istemci
 * tarafı betikle gidiyor ama JS kapalıysa kullanıcı boş sayfa görürdü.
 *
 * Yol işleyicisi (route handler) Suspense'e sarılmaz: gerçek 308 + `Location`
 * üretir, JS'siz de çalışır, arama motoru da doğru yorumlar.
 *
 * 308 (kalıcı, yöntem korunur) seçildi: taşınma kalıcı.
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
    headers: { Location: "/raporlar#degisiklikler" },
  });
}
