/**
 * KAYIT — /kayit
 *
 * Sayfa kabugu sunucu bileseni; sihirbaz istemci bileseni (`KayitSihirbazi`).
 * `middleware.ts` bu yolu acik tutar, aksi halde kayit olmak icin oturum
 * gerekirdi.
 *
 * Sunucu tarafinda VERI CEKILMIYOR: taksonomi istemciden, kullanicinin
 * kendi oturumsuz istegiyle aliniyor. Sebep, sayfanin backend tamamen
 * kapaliyken de acilmasi gerektigi: sunucu bileseninde bekleyen bir istek
 * ilk boyamayi 8 saniye geciktirirdi.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { KayitSihirbazi } from "@/components/onboarding/KayitSihirbazi";

export const metadata: Metadata = {
  title: "Kayıt",
  description:
    "Altı adımda hesap oluşturma: pozisyon, sektör, ilgi alanları, günlük vakit ve bülten tercihi.",
};

export default function KayitPage() {
  return (
    <div className="otur-sayfa">
      <p className="u-kicker u-kicker-accent">Yeni hesap</p>
      <div className="mt-1 border-t border-ink" />

      <KayitSihirbazi />

      <section className="otur-yan" aria-labelledby="otur-kayit-neden">
        <h2 id="otur-kayit-neden" className="u-kicker text-ink">
          Bu bilgiler ne işe yarıyor?
        </h2>
        <p className="u-body u-body-soft mt-1 text-[0.875rem] leading-snug">
          Pozisyon panelin düzenini, sektör ve ilgi alanları sıralamayı, vakit
          ise kaç haber ve ne kadar özet göreceğinizi belirler. Hiçbiri filtre
          değildir: eşleşmeyen haberler listeden silinmez, yalnızca aşağıya
          iner. Kritik önemdeki haberler her kullanıcıya gösterilir.
        </p>
        <p className="u-body u-body-soft mt-2 text-[0.875rem] leading-snug">
          Neyin gerçekten çalıştığını{" "}
          <Link href="/durum" className="u-link-underline text-ink">
            özellik durumu
          </Link>{" "}
          sayfasında görebilirsiniz.
        </p>
      </section>
    </div>
  );
}
