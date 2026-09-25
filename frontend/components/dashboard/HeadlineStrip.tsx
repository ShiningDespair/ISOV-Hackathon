"use client";

/**
 * YATAY ÖNEMLİ KONULAR ŞERİDİ — haber kanallarının alt yazısı gibi
 * kendiliğinden, YAVAŞÇA ve kesintisiz kayan şerit.
 *
 * ÖNCEKİ SÜRÜM OTOMATİK KAYDIRMAYI REDDEDİYORDU. Gerekçeleri geçerliydi ve
 * silinmedi: her biri ayrı ayrı çözüldü. Kayıt niyetiyle:
 *
 *   1) "Ekran okuyucu içeriği sürekli yeniden duyurur."
 *      ÇÖZÜM: hareketin kaynağı DOM değil, CSS `transform` animasyonudur.
 *      Hiçbir düğüm eklenip çıkarılmıyor, hiçbir metin değişmiyor, hiçbir
 *      canlı bölge (`aria-live`) yok — erişilebilirlik ağacı ilk boyamadan
 *      sonra hiç değişmiyor. Duyuru tek seferdir. Görsel sürekliliği
 *      sağlayan ikinci (kopya) liste `aria-hidden="true"`, yani ekran
 *      okuyucu başlıkları İKİ KEZ okumaz.
 *
 *   2) "Motor beceri kısıtı olan kullanıcı hedefi kaçırır."
 *      ÇÖZÜM üç katmanlı: (a) kap `:hover` ve `:focus-within` iken animasyon
 *      duruyor — imleci şeridin üstüne getirmek ya da Tab ile içine girmek
 *      hareketi kesiyor; (b) açık bir Duraklat/Oynat düğmesi var (WCAG 2.2.2
 *      "Pause, Stop, Hide": 5 saniyeden uzun süren otomatik hareket için
 *      kullanıcı denetimi UYUM GEREKLİLİĞİDİR, süs değil); (c) kap her
 *      koşulda `overflow-x: auto` ve `tabindex=0`, yani şerit dururken
 *      eskisi gibi elle/ok tuşlarıyla gezilebiliyor. Tab ile bir bağlantıya
 *      gidildiğinde tarayıcı öğeyi görünür alana kendisi getirebiliyor;
 *      kap kırpılmış (`overflow: hidden`) olsaydı bu MÜMKÜN OLMAZDI.
 *
 *   3) "`prefers-reduced-motion` sözünü tutmak iki ayrı tasarım demek."
 *      ÇÖZÜM: iki tasarım değil, TEK tasarımın iki kipi. Animasyon yalnızca
 *      `@media (prefers-reduced-motion: no-preference)` içinde tanımlı;
 *      kaydırma kabı, kap etiketi, klavye davranışı ve bağlantılar iki kipte
 *      de AYNI. Azaltılmış kipte yalnızca üç şey değişir: animasyon yok,
 *      kopya liste `display: none` (yoksa kullanıcı aynı başlıkları iki kez
 *      GÖRÜR) ve duraklat düğmesi görünmez (duraklatacak hareket yok).
 *      Böylece şerit tam olarak eski, elle kaydırılan hâline düşer.
 *
 * KESİNTİSİZ DÖNGÜ NASIL: başlık listesi iki kez basılıp tek bir "ray"ın
 * içine konur; ray `translateX(0)` → `translateX(-50%)` gider ve başa döner.
 * %50, rayın yarısı = tam bir liste genişliği olduğu için dönüş anındaki
 * görüntü başlangıç görüntüsünün birebir aynısıdır: dikiş görünmez, sıçrama
 * olmaz. İki kopyanın genişlikleri BİREBİR aynı olmak zorunda, bu yüzden
 * kopya da aynı sınıfları ve aynı rozeti kullanıyor.
 *
 * DÖNGÜNÜN TEK KOŞULU — ve neden ÖLÇÜLÜYOR: yukarıdaki kurgu ancak BİR
 * listenin genişliği kabın genişliğinden küçük DEĞİLSE kesintisizdir. Küçük
 * olursa (az sayıda kısa başlık + geniş ekran) ray sona erdiği halde kap
 * dolmaz ve döngünün ortasında BOŞLUK görünür. Bunu başlık sayısına bakarak
 * tahmin etmek yanlış olurdu: aynı 3 başlık kısa metinlerle 380 piksel, uzun
 * metinlerle 1200 piksel yer tutar; karar metin genişliğine, yazı tipine ve
 * ekran genişliğine bağlı. Bu yüzden gerçek genişlik `ResizeObserver` ile
 * ÖLÇÜLÜYOR ve kayma yalnızca ölçüm yeterli çıkarsa açılıyor.
 *
 * SUNUCUDA KAYMA KAPALI BAŞLAR. Bilinçli: ölçüm ancak tarayıcıda yapılabilir,
 * dolayısıyla ilk çizimde şerit eski duruk hâlindedir ve kayma ölçümden sonra
 * açılır. Faydası iki yönlü — boş alan gösteren tek bir kare bile oluşmaz ve
 * JavaScript hiç çalışmazsa şerit bozulmaz, yalnızca kaymaz.
 *
 * KOPYA NEDEN BAĞLANTI DEĞİL: `aria-hidden="true"` odaklanabilirliği
 * KALDIRMAZ — içindeki `<a>` etiketleri Tab sırasında kalır ve ekran okuyucu
 * "gizli öğeye odaklandı" durumuna düşer. İki çare var: `inert` niteliği
 * (React 19'da destekli) ya da kopyada hiç etkileşimli öğe kullanmamak.
 * İKİNCİSİ seçildi: `<a>` yerine aynı sınıflı `<span>` basılıyor. Gerekçe —
 * `inert` bir tarayıcı özelliğidir ve desteklenmediği bir motorda sessizce
 * ETKİSİZ kalır, yani erişilebilirlik güvencesi tarayıcıya emanet edilmiş
 * olur; odaklanabilir öğeyi HİÇ ÜRETMEMEK ise yapısal bir güvencedir,
 * hiçbir tarayıcı desteğine bağlı değildir. Kopya ayrıca Tab sırasına
 * girmediği için `:focus-within` duraklatması da yalnızca gerçek
 * bağlantılarla tetiklenir.
 *
 * SÜRE NEDEN SABİT DEĞİL: toplam süre başlık SAYISIYLA çarpılarak
 * hesaplanıyor (öğe başına sabit saniye). Sabit toplam süre kullanılsaydı
 * kayma HIZI başlık sayısına göre değişirdi: 8 başlığı 40 saniyede bitiren
 * bir şerit 20 başlıkta iki buçuk kat hızlanır ve okunamaz hale gelirdi.
 * Öğe başına saniye sabitlenince PİKSEL/SANİYE hızı sabit kalır, şerit 8
 * başlıkta da 20 başlıkta da aynı okunabilirlikte akar. Toplam süre satır
 * içi `--serit-sure` CSS değişkeni olarak geçiyor; CSS'te sayı üretmenin
 * başka yolu yok ve bu değer içeriğe bağlı olduğu için stil dosyasına
 * yazılamaz.
 *
 * Yatay kaydırma YALNIZCA bu kabın içinde olur; sayfa gövdesi 390 piksel
 * genişlikte de yatay kaymaz.
 *
 * Stiller: `frontend/app/css/serit.css` (docs/SADELESTIRME.md §1).
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

import Link from "next/link";

import { BandBadge } from "@/components/BandBadge";
import { truncate } from "@/lib/format";
import type { Article } from "@/lib/types";

/** Şeritte tek satırda okunabilir kalan başlık uzunluğu. */
const TITLE_MAX = 74;

/** Şerit hızı. Değer = BAŞLIK BAŞINA saniye, toplam süre değil. */
const OGE_BASINA_SANIYE = {
  /** Varsayılan. Kullanıcı "yavaş şekilde" dedi; bu istek buradan karşılanıyor. */
  yavas: 9,
  normal: 7,
} as const;

export type SeritHizi = keyof typeof OGE_BASINA_SANIYE;

/**
 * Taban süre. Az başlıkta toplam süre çok kısalırsa şerit kısa aralıkla
 * baştan başlayıp titrek görünür; bu alt sınır onu engelliyor.
 */
const EN_AZ_SURE_SANIYE = 30;

/** `prefers-reduced-motion` VEYA erişilebilirlik widget'ının "azalt" kipi. */
function hareketAzaltilmisMi(): boolean {
  try {
    return (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.a11yMotion === "azalt"
    );
  } catch {
    return false;
  }
}

/**
 * Hareket kipini izler. İki kaynak var ve ikisi de sonradan değişebilir:
 * işletim sistemi tercihi (medya sorgusu) ve sayfadaki erişilebilirlik
 * widget'ı (`html[data-a11y-motion]`). İkisi de dinleniyor, yoksa kullanıcı
 * widget'tan hareketi kapattığında düğme ekranda kalmaya devam ederdi.
 *
 * Sunucuda `false` döner; animasyonun kendisi CSS medya sorgusuyla korunduğu
 * için JavaScript yüklenmeden de azaltılmış kipte hareket OLMAZ. Bu kancanın
 * işi yalnızca METNİ ve düğmeyi kipe uydurmak.
 */
function useHareketAzaltildi(): boolean {
  const [azaltildi, setAzaltildi] = useState(false);

  useEffect(() => {
    const guncelle = () => setAzaltildi(hareketAzaltilmisMi());
    guncelle();

    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", guncelle);
    } catch {
      mq = null;
    }

    const gozlemci = new MutationObserver(guncelle);
    gozlemci.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-a11y-motion"],
    });

    return () => {
      mq?.removeEventListener("change", guncelle);
      gozlemci.disconnect();
    };
  }, []);

  return azaltildi;
}

/**
 * Kesintisiz döngünün genişlik koşulunu ÖLÇER: bir liste kopyası kaydırma
 * kabını dolduruyor mu? Doldurmuyorsa `translateX(-50%)` yolunun sonunda
 * rayın arkası biter ve kapta boşluk görünür — o hâlde kayma açılmaz.
 *
 * `ResizeObserver` iki öğeyi de izliyor: kap (ekran/pencere genişliği ya da
 * yan panel değişince) ve listenin kendisi (yazı tipi yüklenince, kullanıcı
 * yazı boyunu büyütünce, erişilebilirlik widget'ı fontu değiştirince).
 * Yalnızca ilk çizimde ölçmek yetmez; bu ölçüm bir kez doğru olup sonradan
 * yanlışa düşebilir.
 */
function useKopyaKabiDolduruyor(
  kapRef: RefObject<HTMLDivElement | null>,
  listeRef: RefObject<HTMLUListElement | null>,
  bagimlilik: number,
): boolean {
  const [yeterli, setYeterli] = useState(false);

  useEffect(() => {
    const kap = kapRef.current;
    const liste = listeRef.current;
    if (!kap || !liste) return;

    const olc = () => {
      // `clientWidth` kabın iç genişliği, `offsetWidth` bir kopyanın tam
      // genişliği. Eşitlik de yeterli: tam örtüşmede boşluk kalmaz.
      setYeterli(liste.offsetWidth >= kap.clientWidth);
    };
    olc();

    // Salınım riski yok: kopyanın eklenmesi ne kabın iç genişliğini ne de
    // gerçek listenin genişliğini değiştirir (yatay kaydırma çubuğu yalnızca
    // yüksekliği etkiler), dolayısıyla ölçüm kendi sonucunu tetiklemez.
    const gozlemci = new ResizeObserver(olc);
    gozlemci.observe(kap);
    gozlemci.observe(liste);
    return () => gozlemci.disconnect();
  }, [kapRef, listeRef, bagimlilik]);

  return yeterli;
}

export function HeadlineStrip({
  articles,
  label = "Öne Çıkanlar",
  hiz = "yavas",
}: {
  articles: Article[];
  label?: string;
  /** İsteğe bağlı. Başlık başına saniyeyi seçer; varsayılan "yavas". */
  hiz?: SeritHizi;
}) {
  const [duraklatildi, setDuraklatildi] = useState(false);
  const hareketAzaltildi = useHareketAzaltildi();
  const pencereRef = useRef<HTMLDivElement | null>(null);
  const listeRef = useRef<HTMLUListElement | null>(null);
  const genislikYeterli = useKopyaKabiDolduruyor(
    pencereRef,
    listeRef,
    articles.length,
  );

  if (articles.length === 0) return null;

  /**
   * Kayma gerçekten çalışacak mı? İki koşul: hareket kapatılmamış olacak VE
   * bir liste kopyası kabı dolduracak. İkisi de tarayıcıda ölçülüyor, yani
   * sunucu çiziminde `false` — şerit duruk başlar, kayma ölçümden sonra açılır.
   */
  const kayan = genislikYeterli && !hareketAzaltildi;

  const sureSaniye = Math.max(
    EN_AZ_SURE_SANIYE,
    Math.round(articles.length * OGE_BASINA_SANIYE[hiz]),
  );

  /**
   * Kap etiketi kipe göre yazılıyor. "Yatay kaydırılabilir liste" tek başına
   * artık yanıltıcı: hareket kipinde şerit kendiliğinden de akıyor ve bunun
   * durdurulabildiğini söylemek gerekiyor. Azaltılmış kipte ise hareketten
   * hiç söz edilmemeli, yoksa olmayan bir davranış duyurulur.
   */
  const kapEtiketi = kayan
    ? `${label} — ${articles.length} başlık. Kendiliğinden yavaşça kayan şerit; üzerine gelince, odaklanınca ya da Duraklat düğmesiyle durur. Ok tuşlarıyla elle de gezilebilir.`
    : `${label} — ${articles.length} başlık, ok tuşlarıyla yatay gezilebilen liste.`;

  return (
    <section className="pano-serit-kap" aria-labelledby="pano-serit-baslik">
      <div className="serit-ust">
        <h2 id="pano-serit-baslik" className="pano-serit-baslik">
          {label}
        </h2>

        {/* Hareket yoksa duraklatacak bir şey de yok: düğme hiç basılmaz.
            CSS ayrıca `display: none` yazıyor — JavaScript yüklenmeden ya da
            hiç yüklenmezse düğme yine görünmez. */}
        {kayan ? (
          <button
            type="button"
            className="serit-dugme"
            aria-pressed={duraklatildi}
            onClick={() => setDuraklatildi((onceki) => !onceki)}
          >
            {duraklatildi ? "Oynat" : "Duraklat"}
          </button>
        ) : null}
      </div>

      {/*
        KAP. Her iki kipte de kaydırma burada olur (`overflow-x: auto`) ve
        klavyeyle gezilebilir (`tabindex=0`). Animasyon içteki raya uygulanır;
        duraklatma durumu buraya `data-*` niteliği olarak yazılıp CSS'te
        okunur — böylece duraklatma stil katmanında çözülür, JavaScript her
        karede iş yapmaz.
      */}
      <div
        ref={pencereRef}
        className="serit-pencere"
        data-kayan={kayan ? "true" : "false"}
        data-durdu={duraklatildi ? "true" : "false"}
        tabIndex={0}
        aria-label={kapEtiketi}
        style={{ "--serit-sure": `${sureSaniye}s` } as CSSProperties}
      >
        <div className="serit-ray">
          {/* GERÇEK liste: bağlantılar, normal odak sırası, ekran okuyucuya açık. */}
          <ul ref={listeRef} className="pano-serit" data-serit-ray="true">
            {articles.map((article) => (
              <li key={article.id} className="pano-serit-oge">
                <Link
                  href={`/haber/${article.id}`}
                  className="pano-serit-baglanti"
                >
                  <BandBadge band={article.importance_band} />
                  <span className="pano-serit-metin" title={article.title}>
                    {truncate(article.title, TITLE_MAX)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {/*
            KOPYA liste — yalnızca görsel süreklilik için. Ekran okuyucuya
            kapalı (`aria-hidden`) ve içinde odaklanabilir öğe YOK: bağlantı
            yerine aynı sınıflı `<span>` var, bu yüzden Tab sırasına hiç
            girmiyor. Genişlik birebir aynı olmak zorunda (yoksa %50 dönüş
            noktası kaymış olur), bu yüzden sınıflar ve rozet aynen
            tekrarlanıyor; yalnızca `title` ipucu bırakıldı — gizli öğede
            araç ipucu göstermek anlamsız olurdu.
          */}
          {kayan ? (
            <ul
              className="pano-serit serit-kopya"
              data-serit-ray="true"
              aria-hidden="true"
            >
              {articles.map((article) => (
                <li key={`kopya-${article.id}`} className="pano-serit-oge">
                  <span className="pano-serit-baglanti">
                    <BandBadge band={article.importance_band} />
                    <span className="pano-serit-metin">
                      {truncate(article.title, TITLE_MAX)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}
