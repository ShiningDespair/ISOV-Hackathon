"use client";

/**
 * MASTHEAD META SATIRI — "Dış Kaynak İzleme"nin altındaki tek satır.
 *
 * Bana Özel akışının durum satırı (pozisyon · düzen · vakit / kalem ·
 * sıralama) eskiden panelin içinde, "Ad Soyad — panelim" başlığının
 * altındaydı. Başlık kaldırıldı, satır künyeye taşındı.
 *
 * Neden portal: `Masthead` sunucu bileşeni ve layout'ta basılıyor; satırın
 * verisi ise sayfanın içinde (`PersonalPanel`) hesaplanıyor. Veriyi layout'a
 * taşımak her sayfada `/auth/me` + profil çekmek demekti. Bunun yerine
 * Masthead boş bir yuva (`#masthead-meta`) basar, panel bu bileşenle oraya
 * yazar. Panelden çıkınca bileşen söküldüğü için satır da kaybolur.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export const MASTHEAD_META_ID = "masthead-meta";

export function MastheadMeta({ parts }: { parts: string[] }) {
  const [yuva, setYuva] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setYuva(document.getElementById(MASTHEAD_META_ID));
  }, []);

  if (!yuva || parts.length === 0) return null;

  return createPortal(
    <p className="masthead-meta-satir">
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 ? (
            <span aria-hidden="true" className="akis-ayrac">
              ·
            </span>
          ) : null}
          {part}
        </span>
      ))}
    </p>,
    yuva,
  );
}
