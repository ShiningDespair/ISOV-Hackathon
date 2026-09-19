/**
 * GIRIS — /giris
 *
 * Sayfa kabugu sunucu bileseni, form istemci bileseni. Oturum cerezi
 * `middleware.ts` tarafindan denetleniyor; bu sayfa acik yollardan biri.
 *
 * `?devam=` parametresi middleware tarafindan eklenir ve giristen sonra
 * kullaniciyi geldigi yere geri goturur (bkz. LoginForm).
 */

import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Giriş",
  description:
    "İSO · İSOV Dış Kaynak İzleme paneline giriş. Panel oturum olmadan görüntülenemez.",
};

export default function GirisPage() {
  return (
    <div className="otur-sayfa">
      <p className="u-kicker u-kicker-accent">Oturum</p>
      <div className="mt-1 border-t border-ink" />

      <LoginForm />

      <section className="otur-yan" aria-labelledby="otur-neden">
        <h2 id="otur-neden" className="u-kicker text-ink">
          Panel neden kapalı?
        </h2>
        <p className="u-body u-body-soft mt-1 text-[0.875rem] leading-snug">
          Haber akışı kurum bazlı izleme listesine ve kişisel sıralamaya göre
          derleniyor. Bu yüzden oturumsuz istek veri döndürmez. Neyin
          çalıştığını oturum açmadan görmek isterseniz{" "}
          <Link href="/durum" className="u-link-underline text-ink">
            özellik durumu
          </Link>{" "}
          sayfası açıktır.
        </p>
      </section>
    </div>
  );
}
