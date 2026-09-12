"use client";

/**
 * Görünüm modu bağlamı: "panel" (varsayılan) ↔ "gazete".
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

export type ViewMode = "panel" | "gazete";

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
    const raw = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return raw === "gazete" ? "gazete" : "panel";
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
export const VIEW_BOOTSTRAP_SCRIPT = `(function(){try{var v=localStorage.getItem('${VIEW_STORAGE_KEY}');document.documentElement.setAttribute('data-view',v==='gazete'?'gazete':'panel');}catch(e){document.documentElement.setAttribute('data-view','panel');}})();`;
