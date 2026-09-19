/**
 * Panelin ortak parçaları: başlık, bilgi notu, bölüm sarmalayıcı ve
 * düzen önizleme bağlantıları.
 */

import Link from "next/link";

import { SectionRule } from "@/components/States";
import {
  LAYOUT_HINTS,
  LAYOUT_LABELS,
  PANEL_LAYOUTS,
  type PanelLayout,
  type TimeBudget,
} from "@/lib/api-panel";

/** Bilgi / uyarı satırı — kullanıcıya durumu dürüstçe söyler. */
export function PanoNotice({
  children,
  tone = "bilgi",
}: {
  children: React.ReactNode;
  tone?: "bilgi" | "uyari";
}) {
  return (
    <p className="pano-bilgi" data-ton={tone} role="status" aria-live="polite">
      {children}
    </p>
  );
}

export function PanoHeader({
  layout,
  positionLabel,
  fullName,
  timeBudget,
  itemCount,
  personalized,
}: {
  layout: PanelLayout;
  positionLabel: string | null;
  fullName: string | null;
  timeBudget: TimeBudget;
  itemCount: number;
  personalized: boolean;
}) {
  return (
    <header className="pano-header">
      <p className="u-kicker u-kicker-accent">
        {positionLabel ?? "Pozisyon bilgisi yok"}
      </p>
      <h1 className="u-headline u-headline-lg mt-1">
        {fullName ? `${fullName} — panelim` : "Panelim"}
      </h1>
      <p className="u-body u-body-soft mt-2 max-w-2xl text-[0.95rem]">
        {LAYOUT_LABELS[layout]} düzeni · {LAYOUT_HINTS[layout]}.{" "}
        <strong className="font-semibold">{timeBudget} dakikalık</strong> vakit
        bütçesi {itemCount} kalem gösteriyor
        {personalized
          ? "; sıralama pozisyonunuza göre kişiselleştirildi."
          : "; sıralama genel önem sırası."}
      </p>
    </header>
  );
}

/** Kural çizgili bölüm — mevcut `SectionRule` yeniden kullanılıyor. */
export function PanoSection({
  title,
  right,
  children,
  id,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section className="pano-bolum" id={id} data-pano-bolum={id}>
      <SectionRule title={title} right={right} />
      {children}
    </section>
  );
}

/**
 * Düzen önizleme bağlantıları.
 *
 * Neden var: dört düzenin tamamı canlı olarak görülebilsin diye. Gerçek
 * düzen `/auth/me` içindeki `layout` alanından gelir; buradaki `?duzen=`
 * parametresi yalnızca ÖNİZLEME içindir ve kullanıcının profilini
 * DEĞİŞTİRMEZ.
 */
export function LayoutPreview({
  active,
  timeBudget,
}: {
  active: PanelLayout;
  timeBudget: TimeBudget;
}) {
  return (
    <nav className="pano-onizleme" aria-label="Panel düzeni önizleme">
      <span className="u-kicker text-ink-faint">Düzen önizleme</span>
      <ul className="pano-onizleme-liste">
        {PANEL_LAYOUTS.map((item) => (
          <li key={item}>
            <Link
              href={`/panelim?duzen=${item}&vakit=${timeBudget}`}
              className="pano-onizleme-baglanti"
              aria-current={item === active ? "page" : undefined}
            >
              {LAYOUT_LABELS[item]}
            </Link>
          </li>
        ))}
      </ul>
      <span className="u-kicker text-ink-faint">Vakit</span>
      <ul className="pano-onizleme-liste">
        {([2, 5, 15] as TimeBudget[]).map((dk) => (
          <li key={dk}>
            <Link
              href={`/panelim?duzen=${active}&vakit=${dk}`}
              className="pano-onizleme-baglanti"
              aria-current={dk === timeBudget ? "page" : undefined}
            >
              {dk} dk
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
