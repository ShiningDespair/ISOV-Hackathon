/**
 * KAYNAK AMBLEMİ — satır içi SVG yer tutucu (docs/SADELESTIRME.md §5).
 *
 * Haberin kendi `image_url`'i yoksa (131 haberin 51'i) boş kutu yerine
 * kaynağa özgü tipografik amblem basılır. Tasarım kararlarının GEREKÇESİ:
 *
 *   - Neden SUNUCU bileşeni: state yok, olay yok. `"use client"` koymak
 *     istemci paketini büyütür, karşılığında hiçbir şey vermez. Plan saf bir
 *     fonksiyondan geldiği için sunucu çıktısı ile istemci çıktısı birebir aynı.
 *   - Neden ağ isteği / dış dosya / `next/image` YOK: kaynak host'lar önceden
 *     bilinmiyor (`next.config.ts`'te `remotePatterns` tanımlı değil), CSP dış
 *     CDN'e kapalı ve bu amblemlerin PDF çıktısında (puppeteer + `@media print`)
 *     da görünmesi gerekiyor. Satır içi SVG üçünü birden çözer: HTML ile aynı
 *     istekte gelir, harici kaynak istemez ve SVG dolguları CSS arka planı
 *     olmadığı için yazdırmada da basılır.
 *   - Neden `var(--color-*)` inline `style` ile: SVG sunum niteliği
 *     (`fill="..."`) yerine `style` kullanıldı; böylece `color-mix()` ve CSS
 *     değişkenleri her tarayıcıda kesin çalışır ve erişilebilirlik temaları
 *     (koyu / yüksek kontrast / renk körlüğü) jetonları değiştirdiğinde
 *     amblem de birlikte döner.
 *
 * Erişilebilirlik:
 *   - Dekoratif. Haberin başlığı ve kaynak adı hemen yanında METİN olarak
 *     zaten var; ekran okuyucuya ikinci kez okutmuyoruz. Bu yüzden yalnızca
 *     `aria-hidden="true"` var — `role="img"` EKLENMEZ, ikisi çelişir
 *     (gizlenen bir öğeye erişilebilir rol vermek anlamsızdır).
 *   - `data-a11y-image` niteliği TAŞINIR: "Görselleri gizle" ayarı
 *     (`globals.css` → `html[data-a11y-images="gizli"] [data-a11y-image]`)
 *     bu niteliği hedefliyor. Taşınmazsa o ayar sessizce bozulur.
 */

import type { CSSProperties, ReactNode } from "react";

import {
  metinOlcegi,
  sourceArtPlan,
  type SourceArtInput,
  type SourceArtPlan,
} from "@/lib/source-art";

/** viewBox ölçüleri — `.gorsel-ratio-*` sınıflarıyla BİREBİR aynı oran. */
const OLCU = {
  lead: { w: 1600, h: 900 }, // 16:9  → .gorsel-ratio-lead
  card: { w: 1200, h: 900 }, // 4:3   → .gorsel-ratio-card
} as const;

export interface SourceArtworkProps extends SourceArtInput {
  /** Çerçeve oranı — `ArticleImage` ile aynı sözleşme. */
  ratio?: "lead" | "card";
  className?: string;
}

// =====================================================================
// Ortak çizim yardımcıları
// =====================================================================

type Aile = "sans" | "serif";

/**
 * Ortalanmış SVG metni.
 *
 * `letter-spacing` ile birlikte `text-anchor="middle"` kullanıldığında
 * tarayıcı SON harften sonra da boşluk sayar; metin yarım boşluk sola kayar.
 * `x + aralik / 2` bunu telafi ediyor.
 */
function Metin({
  x,
  y,
  boyut,
  aralik = 0,
  renk,
  aile = "sans",
  agirlik = 700,
  children,
}: {
  x: number;
  y: number;
  boyut: number;
  aralik?: number;
  renk: string;
  aile?: Aile;
  agirlik?: number;
  children: ReactNode;
}) {
  return (
    <text
      x={x + aralik / 2}
      y={y}
      textAnchor="middle"
      style={{
        fill: renk,
        fontFamily: aile === "serif" ? "var(--font-serif)" : "var(--font-sans)",
        fontSize: `${boyut}px`,
        fontWeight: agirlik,
        letterSpacing: `${aralik}px`,
      }}
    >
      {children}
    </text>
  );
}

/** Yatay kural çizgisi. */
function Kural({
  x1,
  x2,
  y,
  renk,
  kalinlik = 1,
}: {
  x1: number;
  x2: number;
  y: number;
  renk: string;
  kalinlik?: number;
}) {
  return (
    <line
      x1={x1}
      x2={x2}
      y1={y}
      y2={y}
      style={{ stroke: renk, strokeWidth: kalinlik }}
    />
  );
}

/** Dış çerçeve; `ciftCerceve` ise resmî belge hissi veren ikinci ince kural. */
function Cerceve({
  plan,
  w,
  h,
  pad,
}: {
  plan: SourceArtPlan;
  w: number;
  h: number;
  pad: number;
}) {
  return (
    <>
      <rect
        x={pad}
        y={pad}
        width={w - 2 * pad}
        height={h - 2 * pad}
        style={{
          fill: "none",
          stroke: plan.palet.cerceve,
          strokeWidth: plan.ciftCerceve ? 4 : 2,
        }}
      />
      {plan.ciftCerceve ? (
        <rect
          x={pad + 14}
          y={pad + 14}
          width={w - 2 * pad - 28}
          height={h - 2 * pad - 28}
          style={{ fill: "none", stroke: plan.palet.cerceve, strokeWidth: 1 }}
        />
      ) : null}
    </>
  );
}

/** Üst kicker — "T.C.", "BASIN", "AÇIK VERİ" gibi. */
function UstSatir({
  plan,
  w,
  h,
  pad,
  genislik,
}: {
  plan: SourceArtPlan;
  w: number;
  h: number;
  pad: number;
  genislik: number;
}) {
  if (!plan.ustSatir) return null;
  const o = metinOlcegi(plan.ustSatir, genislik, h * 0.044, 0.22);
  return (
    <Metin
      x={w / 2}
      y={pad + h * 0.1}
      boyut={o.boyut}
      aralik={o.aralik}
      renk={plan.palet.ikincil}
    >
      {plan.ustSatir}
    </Metin>
  );
}

/** Alt satır — "SAYI 32123", "TÜRKİYE", kurum açıklaması. */
function AltSatir({
  plan,
  w,
  y,
  genislik,
  hedef,
  renk,
}: {
  plan: SourceArtPlan;
  w: number;
  y: number;
  genislik: number;
  hedef: number;
  renk: string;
}) {
  if (!plan.altSatir) return null;
  const o = metinOlcegi(plan.altSatir, genislik, hedef, 0.14);
  return (
    <Metin x={w / 2} y={y} boyut={o.boyut} aralik={o.aralik} renk={renk}>
      {plan.altSatir}
    </Metin>
  );
}

/**
 * Monogram ile kısa ad aynıysa ("KOSGEB" / "KOSGEB") ikisini birlikte
 * basmak amblemi tekrara düşürür; ad satırı atlanır.
 */
function adSatiriGerekli(plan: SourceArtPlan): boolean {
  const sadelestir = (s: string) => s.replace(/[\s.]+/g, "").toLowerCase();
  return sadelestir(plan.monogram) !== sadelestir(plan.kisaAd);
}

// =====================================================================
// MOTİF 1 — mevzuat: resmî belge
// =====================================================================
// Çift kural çerçevesi, üstte kurum adı ("T.C."), ortada künye yazısı,
// altında kalın+ince kural çifti, en altta tarih/sayı ve mühür hissi veren
// dairesel form. Kullanıcının verdiği örnek bu motif: Resmî Gazete künyesi
// + sayı numarası (bulunamazsa tarih — sayı UYDURULMAZ).

function MotifMevzuat({
  plan,
  w,
  h,
  pad,
  genislik,
}: {
  plan: SourceArtPlan;
  w: number;
  h: number;
  pad: number;
  genislik: number;
}) {
  const cx = w / 2;
  const ad = metinOlcegi(plan.kisaAd, genislik, h * 0.155, 0.06);
  const muhurR = h * 0.082;
  const muhurCy = h * 0.795;
  const mono = metinOlcegi(plan.monogram, muhurR * 1.25, muhurR * 0.74, 0.04);

  // Mühür tırtıkları: 24 kısa radyal çizgi. Dekoratif, deterministik.
  const tirtiklar = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    const r1 = muhurR * 0.84;
    const r2 = muhurR * 0.97;
    return (
      <line
        key={i}
        x1={cx + Math.cos(a) * r1}
        y1={muhurCy + Math.sin(a) * r1}
        x2={cx + Math.cos(a) * r2}
        y2={muhurCy + Math.sin(a) * r2}
        style={{ stroke: plan.palet.motif, strokeWidth: 2 }}
      />
    );
  });

  return (
    <>
      <Cerceve plan={plan} w={w} h={h} pad={pad} />
      <UstSatir plan={plan} w={w} h={h} pad={pad} genislik={genislik} />
      <Kural
        x1={cx - h * 0.09}
        x2={cx + h * 0.09}
        y={pad + h * 0.15}
        renk={plan.palet.vurgu}
        kalinlik={2}
      />

      <Metin
        x={cx}
        y={h * 0.47}
        boyut={ad.boyut}
        aralik={ad.aralik}
        renk={plan.palet.murekkep}
        aile="serif"
        agirlik={900}
      >
        {plan.kisaAd}
      </Metin>

      <Kural
        x1={pad + h * 0.06}
        x2={w - pad - h * 0.06}
        y={h * 0.55}
        renk={plan.palet.cerceve}
        kalinlik={5}
      />
      <Kural
        x1={pad + h * 0.06}
        x2={w - pad - h * 0.06}
        y={h * 0.575}
        renk={plan.palet.cerceve}
        kalinlik={1}
      />

      <AltSatir
        plan={plan}
        w={w}
        y={h * 0.665}
        genislik={genislik}
        hedef={h * 0.05}
        renk={plan.palet.murekkep}
      />

      <circle
        cx={cx}
        cy={muhurCy}
        r={muhurR}
        style={{ fill: "none", stroke: plan.palet.vurgu, strokeWidth: 2 }}
      />
      <circle
        cx={cx}
        cy={muhurCy}
        r={muhurR * 0.78}
        style={{ fill: "none", stroke: plan.palet.motif, strokeWidth: 1 }}
      />
      {tirtiklar}
      <Metin
        x={cx}
        y={muhurCy + mono.boyut * 0.35}
        boyut={mono.boyut}
        aralik={mono.aralik}
        renk={plan.palet.murekkep}
        aile="serif"
        agirlik={800}
      >
        {plan.monogram}
      </Metin>
    </>
  );
}

// =====================================================================
// MOTİF 2 — kurum: kalkan / mühür silueti + monogram
// =====================================================================

function MotifKurum({
  plan,
  w,
  h,
  pad,
  genislik,
}: {
  plan: SourceArtPlan;
  w: number;
  h: number;
  pad: number;
  genislik: number;
}) {
  const cx = w / 2;
  const ust = h * 0.21;
  const yarimGen = h * 0.175;
  const yuk = h * 0.35;

  /** Kalkan yolu: üstte düz kenar, altta iki eğri ile birleşen uç. */
  const kalkan = (g: number, y: number, yy: number) =>
    [
      `M ${cx - g} ${y}`,
      `H ${cx + g}`,
      `V ${y + yy * 0.54}`,
      `C ${cx + g} ${y + yy * 0.86}, ${cx + g * 0.42} ${y + yy}, ${cx} ${y + yy}`,
      `C ${cx - g * 0.42} ${y + yy}, ${cx - g} ${y + yy * 0.86}, ${cx - g} ${y + yy * 0.54}`,
      "Z",
    ].join(" ");

  // 1,3 katsayisi olcumle bulundu: 1,55 ile "TÜBİTAK" kalkan kenarina degiyordu.
  const mono = metinOlcegi(plan.monogram, yarimGen * 1.3, h * 0.135, 0.04);
  const adVar = adSatiriGerekli(plan);
  const ad = metinOlcegi(plan.kisaAd, genislik, h * 0.082, 0.1);
  // Ad satırı basılmıyorsa (monogram = kısa ad) kalkan ile alt satır arasında
  // büyük bir boşluk kalıyordu; kural ve alt satır yukarı çekiliyor.
  const kuralY = adVar ? h * 0.775 : h * 0.685;
  const altY = adVar ? h * 0.865 : h * 0.78;

  return (
    <>
      <Cerceve plan={plan} w={w} h={h} pad={pad} />
      <UstSatir plan={plan} w={w} h={h} pad={pad} genislik={genislik} />

      <path
        d={kalkan(yarimGen, ust, yuk)}
        style={{ fill: "none", stroke: plan.palet.cerceve, strokeWidth: 3 }}
      />
      <path
        d={kalkan(yarimGen - 12, ust + 12, yuk - 22)}
        style={{ fill: "none", stroke: plan.palet.motif, strokeWidth: 1 }}
      />
      <Metin
        x={cx}
        y={ust + yuk * 0.5 + mono.boyut * 0.34}
        boyut={mono.boyut}
        aralik={mono.aralik}
        renk={plan.palet.murekkep}
        aile="serif"
        agirlik={900}
      >
        {plan.monogram}
      </Metin>

      {adVar ? (
        <Metin
          x={cx}
          y={h * 0.715}
          boyut={ad.boyut}
          aralik={ad.aralik}
          renk={plan.palet.murekkep}
          aile="serif"
          agirlik={800}
        >
          {plan.kisaAd}
        </Metin>
      ) : null}

      <Kural
        x1={cx - h * 0.07}
        x2={cx + h * 0.07}
        y={kuralY}
        renk={plan.palet.vurgu}
        kalinlik={2}
      />
      <AltSatir
        plan={plan}
        w={w}
        y={altY}
        genislik={genislik}
        hedef={h * 0.042}
        renk={plan.palet.ikincil}
      />
    </>
  );
}

// =====================================================================
// MOTİF 3 — açık veri: ızgara + çubuk izi
// =====================================================================
// DİKKAT: Buradaki çubuklar DEKORATİFTİR, GERÇEK VERİ DEĞİLDİR. Yükseklikler
// slug karmasından deterministik olarak üretiliyor. Yer tutucuya gerçek
// görünümlü ama uydurma bir grafik basmak kullanıcıyı yanıltır; bu yüzden
// çubuklar soluk "motif" tonunda, eksen/etiket/sayı OLMADAN çiziliyor —
// bir grafik değil, grafik dokusu.

function MotifAcikVeri({
  plan,
  w,
  h,
  pad,
  genislik,
}: {
  plan: SourceArtPlan;
  w: number;
  h: number;
  pad: number;
  genislik: number;
}) {
  const cx = w / 2;
  const icX = pad + 1;
  const icGen = w - 2 * pad - 2;

  const dikeyler = Array.from({ length: 11 }, (_, i) => (
    <line
      key={`d${i}`}
      x1={icX + (icGen * (i + 1)) / 12}
      x2={icX + (icGen * (i + 1)) / 12}
      y1={pad}
      y2={h - pad}
      style={{ stroke: plan.palet.motif, strokeWidth: 1 }}
    />
  ));
  const yataylar = Array.from({ length: 7 }, (_, i) => (
    <line
      key={`y${i}`}
      x1={pad}
      x2={w - pad}
      y1={pad + ((h - 2 * pad) * (i + 1)) / 8}
      y2={pad + ((h - 2 * pad) * (i + 1)) / 8}
      style={{ stroke: plan.palet.motif, strokeWidth: 1 }}
    />
  ));

  const tabanY = h * 0.855;
  const bantYuk = h * 0.16;
  const cubukSayisi = 9;
  const cubukGen = (icGen * 0.62) / (cubukSayisi * 1.6);
  const cubukBas = cx - (cubukSayisi * cubukGen * 1.6) / 2 + cubukGen * 0.3;
  const cubuklar = Array.from({ length: cubukSayisi }, (_, i) => {
    const v = (plan.tohum * (i + 3) * 37 + i * 11) % 100;
    const yuk = bantYuk * (0.22 + 0.78 * (v / 100));
    return (
      <rect
        key={`c${i}`}
        x={cubukBas + i * cubukGen * 1.6}
        y={tabanY - yuk}
        width={cubukGen}
        height={yuk}
        style={{ fill: plan.palet.motif }}
      />
    );
  });

  const mono = metinOlcegi(plan.monogram, genislik * 0.8, h * 0.2, 0.05);
  const adVar = adSatiriGerekli(plan);
  const ad = metinOlcegi(plan.kisaAd, genislik, h * 0.078, 0.1);

  return (
    <>
      {dikeyler}
      {yataylar}
      <Cerceve plan={plan} w={w} h={h} pad={pad} />
      <UstSatir plan={plan} w={w} h={h} pad={pad} genislik={genislik} />

      <Metin
        x={cx}
        y={h * 0.44}
        boyut={mono.boyut}
        aralik={mono.aralik}
        renk={plan.palet.murekkep}
        aile="serif"
        agirlik={900}
      >
        {plan.monogram}
      </Metin>

      {adVar ? (
        <Metin
          x={cx}
          y={h * 0.55}
          boyut={ad.boyut}
          aralik={ad.aralik}
          renk={plan.palet.murekkep}
          aile="serif"
          agirlik={800}
        >
          {plan.kisaAd}
        </Metin>
      ) : null}

      <AltSatir
        plan={plan}
        w={w}
        y={h * 0.645}
        genislik={genislik}
        hedef={h * 0.042}
        renk={plan.palet.ikincil}
      />

      {cubuklar}
      <Kural
        x1={cubukBas - cubukGen * 0.4}
        x2={cubukBas + cubukSayisi * cubukGen * 1.6}
        y={tabanY}
        renk={plan.palet.cerceve}
        kalinlik={2}
      />
    </>
  );
}

// =====================================================================
// MOTİF 4 — basın: gazete manşeti
// =====================================================================

function MotifBasin({
  plan,
  w,
  h,
  pad,
  genislik,
}: {
  plan: SourceArtPlan;
  w: number;
  h: number;
  pad: number;
  genislik: number;
}) {
  const cx = w / 2;
  const icX = pad + h * 0.03;
  const icGen = w - 2 * icX;
  const kolon = 4;
  const kolonGen = icGen / kolon;
  const metinUst = h * 0.665;
  const metinAlt = h - pad - h * 0.035;

  // Kolon kuralları (sütun araları) — gazete sayfası dokusu.
  const kolonKurallari = Array.from({ length: kolon - 1 }, (_, i) => (
    <line
      key={`k${i}`}
      x1={icX + kolonGen * (i + 1)}
      x2={icX + kolonGen * (i + 1)}
      y1={metinUst - h * 0.02}
      y2={metinAlt}
      style={{ stroke: plan.palet.motif, strokeWidth: 1 }}
    />
  ));

  // Satır izleri: uzunlukları tohumdan deterministik, okunacak metin değil.
  const satirSayisi = 5;
  const satirlar: ReactNode[] = [];
  for (let c = 0; c < kolon; c++) {
    for (let r = 0; r < satirSayisi; r++) {
      const v = (plan.tohum * (c + 2) * 17 + r * 29) % 100;
      const uzunluk = kolonGen * (0.52 + 0.3 * (v / 100));
      satirlar.push(
        <rect
          key={`s${c}-${r}`}
          x={icX + kolonGen * c + kolonGen * 0.09}
          y={metinUst + ((metinAlt - metinUst) * r) / satirSayisi}
          width={uzunluk}
          height={Math.max(3, h * 0.009)}
          style={{ fill: plan.palet.motif }}
        />,
      );
    }
  }

  const ad = metinOlcegi(plan.kisaAd, genislik, h * 0.15, 0.04);

  return (
    <>
      <Cerceve plan={plan} w={w} h={h} pad={pad} />
      <UstSatir plan={plan} w={w} h={h} pad={pad} genislik={genislik} />

      <Kural x1={icX} x2={w - icX} y={h * 0.3} renk={plan.palet.cerceve} kalinlik={6} />
      <Kural x1={icX} x2={w - icX} y={h * 0.325} renk={plan.palet.cerceve} kalinlik={1} />

      <Metin
        x={cx}
        y={h * 0.475}
        boyut={ad.boyut}
        aralik={ad.aralik}
        renk={plan.palet.murekkep}
        aile="serif"
        agirlik={900}
      >
        {plan.kisaAd}
      </Metin>

      <Kural x1={icX} x2={w - icX} y={h * 0.535} renk={plan.palet.cerceve} kalinlik={6} />
      <Kural x1={icX} x2={w - icX} y={h * 0.56} renk={plan.palet.cerceve} kalinlik={1} />

      <AltSatir
        plan={plan}
        w={w}
        y={h * 0.625}
        genislik={genislik}
        hedef={h * 0.04}
        renk={plan.palet.ikincil}
      />

      {kolonKurallari}
      {satirlar}
    </>
  );
}

// =====================================================================
// MOTİF 5 — uluslararası: küre / meridyen ızgarası
// =====================================================================

function MotifUluslararasi({
  plan,
  w,
  h,
  pad,
  genislik,
}: {
  plan: SourceArtPlan;
  w: number;
  h: number;
  pad: number;
  genislik: number;
}) {
  const cx = w / 2;
  const cy = h * 0.39;
  const r = h * 0.2;
  const mono = metinOlcegi(plan.monogram, r * 1.7, h * 0.1, 0.04);
  const adVar = adSatiriGerekli(plan);
  const ad = metinOlcegi(plan.kisaAd, genislik, h * 0.085, 0.1);
  // Ad satırı yoksa küre ile alt satır arasındaki boşluk kapatılıyor.
  const kuralY = adVar ? h * 0.775 : h * 0.685;
  const altY = adVar ? h * 0.865 : h * 0.78;

  // Enlem kirişleri: y = cy ± r*k, yarı genişlik r*sqrt(1-k²).
  const enlemler = [0.45, -0.45, 0.78, -0.78].map((k, i) => {
    const yg = r * Math.sqrt(Math.max(0, 1 - k * k));
    return (
      <line
        key={`e${i}`}
        x1={cx - yg}
        x2={cx + yg}
        y1={cy + r * k}
        y2={cy + r * k}
        style={{ stroke: plan.palet.motif, strokeWidth: 1.5 }}
      />
    );
  });

  return (
    <>
      <Cerceve plan={plan} w={w} h={h} pad={pad} />
      <UstSatir plan={plan} w={w} h={h} pad={pad} genislik={genislik} />

      <circle
        cx={cx}
        cy={cy}
        r={r}
        style={{ fill: "none", stroke: plan.palet.cerceve, strokeWidth: 3 }}
      />
      {[0.34, 0.68].map((k, i) => (
        <ellipse
          key={`m${i}`}
          cx={cx}
          cy={cy}
          rx={r * k}
          ry={r}
          style={{ fill: "none", stroke: plan.palet.motif, strokeWidth: 1.5 }}
        />
      ))}
      <line
        x1={cx}
        x2={cx}
        y1={cy - r}
        y2={cy + r}
        style={{ stroke: plan.palet.motif, strokeWidth: 1.5 }}
      />
      {enlemler}

      {/* Monogram kürenin üstünde okunsun diye arkasına zemin şeridi. */}
      <ellipse
        cx={cx}
        cy={cy}
        rx={mono.boyut * plan.monogram.length * 0.38 + 14}
        ry={mono.boyut * 0.78}
        style={{ fill: plan.palet.zemin }}
      />
      <Metin
        x={cx}
        y={cy + mono.boyut * 0.35}
        boyut={mono.boyut}
        aralik={mono.aralik}
        renk={plan.palet.murekkep}
        aile="serif"
        agirlik={900}
      >
        {plan.monogram}
      </Metin>

      {adVar ? (
        <Metin
          x={cx}
          y={h * 0.715}
          boyut={ad.boyut}
          aralik={ad.aralik}
          renk={plan.palet.murekkep}
          aile="serif"
          agirlik={800}
        >
          {plan.kisaAd}
        </Metin>
      ) : null}

      <Kural
        x1={cx - h * 0.07}
        x2={cx + h * 0.07}
        y={kuralY}
        renk={plan.palet.vurgu}
        kalinlik={2}
      />
      <AltSatir
        plan={plan}
        w={w}
        y={altY}
        genislik={genislik}
        hedef={h * 0.042}
        renk={plan.palet.ikincil}
      />
    </>
  );
}

// =====================================================================
// MOTİF 6 — monogram: sade tipografik blok (kademe 3 / "diger")
// =====================================================================

function MotifMonogram({
  plan,
  w,
  h,
  pad,
  genislik,
}: {
  plan: SourceArtPlan;
  w: number;
  h: number;
  pad: number;
  genislik: number;
}) {
  const cx = w / 2;
  const mono = metinOlcegi(plan.monogram, genislik * 0.85, h * 0.3, 0.02);
  const adVar = adSatiriGerekli(plan);
  const ad = metinOlcegi(plan.kisaAd, genislik, h * 0.085, 0.1);

  return (
    <>
      <Cerceve plan={plan} w={w} h={h} pad={pad} />
      <UstSatir plan={plan} w={w} h={h} pad={pad} genislik={genislik} />

      <Metin
        x={cx}
        y={h * 0.53}
        boyut={mono.boyut}
        aralik={mono.aralik}
        renk={plan.palet.murekkep}
        aile="serif"
        agirlik={900}
      >
        {plan.monogram}
      </Metin>

      <Kural
        x1={cx - h * 0.09}
        x2={cx + h * 0.09}
        y={h * 0.62}
        renk={plan.palet.vurgu}
        kalinlik={2}
      />

      {adVar ? (
        <Metin
          x={cx}
          y={h * 0.735}
          boyut={ad.boyut}
          aralik={ad.aralik}
          renk={plan.palet.murekkep}
          aile="serif"
          agirlik={800}
        >
          {plan.kisaAd}
        </Metin>
      ) : null}

      <AltSatir
        plan={plan}
        w={w}
        y={h * 0.855}
        genislik={genislik}
        hedef={h * 0.042}
        renk={plan.palet.ikincil}
      />
    </>
  );
}

// =====================================================================
// Bileşen
// =====================================================================

export function SourceArtwork({
  ratio = "card",
  className = "",
  ...girdi
}: SourceArtworkProps) {
  const plan = sourceArtPlan(girdi);
  const { w, h } = ratio === "lead" ? OLCU.lead : OLCU.card;
  const ratioClass = ratio === "lead" ? "gorsel-ratio-lead" : "gorsel-ratio-card";

  // Kenar boşluğu YÜKSEKLİĞE bağlı: iki oranda da aynı optik pay kalsın.
  const pad = Math.round(h * 0.075);
  // Metin için kullanılabilir genişlik — çerçeveden içeride güvenli pay.
  const genislik = w - 2 * pad - h * 0.1;

  const ortak = { plan, w, h, pad, genislik };
  let motif: ReactNode;
  switch (plan.motif) {
    case "mevzuat":
      motif = <MotifMevzuat {...ortak} />;
      break;
    case "kurum":
      motif = <MotifKurum {...ortak} />;
      break;
    case "acik_veri":
      motif = <MotifAcikVeri {...ortak} />;
      break;
    case "basin":
      motif = <MotifBasin {...ortak} />;
      break;
    case "uluslararasi":
      motif = <MotifUluslararasi {...ortak} />;
      break;
    default:
      motif = <MotifMonogram {...ortak} />;
      break;
  }

  // `--kaynak-zemin`: kaynak/amblem zemini CSS'e de veriliyor; kaynak.css
  // `.gorsel-frame[data-kaynak-amblem="true"]` ile çerçeve arkasını aynı
  // tona boyuyor, böylece SVG henüz boyanmadan `paper-deep` parlaması olmuyor.
  const cerceveStil = { "--kaynak-zemin": plan.palet.zemin } as CSSProperties;

  return (
    <div
      data-a11y-image
      aria-hidden="true"
      data-kaynak-amblem="true"
      data-kaynak-kademe={plan.kademe}
      data-kaynak-motif={plan.motif}
      className={`gorsel-frame kaynak-amblem ${ratioClass} ${className}`}
      style={cerceveStil}
    >
      {/* `preserveAspectRatio`: `slice`, `meet` DEĞİL. viewBox oranı
          `.gorsel-ratio-*` ile birebir aynı olduğu için kırpma olmuyor; ama
          alt piksel yuvarlamasında `meet` çerçevenin altında 1-2 px'lik boş
          şerit bırakıyordu (ölçüldü, ekran görüntüsüyle doğrulandı). `slice`
          çerçeveyi her zaman tam doldurur, içerik zaten geniş paylarla
          ortalanmış olduğu için görünür bir kayıp yok. */}
      <svg
        className="kaynak-amblem-svg"
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        <rect x="0" y="0" width={w} height={h} style={{ fill: plan.palet.zemin }} />
        {motif}
      </svg>
    </div>
  );
}
