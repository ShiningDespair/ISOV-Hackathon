/**
 * Ayarlar sayfasının ortak parçaları.
 *
 * Buradaki bileşenlerin hiçbiri durum tutmaz; hem sunucu bölümlerinde
 * hem istemci bölümlerinde kullanılabilirler. Görsel karşılıkları
 * `app/globals.css` sonundaki `ayar-` bloğunda tanımlı.
 */

import type { ReactNode } from "react";

/**
 * Sayfa içindeki bir ayar bölümü — kural çizgisi + kicker + başlık.
 *
 * `katlanir`: bölüm `<details>` içinde, varsayılan KAPALI basılır.
 * Ölçülen hata (Nilgün P2-5, 390 px): /ayarlar 16.668 px uzunluğundaydı;
 * Kaynaklar tek başına ~6.000 px, Bülten tercihleri y = 14.330'da. Üst
 * yönetim kaynak listesi yönetmez. Kaynaklar, Kaynak Öner ve Sistem Bilgisi
 * katlanır; Profil ve Görünüm açık kalır.
 *
 * NEDEN `<details>`: JavaScript'siz çalışır (bu bileşen sunucu bileşeni),
 * klavye (Enter/Space) ve ekran okuyucu ("daraltılmış/genişletilmiş")
 * desteği tarayıcıdan gelir. Başlık (`h2`) `summary` içinde kalır, yani
 * başlık gezinmesiyle bölüm yine bulunur. Durum yalnızca ok işaretiyle
 * değil "Aç"/"Kapat" metniyle de yazılır (renk/simge tek gösterge değil).
 * Çapa (`/ayarlar#kaynaklar`) ile gelindiğinde bölüm kendiliğinden
 * AÇILMAZ; kodda bu çapalara giden bağlantı yok (grep: 0). Chromium sayfa
 * içi aramada (Ctrl+F) kapalı `<details>`i kendisi açar.
 */
export function SettingsSection({
  id,
  kicker,
  title,
  lead,
  aside,
  katlanir = false,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  lead?: ReactNode;
  aside?: ReactNode;
  /** true: `<details>` içinde, varsayılan kapalı. */
  katlanir?: boolean;
  children: ReactNode;
}) {
  const baslik = (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <div className="min-w-0">
        <p className="u-kicker u-kicker-accent">{kicker}</p>
        <h2 id={`${id}-baslik`} className="u-headline u-headline-md mt-1">
          {title}
        </h2>
      </div>
      {aside ? <div className="u-kicker text-ink-faint">{aside}</div> : null}
    </div>
  );
  const giris = lead ? (
    <p className="u-body u-body-soft mt-2 max-w-3xl text-[0.9375rem] leading-snug">
      {lead}
    </p>
  ) : null;

  if (katlanir) {
    return (
      <section id={id} className="ayar-section" aria-labelledby={`${id}-baslik`}>
        <details className="erisim-katlanir" data-katlanir-id={id}>
          <summary className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">{baslik}</div>
            <span className="erisim-katlanir-durum" aria-hidden="true">
              <span className="erisim-katlanir-ac">Aç</span>
              <span className="erisim-katlanir-kapat">Kapat</span>
            </span>
          </summary>
          {giris}
          <div className="mt-5">{children}</div>
        </details>
      </section>
    );
  }

  return (
    <section id={id} className="ayar-section" aria-labelledby={`${id}-baslik`}>
      {baslik}
      {giris}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Etiketli form alanı. `<label>` her girdiyi sarar — ayrı `for` gerekmez. */
export function Field({
  label,
  hint,
  error,
  errorId,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  errorId?: string;
  children: ReactNode;
}) {
  return (
    <div className="ayar-field">
      <label className="block">
        <span className="u-kicker block text-ink">{label}</span>
        {hint ? (
          <span className="u-body u-body-soft block text-[0.75rem] leading-snug">
            {hint}
          </span>
        ) : null}
        {children}
      </label>
      {/* Alan hatası: aria-live yok — form düzeyindeki canlı bölge duyurur,
          iki kez okunmasın. Girdiye aria-describedby ile bağlanır. */}
      {error ? (
        <p id={errorId} className="ayar-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Form düzeyi bildirim bölgesi.
 * KAP her zaman DOM'da kalır (aria-live bölgesi sonradan eklenirse ekran
 * okuyucular değişikliği duyurmaz); içerik boşken görünmez.
 */
export function Notice({
  kind,
  message,
  id,
}: {
  kind: "basari" | "hata" | null;
  message: string | null;
  id?: string;
}) {
  return (
    <div aria-live="polite" role="status" id={id}>
      {message && kind ? (
        <p className="ayar-bildirim" data-tur={kind}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

/** Aç/kapa anahtarı — role="switch" taşıyan düğme, klavyeyle çalışır. */
export function Switch({
  checked,
  onChange,
  label,
  onLabel = "Açık",
  offLabel = "Kapalı",
  busy = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Ekran okuyucuya söylenen tam etiket, ör. "Resmî Gazete toplaması". */
  label: string;
  onLabel?: string;
  offLabel?: string;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={busy}
      onClick={() => onChange(!checked)}
      className="ayar-switch"
    >
      <span className="ayar-switch-track" aria-hidden="true" />
      <span>{busy ? "…" : checked ? onLabel : offLabel}</span>
    </button>
  );
}

/** Otorite ağırlığı — sayı + küçük ölçek çubuğu (renk tek gösterge değil). */
export function Meter({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular-nums">{pct}</span>
      <span className="ayar-meter" aria-hidden="true">
        <span className="ayar-meter-fill" style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

/** Seçenek çipleri — filtre satırları için. */
export function ChipGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { key: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="u-kicker mr-1 text-ink-faint">{label}</span>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          className="ayar-chip"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
