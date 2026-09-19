/**
 * /durum SAYFASININ PAYLASILAN PARCALARI
 *
 * Buradaki tek onemli kural: RENK TEK GOSTERGE DEGIL (WCAG 1.4.1).
 * Her durum uc kanaldan ayni anda okunur:
 *   1. metin etiketi  — "Çalışıyor" / "Kısmi" / "Arayüz hazır" / "Henüz yok"
 *   2. simge          — ● / ◐ / ○ / —   (sekil farki, renk degil)
 *   3. cerceve        — kalin duz / soldan vurgu / kesikli / noktali
 * Renk korlugu paletleri yalnizca `--color-accent`'i degistirdigi icin
 * hicbir durum ayrimi renge bindirilmemistir; palet degisse de liste okunur.
 */

import type { Durum } from "@/lib/feature-status";
import { DURUM_LABELS } from "@/lib/feature-status";

/** Simge — renkten bagimsiz sekil ayrimi. Ekran okuyucudan gizlidir. */
export const DURUM_SIMGE: Record<Durum, string> = {
  calisiyor: "●",
  kismi: "◐",
  arayuz: "○",
  yok: "—",
};

/** Kisa etiket — filtre seridi ve dar rozetler icin. */
export const DURUM_KISA: Record<Durum, string> = {
  calisiyor: "Çalışıyor",
  kismi: "Kısmi",
  arayuz: "Arayüz hazır",
  yok: "Henüz yok",
};

/** Sayac altina yazilan bir cumlelik tanim. */
export const DURUM_TANIM: Record<Durum, string> = {
  calisiyor: "Doğrulaması yazılı, uçtan uca işliyor",
  kismi: "İşliyor ama bir parçası eksik",
  arayuz: "Ekranda görünüyor, arkasında işlev yok",
  yok: "Henüz yazılmadı",
};

/** Durum etiketi — metin + simge + duruma ozgu cerceve. */
export function DurumEtiketi({
  durum,
  kisa = false,
}: {
  durum: Durum;
  /** Uzun yerine kisa metin ("Arayüz hazır" gibi). */
  kisa?: boolean;
}) {
  return (
    <span className="durum-etiket" data-durum={durum}>
      <span className="durum-etiket-simge" aria-hidden="true">
        {DURUM_SIMGE[durum]}
      </span>
      <span>{kisa ? DURUM_KISA[durum] : DURUM_LABELS[durum]}</span>
    </span>
  );
}

/**
 * Kanit / eksik / neden satiri — bir <dl> icinde dt/dd cifti olarak basilir.
 * `nasil` "nasil dogrulandi" bilgisidir: iddia degil olcum oldugu icin
 * digerlerinden ayri etiketle, kendi cerceve tipiyle ve okunabilir govde
 * punto ile gosterilir.
 */
export function DurumNotu({
  tur,
  metin,
}: {
  tur: "kanit" | "eksik" | "neden";
  metin: string;
}) {
  const baslik =
    tur === "kanit" ? "Nasıl doğrulandı" : tur === "eksik" ? "Eksik" : "Neden";
  return (
    <>
      <dt className="durum-not-baslik" data-tur={tur}>
        {baslik}
      </dt>
      <dd className="durum-not-metin" data-tur={tur}>
        {metin}
      </dd>
    </>
  );
}
