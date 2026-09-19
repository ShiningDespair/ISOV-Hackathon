"use client";

/**
 * Haber görseli + tipografik yer tutucu (Görsel görünümü).
 *
 * Neden istemci bileşeni: yalnızca `onError` için. Kaynak host'lar rastgele
 * olduğu için görsellerin bir kısmı 404/403 dönebilir ya da hotlink'e kapalı
 * olabilir; bu durumda kırık resim ikonu yerine yer tutucuya düşüyoruz.
 * Sayfanın geri kalanı (VisualFront) sunucu bileşeni olarak kalır.
 *
 * Neden `next/image` DEĞİL: `next.config.ts` içinde `remotePatterns` tanımlı
 * değil ve kaynak host'lar önceden bilinemiyor; `next/image` bilinmeyen host'ta
 * çalışma anında hata fırlatır. Düz `<img>` + CSS `aspect-ratio` kullanılıyor,
 * böylece mizanpaj kayması (layout shift) da olmuyor.
 *
 * Erişilebilirlik: hem gerçek görsel hem yer tutucu `data-a11y-image` taşır;
 * "Görselleri gizle" ayarı ikisini de gizler (globals.css ERİŞİLEBİLİRLİK).
 */

import { useState } from "react";

/** Yer tutucu ton sayısı — globals.css'teki .gorsel-tone-* ile aynı olmalı. */
const TONE_COUNT = 4;

/** Kaynak adından baş harfler: "Resmî Gazete" -> "RG". */
function initialsOf(name?: string | null, fallback = ""): string {
  const words = String(name ?? "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (words.length === 0) {
    return fallback.slice(0, 2).toLocaleUpperCase("tr-TR");
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toLocaleUpperCase("tr-TR");
  }
  return (words[0][0] + words[1][0]).toLocaleUpperCase("tr-TR");
}

/**
 * Deterministik ton: aynı haber her zaman aynı yer tutucuyu alır.
 * Kimlik küçük tam sayı olduğu için basit bir karıştırma yeterli —
 * 1..8 aralığında ardışık id'ler farklı tonlara dağılsın diye çarpan var.
 */
export function toneOf(seed: number): number {
  const n = Math.abs(Math.trunc(Number.isFinite(seed) ? seed : 0));
  return (n * 7 + 3) % TONE_COUNT;
}

export interface ArticleImageProps {
  /** `image_url`; yok / null ise doğrudan yer tutucu basılır. */
  src?: string | null;
  /** Anlamlı alternatif metin — haber başlığı. */
  alt: string;
  /** Deterministik ton kaynağı — `article.id`. */
  seed: number;
  /** Yer tutucudaki büyük harfler bu addan türetilir. */
  sourceName?: string | null;
  /** Yer tutucu kicker'ı — kategori ya da bölge. */
  label?: string;
  /** Baş harf üretilemezse kullanılacak yedek (ör. bölge adı). */
  fallbackInitials?: string;
  /** Çerçeve oranı: manşet 16:9, kart 4:3. */
  ratio?: "lead" | "card";
  className?: string;
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
}: ArticleImageProps) {
  const [broken, setBroken] = useState(false);

  const ratioClass = ratio === "lead" ? "gorsel-ratio-lead" : "gorsel-ratio-card";
  const url = typeof src === "string" ? src.trim() : "";
  const usable = url !== "" && !broken;

  // --- Yer tutucu: görsel yok ya da yüklenemedi ----------------------
  // Dekoratif: haberin başlığı ve kicker'ı hemen yanında metin olarak
  // zaten var, ekran okuyucuya ikinci kez okutmuyoruz.
  if (!usable) {
    return (
      <div
        data-a11y-image
        aria-hidden="true"
        className={`gorsel-ph gorsel-tone-${toneOf(seed)} ${ratioClass} ${className}`}
      >
        <span className="gorsel-ph-kicker">{label || "Bülten"}</span>
        <span className="gorsel-ph-mark">
          {initialsOf(sourceName, fallbackInitials)}
        </span>
        <span className="gorsel-ph-note">
          {sourceName ? "Görsel yok" : "Kaynak belirtilmemiş"}
        </span>
      </div>
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
