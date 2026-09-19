"use client";

/**
 * ERİŞİLEBİLİRLİK BAĞLAMI
 *
 * Tek doğruluk kaynağı: burada tanımlı `A11ySettings`. Hem üst bardaki
 * erişilebilirlik widget'ı hem /ayarlar sayfası bu bağlamı kullanır, bu yüzden
 * ikisi her zaman senkron kalır.
 *
 * Uygulama biçimi: ayarlar <html> üzerine `data-a11y-*` öznitelikleri ve CSS
 * değişkenleri olarak yazılır; görsel karşılıkları globals.css'te tanımlı.
 * Böylece hiçbir bileşenin erişilebilirlik durumunu bilmesi gerekmez — stil
 * katmanı tek yerden çözer.
 *
 * Saklama: localStorage (kişi başına tercih, tarayıcıda kalır). Gizli sekmede
 * yazma başarısız olabilir; tüm okuma/yazma try/catch içinde.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const A11Y_STORAGE_KEY = "isov:a11y";

export type FontChoice = "varsayilan" | "okunabilir" | "disleksi";
export type ContrastChoice = "normal" | "yuksek" | "koyu";
export type PaletteChoice =
  | "normal"
  | "protanopi"
  | "deuteranopi"
  | "tritanopi"
  | "monokrom";

export interface A11ySettings {
  /** Yazı tipi ailesi. okunabilir = Atkinson Hyperlegible, disleksi = Lexend. */
  font: FontChoice;
  /** Kök yazı boyutu çarpanı (0.9–1.6). Tüm rem ölçüleri buna bağlı ölçeklenir. */
  fontScale: number;
  /** Satır yüksekliği çarpanı (1.4–2.1). */
  lineHeight: number;
  /** Harf aralığı, em (0–0.12). */
  letterSpacing: number;
  /** Kelime aralığı, em (0–0.4). */
  wordSpacing: number;
  /** Kontrast/tema. */
  contrast: ContrastChoice;
  /** Renk körlüğü paleti — vurgu rengini ayırt edilebilir tona çevirir. */
  palette: PaletteChoice;
  /** Tüm bağlantıların altını çiz (renkten bağımsız ayırt edilebilirlik). */
  underlineLinks: boolean;
  /** Geçiş/animasyonları kapat. */
  reduceMotion: boolean;
  /** Okuma cetveli — imleç hizasında yatay kılavuz. */
  readingRuler: boolean;
  /** Görselleri gizle (Görsel görünümünde dikkat dağınıklığını azaltır). */
  hideImages: boolean;
}

export const A11Y_DEFAULTS: A11ySettings = {
  font: "varsayilan",
  fontScale: 1,
  lineHeight: 1.55,
  letterSpacing: 0,
  wordSpacing: 0,
  contrast: "normal",
  palette: "normal",
  underlineLinks: false,
  reduceMotion: false,
  readingRuler: false,
  hideImages: false,
};

/** Sınırlar — widget ve ayarlar sayfası aynı aralıkları kullanır. */
export const A11Y_LIMITS = {
  fontScale: { min: 0.9, max: 1.6, step: 0.05 },
  lineHeight: { min: 1.4, max: 2.1, step: 0.05 },
  letterSpacing: { min: 0, max: 0.12, step: 0.01 },
  wordSpacing: { min: 0, max: 0.4, step: 0.05 },
} as const;

const FONTS: readonly FontChoice[] = ["varsayilan", "okunabilir", "disleksi"];
const CONTRASTS: readonly ContrastChoice[] = ["normal", "yuksek", "koyu"];
const PALETTES: readonly PaletteChoice[] = [
  "normal",
  "protanopi",
  "deuteranopi",
  "tritanopi",
  "monokrom",
];

export const FONT_LABELS: Record<FontChoice, { label: string; hint: string }> = {
  varsayilan: { label: "Varsayılan", hint: "Source Serif — gazete tipografisi" },
  okunabilir: {
    label: "Yüksek Okunabilirlik",
    hint: "Atkinson Hyperlegible — Braille Institute tarafından az görenler için tasarlandı",
  },
  disleksi: {
    label: "Disleksi Desteği",
    hint: "Lexend — okuma akıcılığını artırmak için tasarlandı",
  },
};

export const CONTRAST_LABELS: Record<ContrastChoice, string> = {
  normal: "Normal",
  yuksek: "Yüksek Kontrast",
  koyu: "Koyu Tema",
};

export const PALETTE_LABELS: Record<PaletteChoice, { label: string; hint: string }> = {
  normal: { label: "Normal", hint: "Bordo vurgu" },
  protanopi: { label: "Protanopi", hint: "Kırmızı körlüğü — vurgu maviye döner" },
  deuteranopi: { label: "Deuteranopi", hint: "Yeşil körlüğü — vurgu maviye döner" },
  tritanopi: { label: "Tritanopi", hint: "Mavi-sarı körlüğü — vurgu magentaya döner" },
  monokrom: { label: "Tek Renk", hint: "Renk yok, yalnızca siyah-gri" },
};

/** Gelen değeri şemaya zorlar; bozuk localStorage içeriği uygulamayı çökertmesin. */
export function normalizeA11y(raw: unknown): A11ySettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<A11ySettings>;
  const num = (v: unknown, lim: { min: number; max: number }, fb: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(lim.max, Math.max(lim.min, n)) : fb;
  };
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fb: T): T =>
    allowed.includes(v as T) ? (v as T) : fb;

  return {
    font: pick(o.font, FONTS, A11Y_DEFAULTS.font),
    fontScale: num(o.fontScale, A11Y_LIMITS.fontScale, A11Y_DEFAULTS.fontScale),
    lineHeight: num(o.lineHeight, A11Y_LIMITS.lineHeight, A11Y_DEFAULTS.lineHeight),
    letterSpacing: num(o.letterSpacing, A11Y_LIMITS.letterSpacing, A11Y_DEFAULTS.letterSpacing),
    wordSpacing: num(o.wordSpacing, A11Y_LIMITS.wordSpacing, A11Y_DEFAULTS.wordSpacing),
    contrast: pick(o.contrast, CONTRASTS, A11Y_DEFAULTS.contrast),
    palette: pick(o.palette, PALETTES, A11Y_DEFAULTS.palette),
    underlineLinks: Boolean(o.underlineLinks),
    reduceMotion: Boolean(o.reduceMotion),
    readingRuler: Boolean(o.readingRuler),
    hideImages: Boolean(o.hideImages),
  };
}

/** Ayarları <html> üzerine yazar. Bootstrap betiği de aynı mantığı uygular. */
function applyToDocument(s: A11ySettings) {
  try {
    const el = document.documentElement;
    el.dataset.a11yFont = s.font;
    el.dataset.a11yContrast = s.contrast;
    el.dataset.a11yPalette = s.palette;
    el.dataset.a11yUnderline = s.underlineLinks ? "1" : "0";
    el.dataset.a11yMotion = s.reduceMotion ? "azalt" : "normal";
    el.dataset.a11yRuler = s.readingRuler ? "1" : "0";
    el.dataset.a11yImages = s.hideImages ? "gizli" : "acik";
    el.style.setProperty("--a11y-font-scale", String(s.fontScale));
    el.style.setProperty("--a11y-line", String(s.lineHeight));
    el.style.setProperty("--a11y-letter", `${s.letterSpacing}em`);
    el.style.setProperty("--a11y-word", `${s.wordSpacing}em`);
  } catch {
    /* yok sayılır */
  }
}

interface A11yContextValue {
  settings: A11ySettings;
  /** Tek bir alanı günceller. */
  set: <K extends keyof A11ySettings>(key: K, value: A11ySettings[K]) => void;
  /** Hepsini varsayılana döndürür. */
  reset: () => void;
  /** Varsayılandan sapan alan sayısı — widget'ta "aktif" göstergesi için. */
  changedCount: number;
  ready: boolean;
}

const A11yContext = createContext<A11yContextValue>({
  settings: A11Y_DEFAULTS,
  set: () => {},
  reset: () => {},
  changedCount: 0,
  ready: false,
});

export function A11yProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<A11ySettings>(A11Y_DEFAULTS);
  const [ready, setReady] = useState(false);

  // Sunucu daima varsayılanla render eder; gerçek tercih mount sonrası uygulanır.
  useEffect(() => {
    let stored: A11ySettings = A11Y_DEFAULTS;
    try {
      const raw = window.localStorage.getItem(A11Y_STORAGE_KEY);
      if (raw) stored = normalizeA11y(JSON.parse(raw));
    } catch {
      /* bozuk içerik — varsayılanla devam */
    }
    setSettings(stored);
    applyToDocument(stored);
    setReady(true);
  }, []);

  const persist = useCallback((next: A11ySettings) => {
    setSettings(next);
    applyToDocument(next);
    try {
      window.localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* gizli sekmede yazma başarısız olabilir */
    }
  }, []);

  const set = useCallback(
    <K extends keyof A11ySettings>(key: K, value: A11ySettings[K]) => {
      persist(normalizeA11y({ ...settings, [key]: value }));
    },
    [persist, settings],
  );

  const reset = useCallback(() => persist(A11Y_DEFAULTS), [persist]);

  const changedCount = useMemo(
    () =>
      (Object.keys(A11Y_DEFAULTS) as (keyof A11ySettings)[]).filter(
        (k) => settings[k] !== A11Y_DEFAULTS[k],
      ).length,
    [settings],
  );

  return (
    <A11yContext.Provider value={{ settings, set, reset, changedCount, ready }}>
      {children}
    </A11yContext.Provider>
  );
}

export function useA11y(): A11yContextValue {
  return useContext(A11yContext);
}

/**
 * Hidrasyondan önce çalışan betik: tercihleri ilk boyamadan önce uygular,
 * böylece yazı boyutu/tema sıçraması olmaz.
 */
export const A11Y_BOOTSTRAP_SCRIPT = `(function(){try{var d=document.documentElement,r=localStorage.getItem('${A11Y_STORAGE_KEY}');if(!r)return;var s=JSON.parse(r);
var f=['varsayilan','okunabilir','disleksi'],c=['normal','yuksek','koyu'],p=['normal','protanopi','deuteranopi','tritanopi','monokrom'];
var cl=function(v,mn,mx,fb){v=Number(v);return isFinite(v)?Math.min(mx,Math.max(mn,v)):fb;};
d.setAttribute('data-a11y-font',f.indexOf(s.font)>-1?s.font:'varsayilan');
d.setAttribute('data-a11y-contrast',c.indexOf(s.contrast)>-1?s.contrast:'normal');
d.setAttribute('data-a11y-palette',p.indexOf(s.palette)>-1?s.palette:'normal');
d.setAttribute('data-a11y-underline',s.underlineLinks?'1':'0');
d.setAttribute('data-a11y-motion',s.reduceMotion?'azalt':'normal');
d.setAttribute('data-a11y-ruler',s.readingRuler?'1':'0');
d.setAttribute('data-a11y-images',s.hideImages?'gizli':'acik');
d.style.setProperty('--a11y-font-scale',String(cl(s.fontScale,0.9,1.6,1)));
d.style.setProperty('--a11y-line',String(cl(s.lineHeight,1.4,2.1,1.55)));
d.style.setProperty('--a11y-letter',cl(s.letterSpacing,0,0.12,0)+'em');
d.style.setProperty('--a11y-word',cl(s.wordSpacing,0,0.4,0)+'em');
}catch(e){}})();`;
