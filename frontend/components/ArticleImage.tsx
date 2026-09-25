"use client";

/**
 * Haber görseli + kaynak amblemi yer tutucusu (Görsel/Kart görünümleri).
 *
 * Neden istemci bileşeni: yalnızca `onError` için. Kaynak host'lar rastgele
 * olduğu için görsellerin bir kısmı 404/403 dönebilir ya da hotlink'e kapalı
 * olabilir; bu durumda kırık resim ikonu yerine amblemi basıyoruz. Bu tek
 * neden ortadan kalkmadığı sürece `"use client"` ZORUNLU kalır. Sayfanın geri
 * kalanı (VisualFront) sunucu bileşeni; `<SourceArtwork>` de sunucu bileşeni
 * ama buradan çağrıldığı için istemci ağacında render edilir — içinde state
 * ve olay olmadığı için maliyeti yalnızca statik SVG işaretlemesi kadar.
 *
 * Neden `next/image` DEĞİL: `next.config.ts` içinde `remotePatterns` tanımlı
 * değil ve kaynak host'lar önceden bilinemiyor; `next/image` bilinmeyen host'ta
 * çalışma anında hata fırlatır. Düz `<img>` + CSS `aspect-ratio` kullanılıyor,
 * böylece mizanpaj kayması (layout shift) da olmuyor.
 *
 * Yer tutucu (docs/SADELESTIRME.md §5): eski tipografik blok yerine kaynağa
 * özgü satır içi SVG amblem basılır. Üretim mantığı `lib/source-art.ts`
 * içinde saf fonksiyon olarak duruyor; buraya yalnızca "hangi props hangi
 * alandan geliyor" bilgisi ait.
 *
 * Erişilebilirlik: hem gerçek görsel hem amblem `data-a11y-image` taşır;
 * "Görselleri gizle" ayarı ikisini de gizler (globals.css ERİŞİLEBİLİRLİK).
 */

import { useState } from "react";

import { SourceArtwork } from "./SourceArtwork";

// NOT: eski `toneOf()` yardımcısı ve `.gorsel-tone-*` sınıfları artık
// kullanılmıyor. Amblem paleti haber kimliğinden değil KAYNAK SLUG'INDAN
// türüyor (`lib/source-art.ts`), çünkü aynı kaynağın tüm haberlerinin aynı
// kimliği taşıması gerekiyor. `.gorsel-tone-*` kuralları globals.css'te ölü
// kaldı; o dosya bu turda kilitli olduğu için temizliği süpervizör yapacak.

export interface ArticleImageProps {
  /** `image_url`; yok / null ise doğrudan kaynak amblemi basılır. */
  src?: string | null;
  /** Anlamlı alternatif metin — haber başlığı. */
  alt: string;
  /** Deterministik ton kaynağı — `article.id`. Amblem paleti slug'dan gelir. */
  seed: number;
  /** Amblem yazısı bu addan türetilir — `article.source.name`. */
  sourceName?: string | null;
  /** Yer tutucu kicker'ı — kategori ya da bölge. Kaynak adı yoksa yedek olur. */
  label?: string;
  /** Ad üretilemezse kullanılacak yedek (ör. bölge adı). */
  fallbackInitials?: string;
  /** Çerçeve oranı: manşet 16:9, kart 4:3. */
  ratio?: "lead" | "card";
  className?: string;

  // --- Amblem için isteğe bağlı kaynak alanları ----------------------
  // Hiçbiri ZORUNLU değil: verilmezse amblem kademe 2/3'e düşer ve yine
  // makul bir sonuç üretir (boş kutu YOK). Verildiğinde kademe 1 (elle
  // tasarlanmış kimlik) devreye girer.
  /** `article.source.slug` — kademe 1 adlandırılmış tasarımın anahtarı. */
  sourceSlug?: string | null;
  /** `article.source.source_type` — kademe 2 arketipi. */
  sourceType?: string | null;
  /** `article.source.country_code` — amblemin alt satırı. */
  countryCode?: string | null;
  /** `article.title` — Resmî Gazete sayı çıkarımı için. */
  articleTitle?: string | null;
  /** `article.url` — Resmî Gazete tarih çıkarımı için. */
  articleUrl?: string | null;
  /** `article.published_at` — URL'de tarih yoksa yedek. */
  publishedAt?: string | null;
}

export function ArticleImage({
  src,
  alt,
  seed,
  sourceName,
  label,
  fallbackInitials = "",
  ratio = "card",
  className = "",
  sourceSlug,
  sourceType,
  countryCode,
  articleTitle,
  articleUrl,
  publishedAt,
}: ArticleImageProps) {
  const [broken, setBroken] = useState(false);

  const ratioClass = ratio === "lead" ? "gorsel-ratio-lead" : "gorsel-ratio-card";
  const url = typeof src === "string" ? src.trim() : "";
  const usable = url !== "" && !broken;

  // --- Yer tutucu: görsel yok ya da yüklenemedi ----------------------
  // Kaynak amblemi. Dekoratif olduğu ve `data-a11y-image` taşıdığı için
  // erişilebilirlik sözleşmesi SourceArtwork içinde korunuyor.
  // `seed` burada artık palet seçmiyor; palet slug karmasından geliyor, yani
  // aynı kaynağın tüm haberleri aynı amblemi alıyor (kurumsal kimlik).
  if (!usable) {
    return (
      <SourceArtwork
        ratio={ratio}
        className={className}
        slug={sourceSlug}
        name={sourceName}
        sourceType={sourceType}
        countryCode={countryCode}
        title={articleTitle ?? alt}
        url={articleUrl}
        publishedAt={publishedAt}
        // Kaynak adı hiç yoksa elimizdeki en anlamlı yedek: kicker/bölge.
        fallbackInitials={fallbackInitials || label}
        // Kaynak türü verilmediğinde amblemin üst satırı bu etiket olur.
        kicker={label}
      />
    );
  }

  // --- Gerçek görsel -------------------------------------------------
  return (
    <div data-a11y-image className={`gorsel-frame ${ratioClass} ${className}`}>
      <img
        data-a11y-image
        src={url}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="gorsel-img"
      />
    </div>
  );
}
