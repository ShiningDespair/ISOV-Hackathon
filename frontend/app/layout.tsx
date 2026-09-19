import type { Metadata, Viewport } from "next";
import {
  Atkinson_Hyperlegible,
  Lexend,
  Libre_Franklin,
  Source_Serif_4,
} from "next/font/google";
import "./globals.css";

import { Masthead } from "@/components/Masthead";
import { ViewProvider, VIEW_BOOTSTRAP_SCRIPT } from "@/components/ViewProvider";
import { A11yProvider, A11Y_BOOTSTRAP_SCRIPT } from "@/components/A11yProvider";
import { A11yWidget } from "@/components/A11yWidget";
import { ReadingRuler } from "@/components/ReadingRuler";
import { SiteFooter } from "@/components/SiteFooter";

/* NYT tipografisi:
   - Başlık ve gövde: Source Serif 4 (Cheltenham'a en yakın erişilebilir serif)
   - Kicker / meta / etiket: Libre Franklin (NYT Franklin ailesinin açık karşılığı) */
const sourceSerif = Source_Serif_4({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700", "900"],
  style: ["normal", "italic"],
  variable: "--font-source-serif",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

const libreFranklin = Libre_Franklin({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700"],
  variable: "--font-libre-franklin",
  display: "swap",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
});

/* Erişilebilirlik yazı tipleri.
   Atkinson Hyperlegible: Braille Institute'ün az görenler için tasarladığı,
   birbirine benzeyen harfleri (I/l/1, O/0) kasten ayrıştıran aile.
   Lexend: okuma akıcılığını artırmak üzere tasarlandı, disleksi desteği için.
   İkisi de self-host edilir — CSP açısından dış CDN'e gidilmez. */
const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-atkinson",
  display: "swap",
  fallback: ["Verdana", "Tahoma", "sans-serif"],
});

const lexend = Lexend({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-lexend",
  display: "swap",
  fallback: ["Verdana", "Tahoma", "sans-serif"],
});

export const metadata: Metadata = {
  title: {
    default: "İSO · İSOV Dış Kaynak İzleme",
    template: "%s — İSO · İSOV Dış Kaynak İzleme",
  },
  description:
    "İstanbul Sanayi Odası ve İSOV için açık kaynaklardan toplanan, tekilleştirilen ve önem derecesine göre sıralanan haber bülteni.",
  applicationName: "İSO · İSOV Dış Kaynak İzleme",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f7f5",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="tr"
      data-view="panel"
      className={`${sourceSerif.variable} ${libreFranklin.variable} ${atkinson.variable} ${lexend.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Hidrasyondan önce görünüm tercihini uygula — mizanpaj sıçraması olmasın */}
        <script
          dangerouslySetInnerHTML={{ __html: VIEW_BOOTSTRAP_SCRIPT }}
        />
        {/* Erişilebilirlik tercihlerini de ilk boyamadan önce uygula —
            yazı boyutu / tema sıçraması olmasın */}
        <script
          dangerouslySetInnerHTML={{ __html: A11Y_BOOTSTRAP_SCRIPT }}
        />
      </head>
      <body className="min-h-screen bg-paper text-ink antialiased">
        <A11yProvider>
          <ViewProvider>
            {/* Klavye kullanıcıları için içeriğe atlama bağlantısı */}
            <a
              href="#icerik"
              className="u-kicker sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:border focus:border-ink focus:bg-surface focus:px-3 focus:py-2 focus:text-ink"
            >
              İçeriğe geç
            </a>
            <Masthead />
            <main id="icerik">{children}</main>
            <SiteFooter />
            {/* Her sayfada erişilebilir: yüzen erişilebilirlik düğmesi ve
                okuma cetveli. Yazdırmada ikisi de gizlenir. */}
            <A11yWidget />
            <ReadingRuler />
          </ViewProvider>
        </A11yProvider>
      </body>
    </html>
  );
}
