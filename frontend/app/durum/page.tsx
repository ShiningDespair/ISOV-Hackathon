/**
 * DURUM — /durum
 *
 * "Sadece bir sayfada işlevsel olan ve olmayan şeylerin listesini göster."
 * Bu sayfa o listedir.
 *
 * KAYNAK: `lib/feature-status.ts`. Sayfada elle yazilmis tek bir durum ya da
 * sayi yoktur; sayaclar da liste de ayni diziden uretilir. Bir ozelligi
 * bitiren kisi oradaki satirini gunceller, sayfa kendiliginden dogru kalir.
 *
 * OTURUM GEREKTIRMEZ: panel tamamen kapali olsa da bu sayfa acik kalir
 * (middleware'in acik yollar listesinde). Sebep: demo baglantisini acan kisi
 * giris yapmadan da urunun nerede oldugunu gorebilsin.
 *
 * Gorunum yuvasi (data-view-slot) KULLANILMAZ: durum listesi dort gorunumun
 * hepsinde ayni sekilde okunmali, yuvasiz icerik her modda gorunur.
 */

import type { Metadata } from "next";

import { getNaceKapsami } from "@/lib/api-durum";
import type { Durum } from "@/lib/feature-status";
import {
  durumMu,
  ozellikSayilari,
  ozellikSayisi,
  ozellikleriAlanaGore,
} from "@/lib/feature-status";

import { DurumFiltre } from "@/components/durum/DurumFiltre";
import { DurumSayaclari } from "@/components/durum/DurumSayaclari";
import { NaceKapsamiBolumu } from "@/components/durum/NaceKapsamiBolumu";
import { OzellikListesi } from "@/components/durum/OzellikListesi";
import { DURUM_KISA } from "@/components/durum/Parts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Durum",
  description:
    "Hangi özellik çalışıyor, hangisi kısmi, hangisi yalnızca arayüz, hangisi henüz yok. Liste feature-status.ts dosyasından üretilir.",
};

export default async function DurumPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const ham = Array.isArray(params.durum) ? params.durum[0] : params.durum;
  const secili: Durum | null = durumMu(ham) ? ham : null;

  const sayilar = ozellikSayilari();
  const toplam = ozellikSayisi();
  const gruplar = ozellikleriAlanaGore(secili);
  const gosterilen = gruplar.reduce((t, g) => t + g.ozellikler.length, 0);

  // Uc henuz yazilmamis olabilir; `hazir: false` donunce bolum sayi basmaz.
  const nace = await getNaceKapsami();

  return (
    <div className="durum-page mx-auto w-full max-w-[1100px] px-4 pb-14 sm:px-6">
      <header className="border-b border-ink py-5">
        <p className="u-kicker u-kicker-accent">Şeffaflık</p>
        <h1 className="u-headline u-headline-lg mt-1">
          Ne çalışıyor, ne çalışmıyor
        </h1>
        <p className="u-body u-body-soft mt-3 max-w-3xl text-[0.95rem] leading-relaxed">
          Bu liste <code className="durum-kod">frontend/lib/feature-status.ts</code>{" "}
          dosyasından üretilir; sayfada elle yazılmış tek bir durum yoktur. Her
          özelliği geliştiren kişi kendi satırını günceller ve bir şeye
          &laquo;çalışıyor&raquo; demek için <strong className="text-ink">nasıl
          doğrulandığının yazılmış olması</strong> gerekir — doğrulaması
          yazılmamış şey çalışıyor sayılmaz. Bu yüzden aşağıdaki
          &laquo;Henüz yok&raquo; satırları da listede duruyor: eksiği
          gizlemiyoruz.
        </p>
        <p className="u-body u-body-soft mt-2 max-w-3xl text-[0.875rem] leading-relaxed">
          Sayfa oturum gerektirmez; panel kapalı olsa da açık kalır.
        </p>
      </header>

      <section className="border-b border-rule py-7" aria-label="Özet sayaçlar">
        <DurumSayaclari sayilar={sayilar} toplam={toplam} />
      </section>

      <div className="border-b border-rule py-4">
        <DurumFiltre secili={secili} sayilar={sayilar} toplam={toplam} />
        <p className="u-kicker mt-3 text-ink-faint">
          {secili
            ? `${DURUM_KISA[secili]} · ${gosterilen} / ${toplam} özellik gösteriliyor`
            : `${toplam} özelliğin tamamı gösteriliyor`}
        </p>
      </div>

      <div className="pt-7">
        <OzellikListesi gruplar={gruplar} />
      </div>

      <div className="mt-10 border-t border-ink pt-7">
        <NaceKapsamiBolumu sonuc={nace} />
      </div>

      <p className="u-body u-body-soft mt-10 border-t border-rule pt-4 text-[0.8125rem] leading-relaxed">
        Bir satır yanlışsa dosyadaki satır yanlıştır. Arayüzde yarım bir
        özelliğin yanında rozet görüyorsanız o rozet de bu dosyadan okuyor;
        satır düzeltilince rozet kendiliğinden kaybolur.
      </p>
    </div>
  );
}
