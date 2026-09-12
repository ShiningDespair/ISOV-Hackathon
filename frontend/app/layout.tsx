import type { Metadata, Viewport } from "next";
import { Libre_Franklin, Source_Serif_4 } from "next/font/google";
import "./globals.css";

import { Masthead } from "@/components/Masthead";
import { ViewProvider, VIEW_BOOTSTRAP_SCRIPT } from "@/components/ViewProvider";
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
      className={`${sourceSerif.variable} ${libreFranklin.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Hidrasyondan önce görünüm tercihini uygula — mizanpaj sıçraması olmasın */}
        <script
          dangerouslySetInnerHTML={{ __html: VIEW_BOOTSTRAP_SCRIPT }}
        />
      </head>
      <body className="min-h-screen bg-paper text-ink antialiased">
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
        </ViewProvider>
      </body>
    </html>
  );
}
