/**
 * TARİH ARALIĞI FİLTRESİ — sağ üstte duran şerit.
 *
 * Hazır aralıklar Link'tir: JS olmadan çalışır ve sunucu bileşeni olarak
 * render edilir. Özel aralık da JS gerektirmez — `<details>` + `method="get"`
 * formu tarayıcının kendi davranışıyla `?from=&to=` üretir. Bu yüzden dosyada
 * "use client" YOK; bileşen her yere (ana sayfa, /degisiklikler) konulabilir.
 *
 * URL parametreleri backend'de ZATEN destekli:
 *   `from` → `published_at >= from`
 *   `to`   → `published_at <= to` (10 karakterlik `to` günün tamamını kapsar)
 *
 * Tüm tarih aritmetiği Europe/Istanbul takvimine göre yapılır; "bugün"
 * sunucunun UTC gününden farklı olabilir.
 */

import Link from "next/link";
import type { ReactNode } from "react";

import { formatDate } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Durum                                                               */
/* ------------------------------------------------------------------ */

/**
 * Filtre durumu — `components/Filters.tsx`'teki `FilterState`'in tarih
 * alanlarıyla genişletilmiş hâli. `FilterState` bu tipe doğrudan atanabilir,
 * böylece çağıran taraf `{...state, from, to}` geçebilir.
 */
export interface DateFilterState {
  region?: string;
  band?: string;
  tag?: string;
  q?: string;
  category?: string;
  source?: string;
  sort?: string;
  type?: string;
  from?: string;
  to?: string;
}

/** URL'e yazılan sırada sabit anahtar listesi — çıktı deterministik olsun. */
const KEYS: (keyof DateFilterState)[] = [
  "region",
  "band",
  "tag",
  "q",
  "category",
  "source",
  "sort",
  "type",
  "from",
  "to",
];

/**
 * Mevcut filtreleri koruyarak birkaç anahtarı birlikte değiştirir.
 *
 * `Filters.tsx`'teki `withParam()` deseninin çok anahtarlı hâli: tarih
 * aralığı iki parametreyi (`from`+`to`) TEK adımda değiştirmek zorundadır,
 * tek anahtarlı yardımcı ile araya yarım durum (yalnızca `from` değişmiş)
 * girerdi. `page` bilinçli olarak taşınmaz — filtre değişince ilk sayfa.
 *
 * Patch içinde `undefined` geçen anahtar URL'den DÜŞER (filtreyi kaldırır).
 */
export function withState(
  state: DateFilterState,
  patch: Partial<DateFilterState>,
  basePath = "/",
): string {
  const sp = new URLSearchParams();
  for (const key of KEYS) {
    const v = key in patch ? patch[key] : state[key];
    if (v) sp.set(key, v);
  }
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** Yalnızca tarih aralığını değiştirir; diğer filtreler korunur. */
export function withDateRange(
  state: DateFilterState,
  range: { from?: string; to?: string },
  basePath = "/",
): string {
  return withState(
    state,
    { from: range.from ?? undefined, to: range.to ?? undefined },
    basePath,
  );
}

/* ------------------------------------------------------------------ */
/* Takvim aritmetiği (Europe/Istanbul)                                 */
/* ------------------------------------------------------------------ */

const ISO_GUN = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Istanbul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** İstanbul takvimine göre "YYYY-MM-DD". */
export function istanbulGunu(now: Date = new Date()): string {
  // en-CA zaten YYYY-MM-DD üretir; parçalardan kurmak biçim sürprizine
  // karşı daha güvenli.
  const parts = ISO_GUN.formatToParts(now);
  const al = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = al("year");
  const m = al("month");
  const d = al("day");
  return y && m && d ? `${y}-${m}-${d}` : now.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" üzerinde gün ekler/çıkarır (saf takvim aritmetiği). */
export function gunEkle(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map((n) => Number(n));
  if (!y || !m || !d) return iso;
  const t = Date.UTC(y, m - 1, d) + delta * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Girdinin gerçekten YYYY-MM-DD olup olmadığını doğrular. */
export function gecerliGun(value?: string | null): string | undefined {
  const v = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m! - 1 ||
    dt.getUTCDate() !== d
  ) {
    return undefined;
  }
  return v;
}

/* ------------------------------------------------------------------ */
/* Hazır aralıklar                                                     */
/* ------------------------------------------------------------------ */

export interface HazirAralik {
  id: string;
  label: string;
  from: string;
  to: string;
}

/** Bugün / son 7 / son 30 / bu ay — hepsi İstanbul takvimiyle. */
export function hazirAraliklar(now: Date = new Date()): HazirAralik[] {
  const bugun = istanbulGunu(now);
  const ayBasi = `${bugun.slice(0, 7)}-01`;
  return [
    { id: "bugun", label: "Bugün", from: bugun, to: bugun },
    { id: "son7", label: "Son 7 gün", from: gunEkle(bugun, -6), to: bugun },
    { id: "son30", label: "Son 30 gün", from: gunEkle(bugun, -29), to: bugun },
    { id: "buay", label: "Bu ay", from: ayBasi, to: bugun },
  ];
}

/** Seçili aralığın okunur karşılığı: "1 – 19 Eylül 2026" gibi. */
export function tarihAraligiEtiketi(from?: string, to?: string): string | null {
  const f = gecerliGun(from);
  const t = gecerliGun(to);
  if (!f && !t) return null;
  if (f && t) {
    if (f === t) return formatDate(f);
    return `${formatDate(f)} – ${formatDate(t)}`;
  }
  if (f) return `${formatDate(f)} ve sonrası`;
  return `${formatDate(t)} ve öncesi`;
}

/** Aralık kaç gün sürüyor (dahil)? Bilinmiyorsa null. */
export function aralikGunSayisi(from?: string, to?: string): number | null {
  const f = gecerliGun(from);
  const t = gecerliGun(to);
  if (!f || !t) return null;
  const ms = Date.parse(`${t}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 86400000) + 1;
}

/* ------------------------------------------------------------------ */
/* Bileşenler                                                          */
/* ------------------------------------------------------------------ */

/**
 * Seçili aralığı gösteren, kaldırılabilir çip.
 * `ActiveFilters` şeridinin yanına konmak üzere ayrı dışa açıldı —
 * `Filters.tsx`'e dokunmadan aynı görünümü verir.
 */
export function DateRangeChip({
  state,
  basePath = "/",
}: {
  state: DateFilterState;
  basePath?: string;
}) {
  const etiket = tarihAraligiEtiketi(state.from, state.to);
  if (!etiket) return null;

  return (
    <Link
      href={withDateRange(state, {}, basePath)}
      className="tag-chip"
      title="Tarih aralığı filtresini kaldır"
    >
      Tarih: {etiket} <span aria-hidden="true">×</span>
      <span className="sr-only-custom"> filtresini kaldır</span>
    </Link>
  );
}

/**
 * TARİH ARALIĞI ŞERİDİ.
 *
 * @param state    Mevcut filtreler (`from`/`to` dahil).
 * @param basePath Formun ve bağlantıların gideceği yol ("/" ya da "/degisiklikler").
 * @param note     "Bu aralıkta değişenler" satırı gibi ek bilgi. Veri yoksa
 *                 çağıran taraf `null` geçer; burada sayı UYDURULMAZ.
 * @param withChip Seçili aralığı çip olarak da göster.
 */
export function DateRangeFilter({
  state,
  basePath = "/",
  note,
  withChip = false,
  className,
  now,
}: {
  state: DateFilterState;
  basePath?: string;
  note?: ReactNode;
  withChip?: boolean;
  className?: string;
  now?: Date;
}) {
  const presets = hazirAraliklar(now);
  const from = gecerliGun(state.from);
  const to = gecerliGun(state.to);
  const aktifPreset = presets.find((p) => p.from === from && p.to === to);
  const ozelAktif = Boolean((from || to) && !aktifPreset);

  // Gizli alanlar: form gönderiminde diğer filtreler kaybolmasın.
  const tasinan = KEYS.filter((k) => k !== "from" && k !== "to")
    .map((k) => [String(k), state[k]] as [string, string | undefined])
    .filter((pair): pair is [string, string] => Boolean(pair[1]));

  return (
    <section
      className={`degis-tarih ${className ?? ""}`.trim()}
      aria-labelledby="tarih-araligi-basligi"
    >
      <p id="tarih-araligi-basligi" className="u-kicker degis-tarih-baslik">
        Tarih Aralığı
      </p>

      <nav aria-label="Hazır tarih aralıkları" className="degis-tarih-satir">
        <Link
          href={withDateRange(state, {}, basePath)}
          className="tag-chip"
          data-active={!from && !to ? "true" : "false"}
          aria-current={!from && !to ? "true" : undefined}
        >
          Tüm zamanlar
        </Link>
        {presets.map((p) => {
          const aktif = aktifPreset?.id === p.id;
          return (
            <Link
              key={p.id}
              href={withDateRange(state, { from: p.from, to: p.to }, basePath)}
              className="tag-chip"
              data-active={aktif ? "true" : "false"}
              aria-current={aktif ? "true" : undefined}
            >
              {p.label}
            </Link>
          );
        })}
      </nav>

      {/* Özel aralık: <details> sayesinde JS gerekmez, açılır kapanır. */}
      <details className="degis-tarih-ozel" open={ozelAktif}>
        <summary className="u-kicker degis-tarih-ozet">
          Özel aralık
          {ozelAktif ? <span aria-hidden="true"> ·</span> : null}
        </summary>

        <form method="get" action={basePath} className="degis-tarih-form">
          {tasinan.map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}

          <label className="degis-tarih-alan">
            <span className="u-kicker">Başlangıç</span>
            <input
              type="date"
              name="from"
              defaultValue={from ?? ""}
              max={to ?? undefined}
              className="degis-tarih-girdi"
            />
          </label>

          <label className="degis-tarih-alan">
            <span className="u-kicker">Bitiş</span>
            <input
              type="date"
              name="to"
              defaultValue={to ?? ""}
              min={from ?? undefined}
              className="degis-tarih-girdi"
            />
          </label>

          <button type="submit" className="degis-tarih-buton">
            Uygula
          </button>
        </form>

        <p className="degis-tarih-ipucu">
          Bitiş günü aralığa dahildir. Tek alan doldurulursa filtre tek yönlü
          çalışır.
        </p>
      </details>

      {withChip ? (
        <div className="degis-tarih-cip">
          <DateRangeChip state={state} basePath={basePath} />
        </div>
      ) : null}

      {note ? <div className="degis-tarih-not">{note}</div> : null}
    </section>
  );
}

export default DateRangeFilter;
