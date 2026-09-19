"use client";

/**
 * Görünüm modu bağlamı. Dört varyant:
 *   panel  — filtreli, okunabilir liste (varsayılan)
 *   gazete — basılı gazete mizanpajı, yazdırmaya hazır
 *   gorsel — ana tasarım + görseller/thumbnail'lar
 *   kart   — az metin, yalnızca konu özetleri; en hafif görünüm
 *
 * Seçim localStorage'da saklanır. Hidrasyon uyuşmazlığını önlemek için
 * sunucu daima "panel" ile render eder; gerçek değer <html data-view>
 * özniteliğinden (satır içi betik) ve mount sonrası state'ten okunur.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ViewMode = "panel" | "gazete" | "gorsel" | "kart";

/** Tüm geçerli modlar — switch, ayarlar sayfası ve bootstrap betiği aynı listeyi kullanır. */
export const VIEW_MODES: readonly ViewMode[] = ["panel", "gazete", "gorsel", "kart"] as const;

/** Kullanıcıya gösterilen adlar ve kısa açıklamalar. */
export const VIEW_LABELS: Record<ViewMode, { label: string; hint: string }> = {
  panel: { label: "Panel", hint: "Filtreli, okunabilir liste" },
  gazete: { label: "Gazete", hint: "Basılı gazete mizanpajı, yazdırmaya hazır" },
  gorsel: { label: "Görsel", hint: "Ana tasarım, haber görselleriyle" },
  kart: { label: "Kart", hint: "Az metin, yalnızca konu özetleri" },
};

/** Bilinmeyen değerleri güvenli varsayılana indirger. */
export function normalizeView(value: unknown): ViewMode {
  return (VIEW_MODES as readonly string[]).includes(String(value))
    ? (value as ViewMode)
    : "panel";
}

export const VIEW_STORAGE_KEY = "isov:view";

interface ViewContextValue {
  view: ViewMode;
  setView: (next: ViewMode) => void;
  /** Mount tamamlandı mı — aria durumlarını doğru göstermek için. */
  ready: boolean;
}

const ViewContext = createContext<ViewContextValue>({
  view: "panel",
  setView: () => {},
  ready: false,
});

/** localStorage'dan güvenli okuma. */
function readStoredView(): ViewMode {
  try {
    return normalizeView(window.localStorage.getItem(VIEW_STORAGE_KEY));
  } catch {
    return "panel";
  }
}

export function ViewProvider({ children }: { children: ReactNode }) {
  const [view, setViewState] = useState<ViewMode>("panel");
  const [ready, setReady] = useState(false);

  // Mount sonrası gerçek seçimi uygula.
  useEffect(() => {
    const stored = readStoredView();
    setViewState(stored);
    setReady(true);
    try {
      document.documentElement.dataset.view = stored;
    } catch {
      /* yok sayılır */
    }
  }, []);

  const setView = useCallback((next: ViewMode) => {
    setViewState(next);
    try {
      document.documentElement.dataset.view = next;
    } catch {
      /* yok sayılır */
    }
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* özel sekmede yazma başarısız olabilir — sessizce geç */
    }
  }, []);

  return (
    <ViewContext.Provider value={{ view, setView, ready }}>
      {children}
    </ViewContext.Provider>
  );
}

export function useView(): ViewContextValue {
  return useContext(ViewContext);
}

/**
 * Hidrasyondan önce çalışacak satır içi betik.
 * <html> üzerine data-view yazar; böylece doğru mizanpaj ilk boyamada görünür.
 */
export const VIEW_BOOTSTRAP_SCRIPT = `(function(){try{var m=${JSON.stringify(VIEW_MODES)};var v=localStorage.getItem('${VIEW_STORAGE_KEY}');document.documentElement.setAttribute('data-view',m.indexOf(v)>-1?v:'panel');}catch(e){document.documentElement.setAttribute('data-view','panel');}})();`;
