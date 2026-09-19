"use client";

/**
 * YÖNETİM PANELİNİN ORTAK PARÇALARI
 *
 * `components/settings/Parts.tsx` (SettingsSection, Field, Notice, Switch,
 * Meter, ChipGroup) YENİDEN KULLANILIR — burada onların kopyası YOKTUR.
 * Bu dosya yalnızca ayarlar sayfasında karşılığı olmayan parçaları tutar:
 * sayı kutusu, rozet, kopyalanabilir kutu, kaydırıcı, sıralanabilir başlık
 * ve sayfalama.
 *
 * Görsel karşılıkları `app/globals.css` sonundaki `yon-` bloğunda. Yeni
 * renk üretilmez; hepsi mevcut jetonlardan (@theme) gelir, böylece koyu
 * tema, yüksek kontrast ve renk körlüğü paletleri kendiliğinden uyar.
 */

import type { ReactNode } from "react";
import { useState } from "react";

/** Tek sayı + etiket + isteğe bağlı alt not. Grafik değil, gazete kutusu. */
export function SayiKutusu({
  etiket,
  deger,
  not,
  vurgu = false,
}: {
  etiket: string;
  deger: string | number;
  not?: ReactNode;
  vurgu?: boolean;
}) {
  return (
    <div className="yon-kutu" data-vurgu={vurgu ? "1" : undefined}>
      <span className="u-kicker block text-ink-faint">{etiket}</span>
      <span className="yon-kutu-deger tabular-nums">{deger}</span>
      {not ? <span className="yon-kutu-not">{not}</span> : null}
    </div>
  );
}

/**
 * Durum rozeti. Renk TEK GÖSTERGE DEĞİL: metin her zaman yazılı ve
 * `data-tur` kenarlık biçimini de değiştirir (kesik / düz / dolgu).
 */
export function Rozet({
  tur,
  children,
}: {
  tur: "notr" | "iyi" | "uyari" | "kotu" | "vurgu";
  children: ReactNode;
}) {
  return (
    <span className="yon-rozet" data-tur={tur}>
      {children}
    </span>
  );
}

/**
 * Kopyalanabilir metin kutusu — şifre sıfırlama bağlantısı için.
 *
 * Panoya yazma bazı tarayıcılarda (HTTP, izin yok) SESSİZCE başarısız
 * olur; bu yüzden metin salt okunur bir `<input>` içinde de duruyor ve
 * elle seçilebiliyor. Kopyalama sonucu `aria-live` ile duyurulur.
 */
export function KopyaKutusu({
  etiket,
  deger,
  aciklama,
}: {
  etiket: string;
  deger: string;
  aciklama?: ReactNode;
}) {
  const [durum, setDurum] = useState<string | null>(null);

  async function kopyala() {
    try {
      await navigator.clipboard.writeText(deger);
      setDurum("Bağlantı panoya kopyalandı.");
    } catch {
      setDurum("Panoya kopyalanamadı. Metni seçip elle kopyalayın.");
    }
  }

  return (
    <div className="yon-kopya">
      <label className="block">
        <span className="u-kicker block text-ink">{etiket}</span>
        <input
          className="ayar-input yon-kopya-girdi"
          type="text"
          readOnly
          value={deger}
          onFocus={(e) => e.currentTarget.select()}
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="ayar-btn" onClick={kopyala}>
          Panoya kopyala
        </button>
        <span aria-live="polite" role="status" className="u-body u-body-soft text-[0.8125rem]">
          {durum}
        </span>
      </div>
      {aciklama ? <p className="ayar-uyari mt-3">{aciklama}</p> : null}
    </div>
  );
}

/**
 * Sayı kaydırıcısı. `<input type="range">` tek başına ekran okuyucuya
 * değeri söyler, ama GÖRSEL olarak da sayı yazılı olmalı — kaydırıcı
 * konumu tek gösterge değil.
 */
export function Kaydirici({
  etiket,
  deger,
  min,
  max,
  adim,
  bicimle,
  aciklama,
  onChange,
  disabled = false,
}: {
  etiket: string;
  deger: number;
  min: number;
  max: number;
  adim: number;
  bicimle?: (v: number) => string;
  aciklama?: ReactNode;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const yazi = bicimle ? bicimle(deger) : String(deger);
  return (
    <div className="ayar-field">
      <label className="block">
        <span className="u-kicker flex items-baseline justify-between gap-3 text-ink">
          <span>{etiket}</span>
          <span className="tabular-nums text-ink">{yazi}</span>
        </span>
        <input
          className="yon-kaydirici"
          type="range"
          min={min}
          max={max}
          step={adim}
          value={deger}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.currentTarget.value))}
        />
      </label>
      {aciklama ? (
        <p className="u-body u-body-soft mt-1 text-[0.8125rem] leading-snug">{aciklama}</p>
      ) : null}
    </div>
  );
}

/**
 * Sıralanabilir tablo başlığı. `aria-sort` `<th>` üzerinde olmak zorunda
 * (düğmede değil) — erişilebilirlik sözleşmesi böyle.
 */
export function SiraliBaslik({
  baslik,
  aktif,
  yon,
  onClick,
  genislik,
}: {
  baslik: string;
  aktif: boolean;
  yon: "asc" | "desc";
  onClick: () => void;
  genislik?: string;
}) {
  return (
    <th
      scope="col"
      style={genislik ? { width: genislik } : undefined}
      aria-sort={aktif ? (yon === "asc" ? "ascending" : "descending") : "none"}
    >
      <button type="button" className="ayar-sort" onClick={onClick}>
        {baslik}
        <span aria-hidden="true">{aktif ? (yon === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}

/** Sayfalama — toplam ve sayfa numarası yazılı, yalnızca ok değil. */
export function Sayfalama({
  page,
  totalPages,
  total,
  birim,
  onChange,
  busy = false,
}: {
  page: number;
  totalPages: number;
  total: number;
  birim: string;
  onChange: (p: number) => void;
  busy?: boolean;
}) {
  if (total === 0) return null;
  return (
    <nav className="yon-sayfalama" aria-label={`${birim} sayfaları`}>
      <button
        type="button"
        className="ayar-btn"
        disabled={busy || page <= 1}
        onClick={() => onChange(page - 1)}
      >
        ← Önceki
      </button>
      <span className="u-kicker text-ink-soft">
        {total.toLocaleString("tr-TR")} {birim} · sayfa {page} / {Math.max(1, totalPages)}
      </span>
      <button
        type="button"
        className="ayar-btn"
        disabled={busy || page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Sonraki →
      </button>
    </nav>
  );
}

/**
 * Yüklenme / hata / boş durum satırı. Tablo ve liste bölümlerinin
 * hepsi aynı üç durumu aynı biçimde gösterir.
 */
export function DurumSatiri({
  yukleniyor,
  hata,
  bosMesaj,
  bos,
}: {
  yukleniyor: boolean;
  hata: string | null;
  bosMesaj: string;
  bos: boolean;
}) {
  if (yukleniyor) {
    return (
      <p className="u-body u-body-soft py-3 text-[0.9375rem]" aria-live="polite">
        Yükleniyor…
      </p>
    );
  }
  if (hata) {
    return (
      <p className="ayar-bildirim my-3" data-tur="hata" role="alert">
        {hata}
      </p>
    );
  }
  if (bos) {
    return <p className="u-body u-body-soft py-3 text-[0.9375rem]">{bosMesaj}</p>;
  }
  return null;
}
