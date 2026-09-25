"use client";

/**
 * OTURUM BAĞLAMI — tek `/auth/me` çağrısı
 *
 * Neden var: hem `SessionGuard` (geçersiz çerezde yönlendirme) hem üst bardaki
 * "Yönetim" bağlantısı (yalnızca admin görsün) oturum sahibini bilmek zorunda.
 * İkisi ayrı ayrı `/auth/me` çağırsa her sayfa yüklemesinde iki istek olurdu.
 * Burada bir kez çekilir, ikisi de buradan okur.
 *
 * `A11yProvider`/`ViewProvider` deseniyle aynı: sunucu daima "bilinmiyor" ile
 * render eder, gerçek değer mount sonrası gelir. Böylece hidrasyon uyuşmazlığı
 * olmaz ve sunucu tarafında oturum okumak için her sayfaya istek eklenmez.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { getMe } from "@/lib/api-auth";
import type { MeResponse } from "@/lib/types-auth";

/**
 * `bilinmiyor` — henüz denenmedi (sunucu render'ı ve ilk boyama)
 * `yok`        — oturum yok ya da geçersiz (401/403)
 * `var`        — oturum geçerli
 * `belirsiz`   — uç yayında değil (501/404) ya da ağ hatası. Bu durumda
 *                kullanıcıyı oturumundan ATMIYORUZ: geçici olabilir ve
 *                backend'in auth bölümü yayına girmeden herkesi giriş
 *                sayfasına kilitlemek döngü üretir.
 */
export type SessionStatus = "bilinmiyor" | "yok" | "var" | "belirsiz";

interface SessionContextValue {
  status: SessionStatus;
  me: MeResponse | null;
  isAdmin: boolean;
  /**
   * Paylaşılan veriyi değiştirebilir mi (admin ya da editor). Backend aynı
   * kuralı `requireRole('admin','editor')` ile ZORLUYOR; buradaki bayrak
   * yalnızca kullanıcıya 403 yedirecek düğmeleri göstermemek için.
   */
  canEdit: boolean;
  /** Profil/rol değişiminden sonra yeniden okumak için. */
  refresh: () => void;
}

const SessionContext = createContext<SessionContextValue>({
  status: "bilinmiyor",
  me: null,
  isAdmin: false,
  canEdit: false,
  refresh: () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("bilinmiyor");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const res = await getMe();
      if (cancelled) return;

      if (res.ok) {
        setMe(res.data);
        setStatus("var");
        return;
      }
      // 401/403 => gerçekten oturum yok. Diğer her şey (501/404/timeout)
      // "karar veremedim" demektir; kullanıcıyı atmak için kanıt değil.
      setMe(null);
      setStatus(res.status === 401 || res.status === 403 ? "yok" : "belirsiz");
    })();

    return () => {
      cancelled = true;
    };
  }, [tick]);

  const isAdmin = status === "var" && me?.user?.role === "admin";
  const canEdit =
    status === "var" && (me?.user?.role === "admin" || me?.user?.role === "editor");

  return (
    <SessionContext.Provider value={{ status, me, isAdmin, canEdit, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
