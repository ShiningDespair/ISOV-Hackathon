"use client";

/**
 * HABER EYLEMLERİ — haberin sağ üstüne konan iki düğme: PAYLAŞ ve GİZLE.
 *
 * Bağımsız ve prop alan bileşen: hiçbir sayfaya bağlı değil, `ArticleCard`
 * gibi mevcut bileşenlerin içine yerleştirilebilir.
 *
 * İYİMSER KALDIRMA ÜÇ KADEMELİ:
 *  1. `onHidden` prop'u verilmişse liste sahibi haberi kendi durumundan
 *     çıkarır (en temizi).
 *  2. Haber `<HidableArticle>` ile sarılmışsa sarmalayıcı kendini gizler ve
 *     yerine "gizlendi · geri al" satırını basar. Sayfa bileşenine dokunmadan
 *     çalışır.
 *  3. İkisi de yoksa eylem şeridi kendi yerinde "gizlendi · geri al" satırına
 *     dönüşür ve haberin yenilemede listeden çıkacağını söyler. Sessizce
 *     hiçbir şey olmamış gibi davranmaz.
 *
 * "GERİ AL" ZORUNLU: yanlışlıkla gizleyen kullanıcı haberi kaybetmemeli.
 */

import { createContext, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { unhideArticle, type HideReason } from "@/lib/api-me";
import { HideDialog } from "./HideDialog";
import { ShareMenu, type PaylasilacakHaber } from "./ShareMenu";

/** Sarmalayıcıdan gelen "beni gizle" çağrısı. */
const GizleContext = createContext<(() => void) | null>(null);

/* ------------------------------------------------------------------ */
/* Geri al satırı                                                      */
/* ------------------------------------------------------------------ */

function GeriAlSatiri({
  articleId,
  onGeriAlindi,
  ekNot,
}: {
  articleId: number;
  onGeriAlindi: () => void;
  ekNot?: string;
}) {
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function geriAl() {
    setHata(null);
    setCalisiyor(true);
    const res = await unhideArticle(articleId);
    setCalisiyor(false);
    if (res.ok) {
      onGeriAlindi();
      return;
    }
    // Sunucu geri almayı kabul etmediyse yerel durumu da geri almak
    // kullanıcıya yalan söylemek olurdu; hata gösterilir.
    setHata(`Geri alınamadı: ${res.error}`);
  }

  return (
    <div className="eylem-gizlendi" role="status" aria-live="polite">
      <span className="eylem-gizlendi-metin">
        Bu haber panelinizden çıkarıldı. Haber silinmedi.
        {ekNot ? ` ${ekNot}` : ""}
      </span>
      <button
        type="button"
        className="eylem-geri-al u-link-underline"
        onClick={geriAl}
        disabled={calisiyor}
      >
        {calisiyor ? "Geri alınıyor…" : "Geri al"}
      </button>
      {hata ? (
        <span className="eylem-bildirim eylem-bildirim-hata" role="alert">
          {hata}
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sarmalayıcı                                                         */
/* ------------------------------------------------------------------ */

/**
 * Haberi (kartı, satırı, bloğu) saran istemci bileşeni. İçindeki
 * `ArticleActions` gizleme başarılı olunca bu sarmalayıcı çocuklarını
 * kaldırır ve yerine geri alma satırını basar.
 */
export function HidableArticle({
  articleId,
  children,
  className,
}: {
  articleId: number;
  children: React.ReactNode;
  className?: string;
}) {
  const [gizli, setGizli] = useState(false);

  if (gizli) {
    return (
      <div className={className}>
        <GeriAlSatiri articleId={articleId} onGeriAlindi={() => setGizli(false)} />
      </div>
    );
  }

  return (
    <GizleContext.Provider value={() => setGizli(true)}>
      <div className={className}>{children}</div>
    </GizleContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Eylem şeridi                                                        */
/* ------------------------------------------------------------------ */

export function ArticleActions({
  haber,
  shareUrl,
  className,
  onHidden,
  compact = false,
}: {
  haber: PaylasilacakHaber;
  /** Paylaşılacak adres; verilmezse haberin kendi adresi kullanılır. */
  shareUrl?: string;
  className?: string;
  /** Liste sahibi haberi kendi durumundan çıkarabilsin diye. */
  onHidden?: (articleId: number, bilgi: { reason: HideReason; note?: string }) => void;
  /** Dar alanlarda yalnızca simgeler — etiketler ekran okuyucuda kalır. */
  compact?: boolean;
}) {
  const sarmalGizle = useContext(GizleContext);
  const [diyalog, setDiyalog] = useState(false);
  const [yerelGizli, setYerelGizli] = useState(false);
  const [monte, setMonte] = useState(false);

  // Portal yalnızca tarayıcıda kurulabilir.
  useEffect(() => setMonte(true), []);

  if (yerelGizli) {
    return (
      <div className={`eylem-kok ${className ?? ""}`.trim()}>
        <GeriAlSatiri
          articleId={haber.id}
          onGeriAlindi={() => setYerelGizli(false)}
          ekNot="Sayfayı yenilediğinizde listeden çıkacak."
        />
      </div>
    );
  }

  const diyalogGovdesi = diyalog ? (
    <HideDialog
      haber={{ id: haber.id, title: haber.title }}
      onClose={() => setDiyalog(false)}
      onHidden={(bilgi) => {
        setDiyalog(false);
        if (onHidden) {
          onHidden(haber.id, bilgi);
          return;
        }
        if (sarmalGizle) {
          sarmalGizle();
          return;
        }
        setYerelGizli(true);
      }}
    />
  ) : null;

  return (
    <div
      className={`eylem-kok ${className ?? ""}`.trim()}
      data-compact={compact ? "true" : "false"}
    >
      <ShareMenu haber={haber} shareUrl={shareUrl} />

      <button
        type="button"
        className="eylem-btn"
        onClick={() => setDiyalog(true)}
        aria-haspopup="dialog"
        title="Bu haber bana uygun değil — panelimden çıkar"
      >
        <span aria-hidden="true" className="eylem-ikon">
          ⊘
        </span>
        <span className="eylem-btn-metin">Gizle</span>
      </button>

      {/* Diyalog gövdeye taşınır: kartların `overflow`/`transform` kuralları
          `position:fixed` örtüyü kırpabiliyor. */}
      {monte && diyalogGovdesi
        ? createPortal(diyalogGovdesi, document.body)
        : null}
    </div>
  );
}

export default ArticleActions;
