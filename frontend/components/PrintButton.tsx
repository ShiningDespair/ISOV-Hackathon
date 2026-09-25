"use client";

import { useState } from "react";

/**
 * Yazdırma / PDF düğmesi.
 *
 * PDF çıktısı tarayıcının yazdırma penceresinden alınır (Hedef → "PDF olarak
 * kaydet"). Ayrı bir PDF kütüphanesi yüklemiyoruz: sayfanın @media print
 * kuralları zaten A4 gazete mizanpajı üretiyor, tarayıcının kendi PDF motoru
 * da yazı tiplerini ve sütunları olduğu gibi koruyor.
 *
 * NOT: Bu düğme bir süre boş sayfa üretiyordu. Sebebi buton değil, globals.css
 * içindeki öncelik çakışmasıydı — panel görünümündeyken her iki mizanpaj da
 * gizleniyordu. Ayrıntı için globals.css'teki yazdırma bloğunun yorumuna bakın.
 */

export function PrintButton({
  label = "PDF / Yazdır",
}: {
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      title="Açılan pencerede Hedef olarak “PDF olarak kaydet”i seçin"
      className="u-kicker no-print border border-ink px-3 py-1.5 text-ink transition-colors hover:bg-ink hover:text-paper"
    >
      {label}
    </button>
  );
}

/**
 * SUNUCU PDF'İNİ İNDİR — `/api/reports/:id/pdf`.
 *
 * NEDEN AYRI DÜĞME: yukarıdaki düğme yalnızca tarayıcının yazdırma
 * penceresini açıyor. Sunucuda Chromium ile üretilen gerçek PDF (ölçüm:
 * rapor 1 → 5 sayfa, 187 KB, ~4 sn; iki sütun, sayfa numaralı) arayüzden
 * hiç bağlanmamıştı (Burak P2-1, Selin). Yazdır düğmesi kalıyor: ekrandaki
 * mizanpajı basmak isteyen için.
 *
 * NEDEN `fetch` + Blob, düz `<a download>` DEĞİL: Chromium yoksa uç 503 +
 * JSON döner; düz bağlantı o JSON'u "rapor.pdf" diye indirirdi. Burada
 * yanıt denetlenir, hata Türkçe cümleyle yazılır. JS yoksa `href` yine
 * çalışır (ilerleyici geliştirme). Üretim birkaç saniye sürdüğü için
 * "hazırlanıyor" durumu gösterilir. Asla fırlatmaz.
 */
export function PdfDownloadLink({
  reportId,
  label = "PDF indir",
  className,
}: {
  reportId: number | string;
  label?: string;
  className?: string;
}) {
  const [durum, setDurum] = useState<"bos" | "hazirlaniyor" | "hata">("bos");
  const [mesaj, setMesaj] = useState("");
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api").replace(/\/+$/, "");
  const href = `${base}/reports/${encodeURIComponent(String(reportId))}/pdf`;

  async function indir(e: React.MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (durum === "hazirlaniyor") return;
    setDurum("hazirlaniyor");
    setMesaj("PDF hazırlanıyor… (birkaç saniye sürebilir)");
    try {
      const res = await fetch(href, { credentials: "include" });
      const tip = res.headers.get("content-type") ?? "";
      if (!res.ok || !tip.includes("pdf")) {
        let metin = `PDF alınamadı (sunucu ${res.status}).`;
        try {
          const j = (await res.json()) as { error?: { message?: string } };
          if (j?.error?.message) metin = j.error.message;
        } catch {
          /* gövde JSON değil — genel cümle kalır */
        }
        if (res.status === 401) metin = "PDF için oturum gerekiyor; lütfen yeniden giriş yapın.";
        setDurum("hata");
        setMesaj(metin);
        return;
      }
      const blob = await res.blob();
      const disp = res.headers.get("content-disposition") ?? "";
      const ad = /filename="([^"]+)"/.exec(disp)?.[1] ?? `isov-rapor-${reportId}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = ad;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      const sayfa = res.headers.get("x-pdf-pages");
      setDurum("bos");
      setMesaj(`PDF indirildi${sayfa ? ` (${sayfa} sayfa)` : ""}.`);
    } catch {
      setDurum("hata");
      setMesaj("PDF indirilemedi: sunucuya ulaşılamadı.");
    }
  }

  return (
    <span className="tarih-pdf no-print">
      <a
        href={href}
        onClick={indir}
        className={
          className ??
          "u-kicker tarih-pdf-bag border border-ink bg-ink px-3 py-1.5 text-paper transition-colors hover:bg-paper hover:text-ink"
        }
        aria-busy={durum === "hazirlaniyor" ? true : undefined}
        title="Sunucuda üretilen basıma hazır PDF'i indirir"
      >
        <span aria-hidden="true">⤓ </span>
        {durum === "hazirlaniyor" ? "Hazırlanıyor…" : label}
      </a>
      <span className="tarih-pdf-durum" role="status" aria-live="polite" data-hata={durum === "hata" ? "true" : "false"}>
        {mesaj}
      </span>
    </span>
  );
}
