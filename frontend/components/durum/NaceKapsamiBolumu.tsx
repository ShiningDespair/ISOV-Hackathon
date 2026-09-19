/**
 * NACE KAPSAMI — hangi sektorun verisi ince, aciktan gosterilir.
 *
 * Resmi NACE listesi kullaniliyor; ama bazi basliklarin veride karsiligi
 * zayif. Bunu saklamak yerine oluyorsa oldugu gibi yaziyoruz: sektorler
 * DOGRUDAN eslesen haber sayisina gore ARTAN sirada dizilir, yani verisi en
 * ince kalem en ustte durur.
 *
 * Uc henuz yoksa (404 / 501) ya da erisilemiyorsa hicbir sayi basilmaz —
 * yalnizca "kapsam verisi henuz hazir degil" yazilir.
 */

import { BarList, StatFigure } from "@/components/Charts";
import { SectionRule } from "@/components/States";
import type { NaceKapsamSonucu } from "@/lib/api-durum";

export function NaceKapsamiBolumu({ sonuc }: { sonuc: NaceKapsamSonucu }) {
  if (!sonuc.hazir) {
    return (
      <section className="durum-bolum" aria-labelledby="nace-baslik">
        <div id="nace-baslik">
          <SectionRule title="NACE Sektör Kapsamı" right="hazır değil" />
        </div>
        <p className="u-body u-body-soft text-[0.95rem] leading-relaxed">
          Kapsam verisi henüz hazır değil. {sonuc.sebep} Uç yanıt verene kadar
          burada sayı gösterilmiyor — tahmin yazmak, ölçmemekten daha kötü
          olurdu.
        </p>
      </section>
    );
  }

  const { kalemler, kalemSayisi, dogrudanEslesenSayisi, eslesmeyenler, dogrudanToplam } =
    sonuc.veri;

  // Verisi en ince kalem en ustte: dogrudan artan, esitlikte dolayli artan.
  const sirali = [...kalemler].sort(
    (a, b) => a.dogrudan - b.dogrudan || a.dolayli - b.dolayli,
  );

  const bucketlar = sirali.map((k) => ({
    key: k.kod,
    label: k.kod === k.ad ? k.kod : `${k.kod} · ${k.ad}`,
    count: k.dogrudan,
  }));

  const inceEsik = 5;
  const inceKalemler = sirali.filter((k) => k.dogrudan > 0 && k.dogrudan < inceEsik);

  return (
    <section className="durum-bolum" aria-labelledby="nace-baslik">
      <div id="nace-baslik">
        <SectionRule
          title="NACE Sektör Kapsamı"
          right={`${kalemSayisi} kalem`}
        />
      </div>

      <p className="u-body u-body-soft max-w-3xl text-[0.95rem] leading-relaxed">
        Sektör başlıkları resmî NACE listesinden alındı. Her başlığın veride
        aynı ağırlıkta karşılığı yok: aşağıdaki liste doğrudan eşleşen haber
        sayısına göre <strong className="text-ink">artan</strong> sırada, yani
        verisi en ince kalem en üstte. {kalemSayisi} kalemin{" "}
        {dogrudanEslesenSayisi} tanesinde doğrudan eşleşme var.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
        <StatFigure
          label="NACE Kalemi"
          value={String(kalemSayisi)}
          note="Resmî listeden alınan sektör başlığı"
        />
        <StatFigure
          label="Doğrudan Eşleşen"
          value={String(dogrudanEslesenSayisi)}
          note="En az bir haberi doğrudan eşlenen kalem"
        />
        <StatFigure
          label="Eşleşmesiz"
          value={String(eslesmeyenler.length)}
          note="Doğrudan eşleşmesi olmayan kalem"
        />
        <StatFigure
          label="Doğrudan Haber"
          value={String(dogrudanToplam)}
          note="Kalemlere doğrudan eşlenen haber toplamı"
        />
      </div>

      {eslesmeyenler.length > 0 ? (
        <div className="durum-ince mt-7">
          <h3 className="u-kicker text-ink">Doğrudan eşleşmesi olmayan kalemler</h3>
          <ul className="durum-ince-liste">
            {eslesmeyenler.map((k) => (
              <li key={k.kod}>
                <span className="durum-ince-kod">{k.kod}</span>{" "}
                <span className="durum-ince-ad">{k.ad}</span>
                <span className="durum-ince-not">
                  {k.dolayli > 0
                    ? ` — doğrudan eşleşme yok, ${k.dolayli} dolaylı haber`
                    : " — bu dönemde ne doğrudan ne dolaylı haber"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {inceKalemler.length > 0 ? (
        <p className="u-body u-body-soft mt-4 text-[0.875rem] leading-snug">
          Ayrıca {inceKalemler.length} kalemde {inceEsik}&apos;ten az doğrudan
          haber var; bu başlıklarda sıralama tek bir haberle değişebilir.
        </p>
      ) : null}

      <div className="mt-7">
        <h3 className="u-kicker mb-2 border-b border-rule pb-1 text-ink">
          Kalem başına doğrudan haber
        </h3>
        <BarList data={bucketlar} emptyLabel="Kapsam verisi boş döndü." />
      </div>
    </section>
  );
}
