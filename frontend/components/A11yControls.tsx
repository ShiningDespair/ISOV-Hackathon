"use client";

/**
 * Erişilebilirlik denetimleri — TEK uygulama.
 * Hem yüzen widget hem /ayarlar sayfası bu bileşeni kullanır, böylece iki yerde
 * iki ayrı kontrol seti bakımı yapılmaz ve davranış ayrışmaz.
 */

import {
  A11Y_LIMITS,
  CONTRAST_LABELS,
  FONT_LABELS,
  PALETTE_LABELS,
  useA11y,
  type A11ySettings,
  type ContrastChoice,
  type FontChoice,
  type PaletteChoice,
} from "./A11yProvider";

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-rule pt-3">
      <legend className="u-kicker px-0 text-ink">{title}</legend>
      {hint ? <p className="u-body u-body-soft mt-0.5 text-[0.8125rem] leading-snug">{hint}</p> : null}
      <div className="mt-2">{children}</div>
    </fieldset>
  );
}

/** Seçenek düğmeleri — radyo davranışı, dokunmatikte de rahat hedef. */
function Choice<T extends string>({
  value,
  options,
  onChange,
  name,
}: {
  value: T;
  options: { key: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  name: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          title={o.hint}
          onClick={() => onChange(o.key)}
          className="u-kicker border px-2.5 py-1.5 transition-colors"
          style={
            value === o.key
              ? { borderColor: "var(--color-ink)", backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }
              : { borderColor: "var(--color-rule)", color: "var(--color-ink-soft)" }
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Kaydırıcı — değeri sayı olarak da gösterir (ekran okuyucu ve göz için). */
function Slider({
  label,
  value,
  limits,
  onChange,
  format,
}: {
  label: string;
  value: number;
  limits: { min: number; max: number; step: number };
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <label className="block">
      <span className="u-kicker flex items-baseline justify-between text-ink-soft">
        <span>{label}</span>
        <span className="tabular-nums text-ink">{format(value)}</span>
      </span>
      <input
        type="range"
        min={limits.min}
        max={limits.max}
        step={limits.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="a11y-range mt-1.5 w-full"
      />
    </label>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
      />
      <span>
        <span className="u-body block text-[0.9375rem] leading-snug">{label}</span>
        {hint ? (
          <span className="u-body u-body-soft block text-[0.8125rem] leading-snug">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}

export function A11yControls({ compact = false }: { compact?: boolean }) {
  const { settings, set, reset, changedCount } = useA11y();
  const s: A11ySettings = settings;

  return (
    <div className={compact ? "space-y-3.5" : "space-y-5"}>
      <Group title="Yazı Tipi" hint="Okuma güçlüğü için tasarlanmış aileler.">
        <Choice<FontChoice>
          name="Yazı tipi"
          value={s.font}
          onChange={(v) => set("font", v)}
          options={(Object.keys(FONT_LABELS) as FontChoice[]).map((k) => ({
            key: k,
            label: FONT_LABELS[k].label,
            hint: FONT_LABELS[k].hint,
          }))}
        />
      </Group>

      <Group title="Metin Ölçüleri">
        <div className="space-y-3">
          <Slider
            label="Yazı boyutu"
            value={s.fontScale}
            limits={A11Y_LIMITS.fontScale}
            onChange={(v) => set("fontScale", v)}
            format={(v) => `%${Math.round(v * 100)}`}
          />
          <Slider
            label="Satır aralığı"
            value={s.lineHeight}
            limits={A11Y_LIMITS.lineHeight}
            onChange={(v) => set("lineHeight", v)}
            format={(v) => v.toFixed(2)}
          />
          <Slider
            label="Harf aralığı"
            value={s.letterSpacing}
            limits={A11Y_LIMITS.letterSpacing}
            onChange={(v) => set("letterSpacing", v)}
            format={(v) => `${v.toFixed(2)}em`}
          />
          <Slider
            label="Kelime aralığı"
            value={s.wordSpacing}
            limits={A11Y_LIMITS.wordSpacing}
            onChange={(v) => set("wordSpacing", v)}
            format={(v) => `${v.toFixed(2)}em`}
          />
        </div>
      </Group>

      <Group title="Kontrast">
        <Choice<ContrastChoice>
          name="Kontrast"
          value={s.contrast}
          onChange={(v) => set("contrast", v)}
          options={(Object.keys(CONTRAST_LABELS) as ContrastChoice[]).map((k) => ({
            key: k,
            label: CONTRAST_LABELS[k],
          }))}
        />
      </Group>

      <Group
        title="Renk Görüşü"
        hint="Vurgu rengini ayırt edilebilir bir tona çevirir. Tek renk seçeneğinde renk hiç bilgi taşımaz."
      >
        <Choice<PaletteChoice>
          name="Renk paleti"
          value={s.palette}
          onChange={(v) => set("palette", v)}
          options={(Object.keys(PALETTE_LABELS) as PaletteChoice[]).map((k) => ({
            key: k,
            label: PALETTE_LABELS[k].label,
            hint: PALETTE_LABELS[k].hint,
          }))}
        />
      </Group>

      <Group title="Okuma Yardımcıları">
        <div className="divide-y divide-rule">
          <Toggle
            label="Bağlantıların altını çiz"
            hint="Bağlantılar renkten bağımsız olarak ayırt edilir."
            checked={s.underlineLinks}
            onChange={(v) => set("underlineLinks", v)}
          />
          <Toggle
            label="Okuma cetveli"
            hint="İmleç hizasında yatay kılavuz şerit gösterir."
            checked={s.readingRuler}
            onChange={(v) => set("readingRuler", v)}
          />
          <Toggle
            label="Hareketi azalt"
            hint="Geçiş ve animasyonları kapatır."
            checked={s.reduceMotion}
            onChange={(v) => set("reduceMotion", v)}
          />
          <Toggle
            label="Görselleri gizle"
            hint="Görsel görünümünde haber görsellerini kaldırır."
            checked={s.hideImages}
            onChange={(v) => set("hideImages", v)}
          />
        </div>
      </Group>

      <div className="flex items-center justify-between border-t border-rule pt-3">
        <span className="u-kicker text-ink-faint">
          {changedCount > 0 ? `${changedCount} ayar değiştirildi` : "Tümü varsayılan"}
        </span>
        <button
          type="button"
          onClick={reset}
          disabled={changedCount === 0}
          className="u-kicker border border-ink px-3 py-1.5 transition-colors hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-faint disabled:hover:bg-transparent disabled:hover:text-ink-faint"
        >
          Sıfırla
        </button>
      </div>
    </div>
  );
}
