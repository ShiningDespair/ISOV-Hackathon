"use client";

/**
 * YAPILACAKLAR → CSV (Excel) DIŞA AKTARIMI.
 *
 * NEDEN: Burak'ın (İSOV teşvik uzmanı) "her gün kullanmam için tek şey"i:
 * pazartesi e-postasını Excel'de hazırlıyor; kalemleri elle kopyalamak
 * 2 saatlik işin büyük kısmı.
 *
 * NEDEN İSTEMCİDE: veri zaten sayfada; sunucuya ikinci bir uç gerekmez.
 * `Blob` + geçici `<a download>` yeterli.
 *
 * EXCEL AYRINTILARI (ölçülen tuzaklar):
 *  - UTF-8 BOM (﻿) olmadan Excel dosyayı Windows-1254/1252 sanıp
 *    "TÃœBÄ°TAK" basar.
 *  - Türkçe bölge ayarında Excel liste ayırıcısı `;` — virgülle ayrılmış
 *    dosya tek sütuna yığılır.
 *  - Satır sonu CRLF; alan içinde `;`, `"` ya da satır sonu varsa tırnak.
 *  - `=`, `+`, `-`, `@` ile başlayan hücre formül olarak çalıştırılır (CSV
 *    enjeksiyonu); başına `'` eklenir. Başlıklar dış kaynaklardan geliyor.
 *
 * Asla fırlatmaz: tarayıcı Blob desteklemiyorsa düğme sessizce iş görmez
 * ve durum satırında söyler.
 */

import { useState } from "react";

export interface TaskExportRow {
  kalem: string;
  kurum: string;
  tur: string;
  siradaki: string;
  onKayit: string;
  sonBasvuru: string;
  digerTarih: string;
  /** Sıradaki adıma kalan gün; negatif = geçti. */
  kalanGun: number;
  durum: string;
  kaynak: string;
  /** Sitedeki haber yolu ("/haber/30") — indirmede tam adrese çevrilir. */
  haberYolu: string;
  dayanak: string;
}

const BASLIKLAR = [
  "Kalem",
  "Kurum / kaynak",
  "Tür",
  "Sıradaki adım",
  "Ön kayıt",
  "Son başvuru",
  "Diğer tarihler",
  "Kalan gün",
  "Durum",
  "Kaynak bağlantısı",
  "Panel bağlantısı",
  "Dayanak",
];

function hucre(value: string | number): string {
  let v = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(v) && typeof value !== "number") v = `'${v}`;
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function csvOf(rows: TaskExportRow[], origin: string): string {
  const lines = [BASLIKLAR.map(hucre).join(";")];
  for (const r of rows) {
    lines.push(
      [
        r.kalem,
        r.kurum,
        r.tur,
        r.siradaki,
        r.onKayit,
        r.sonBasvuru,
        r.digerTarih,
        r.kalanGun,
        r.durum,
        r.kaynak,
        `${origin}${r.haberYolu}`,
        r.dayanak,
      ]
        .map(hucre)
        .join(";"),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

function dosyaAdi(): string {
  try {
    const gun = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    return `yapilacaklar-${gun}.csv`;
  } catch {
    return "yapilacaklar.csv";
  }
}

export function TaskExport({ rows }: { rows: TaskExportRow[] }) {
  const [durum, setDurum] = useState<string>("");

  if (rows.length === 0) return null;

  function indir() {
    try {
      const csv = csvOf(rows, window.location.origin);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = dosyaAdi();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDurum(`${rows.length} kalem indirildi.`);
    } catch {
      setDurum("Tarayıcınız dosya indirmeye izin vermedi.");
    }
  }

  return (
    <>
      <button type="button" className="tarih-disa-aktar u-kicker" onClick={indir}>
        <span aria-hidden="true">⤓</span> Excel’e aktar (CSV · {rows.length} kalem)
      </button>
      <span className="tarih-disa-durum" role="status" aria-live="polite">
        {durum}
      </span>
    </>
  );
}
