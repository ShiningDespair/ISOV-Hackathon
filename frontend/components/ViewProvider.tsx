"use client";

/**
 * Görünüm modu bağlamı. Dört varyant:
 *   panel  — filtreli, okunabilir liste
 *   gazete — basılı gazete mizanpajı, yazdırmaya hazır
 *   gorsel — ana tasarım + görseller/thumbnail'lar
 *   kart   — az metin, yalnızca konu özetleri; en hafif görünüm
 *
 * Hidrasyon uyuşmazlığını önlemek için sunucu daima "panel" ile render
 * eder; gerçek değer <html data-view> özniteliğinden (satır içi betik) ve
 * mount sonrası state'ten okunur.
 *
 * ÜÇ KADEMELİ ÇÖZÜM (docs/SADELESTIRME.md §3) — sıra kritik:
 *   1. localStorage['isov:view'] — kullanıcının AÇIK seçimi, her zaman kazanır
 *   2. `isov_view` çerezi — pozisyondan gelen varsayılan (backend yazıyor,
 *      httpOnly DEĞİL, bu yüzden document.cookie'den okunabilir)
 *   3. 'panel'
 *
 * `setView()` YALNIZCA kullanıcı anahtara bastığında çağrılıyor. Dolayısıyla
 * localStorage anahtarının VARLIĞI "kullanıcı açık bir seçim yaptı" demektir
 * ve rolden gelen varsayılan onu EZMEZ. Profil (pozisyon) değişince yeni
 * rolün varsayılanının kullanıcının elle yaptığı seçimi geçersiz kılmaması
 * bilinçli bir karardır: kullanıcı bir kez "gazete" dediyse, pozisyonu
 * değişti diye görünümü altından kaymamalı.
 *
 * Aynı sıra İKİ YERDE uygulanıyor ve ikisi de aşağıdaki sabitlerden okur:
 * `resolveInitialView()` (React tarafı) ve `VIEW_BOOTSTRAP_SCRIPT` (ilk
 * boyamadan önce çalışan satır içi betik).
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

/**
 * Rolden gelen varsayılanı taşıyan çerez adı. Backend giriş ve profil
 * güncellemesinde yazıyor (httpOnly DEĞİL — bilinçli: ilk boyamadan önce
 * okunması gerekiyor, sunucuya ek istek atmadan).
 */
export const VIEW_COOKIE_NAME = "isov_view";

/** Geçerli bir görünüm modu mu? Değilse null — "karar veremedim". */
function asViewMode(value: unknown): ViewMode | null {
  const v = String(value ?? "");
  return (VIEW_MODES as readonly string[]).includes(v) ? (v as ViewMode) : null;
}

/** localStorage'dan güvenli okuma — özel sekmede erişim atabilir. */
function readStoredView(): ViewMode | null {
  try {
    return asViewMode(window.localStorage.getItem(VIEW_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** `isov_view` çerezinden güvenli okuma. Çerez yoksa/bozuksa null. */
function readCookieView(): ViewMode | null {
  try {
    const m = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${VIEW_COOKIE_NAME}=([^;]*)`),
    );
    return m ? asViewMode(decodeURIComponent(m[1])) : null;
  } catch {
    return null;
  }
}

/**
 * Üç kademeli görünüm çözümü. SIRA, `VIEW_BOOTSTRAP_SCRIPT` içindeki
 * sırayla BİREBİR aynı olmak zorunda; ikisi ayrışırsa ilk boyamada bir
 * görünüm, hidrasyondan sonra başka bir görünüm belirir.
 */
function resolveInitialView(): ViewMode {
  // 1. Kullanıcının açık seçimi — her zaman kazanır.
  const secim = readStoredView();
  if (secim) return secim;
  // 2. Rolden gelen varsayılan.
  const cerez = readCookieView();
  if (cerez) return cerez;
  // 3. Sözleşme varsayılanı.
  return "panel";
}

export function ViewProvider({ children }: { children: ReactNode }) {
  const [view, setViewState] = useState<ViewMode>("panel");
  const [ready, setReady] = useState(false);

  // Mount sonrası gerçek seçimi uygula.
  useEffect(() => {
    const stored = resolveInitialView();
    setViewState(stored);
    setReady(true);
    try {
      document.documentElement.dataset.view = stored;
    } catch {
      /* yok sayılır */
    }
  }, []);

  /**
   * Kullanıcının AÇIK seçimi. Yalnızca görünüm anahtarından (ve /ayarlar
   * sayfasındaki aynı anahtardan) çağrılır; bu yüzden localStorage'a yazmak
   * "seçim yapıldı" işaretinin kendisidir ve bundan sonra rolden gelen
   * çerez varsayılanı devreye girmez.
   */
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
 *
 * `resolveInitialView()` ile AYNI ÜÇ KADEMEYİ aynı sırada uygular
 * (localStorage -> çerez -> 'panel'). Mantık burada JS metni olarak
 * yeniden yazılmak zorunda (betik modül sisteminden önce çalışıyor), ama
 * anahtar/çerez adları ve mod listesi yukarıdaki sabitlerden enterpolasyonla
 * geliyor — adlar tek yerde değişir.
 */
export const VIEW_BOOTSTRAP_SCRIPT = `(function(){
var M=${JSON.stringify(VIEW_MODES)};
function ok(v){return M.indexOf(v)>-1?v:null;}
var v=null;
try{v=ok(localStorage.getItem(${JSON.stringify(VIEW_STORAGE_KEY)}));}catch(e){}
if(!v){try{var m=document.cookie.match(/(?:^|;\\s*)${VIEW_COOKIE_NAME}=([^;]*)/);if(m)v=ok(decodeURIComponent(m[1]));}catch(e){}}
try{document.documentElement.setAttribute('data-view',v||'panel');}catch(e){}
})();`;
