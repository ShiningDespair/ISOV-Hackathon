/**
 * "SON VERİ" GÖSTERGESİ — künyede, gazete künyesinde ve altbilgide.
 *
 * Sunucu bileşeni; veri `lib/freshness.ts`ten (5 dk süreç önbelleği).
 * Tarih bilinmiyorsa HİÇBİR ŞEY basmaz — bugünün tarihine düşmek tam da
 * düzeltilen hataydı (Selin, P0-1).
 *
 * RENK TEK GÖSTERGE DEĞİL (WCAG 1.4.1): eski veride metne "Eski veri"
 * sözcüğü ve ⚠ işareti eklenir, kutu kesik kenarlık alır; renk yalnızca
 * pekiştirir. Ekran okuyucu için tam cümle `aria-label`da.
 */

import { formatDate, formatDateTime } from "@/lib/format";
import { ageLabel, getFreshness, issueNumberFor, STALE_AFTER_DAYS } from "@/lib/freshness";

type Variant = "masthead" | "folio" | "sentence" | "issue";

export async function DataFreshness({ variant = "masthead" }: { variant?: Variant }) {
  const f = await getFreshness();
  if (!f) return null;

  const date = formatDate(f.lastDataAt);
  const age = ageLabel(f.ageDays);

  if (variant === "issue") {
    return <span title="Sayı numarası verinin gününden türetilir; yeni veri gelmedikçe ilerlemez.">Sayı No {issueNumberFor(f.lastDataAt)}</span>;
  }

  if (variant === "sentence") {
    return (
      <>
        {" "}En yeni haber: {date} ({age}).
        {f.stale ? ` Akış ${f.ageDays} gündür yeni haber almadı.` : ""}
      </>
    );
  }

  const runNote =
    f.lastRunAt != null
      ? `Son toplama çalışması: ${formatDateTime(f.lastRunAt)}` +
        (f.lastRunNew != null ? `, ${f.lastRunNew} yeni haber.` : ".")
      : "";
  const label =
    `Son veri ${date}, ${age}.` +
    (f.stale ? ` Veri ${STALE_AFTER_DAYS} günden eski; akış güncel değil.` : "") +
    (runNote ? ` ${runNote}` : "");

  return (
    <span
      className="tarih-tazelik"
      data-tarih-eski={f.stale ? "true" : "false"}
      data-tarih-yer={variant}
      role="note"
      aria-label={label}
      title={label}
    >
      {f.stale ? (
        <span className="tarih-rozet" aria-hidden="true">
          <span className="tarih-rozet-isaret">⚠</span> Eski veri
        </span>
      ) : null}
      {/* Gerçek boşluk: görsel ayrımı flex `gap` sağlıyor ama metin olarak
          (kopyala-yapıştır, okuma kipi) "Eski veriSon veri" birleşiyordu. */}
      {f.stale ? " " : null}
      <span aria-hidden="true">
        Son veri: <time dateTime={f.lastDataAt}>{date}</time>
        <span> · </span>
        <span className="tarih-yas">{age}</span>
      </span>
    </span>
  );
}
