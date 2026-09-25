"use client";

/**
 * "HESABIM" MENÜSÜ — üst bardaki oturum göstergesi
 *
 * Neden var: üst barda oturumun varlığına dair hiçbir işaret yoktu ve
 * çıkış yapmanın arayüzde bir yolu yoktu. Kullanıcının şikâyeti birebir
 * "giriş çıkış yapılı mı onu bile göremiyoruz" idi.
 *
 * Oturum `useSession()` bağlamından okunur; BURADA YENİ BİR `/auth/me`
 * İSTEĞİ ATILMAZ — bağlam onu sayfa başına bir kez çekiyor.
 *
 * Dört duruma dört ayrı davranış (`SessionStatus`):
 *   bilinmiyor — henüz bilmiyoruz. Nötr bir yer tutucu basılır. "Giriş yap"
 *                YAZILMAZ: bilmediğimiz şeyi söylemek, hiç söylememekten
 *                kötüdür ve giriş yapmış kullanıcıya yanlış bilgi verir.
 *   var        — ad, e-posta, pozisyon, kurum + Ayarlar/Yönetim/Durum + Çıkış.
 *   yok        — Giriş Yap / Kayıt Ol.
 *   belirsiz   — uç yayında değil ya da ağ hatası. Kullanıcı oturumundan
 *                ATILMAZ; nötr "Hesap" düğmesi ve durumun doğrulanamadığını
 *                söyleyen kısa bir not gösterilir.
 *
 * Hiçbir fonksiyon exception fırlatmaz (docs/SADELESTIRME.md §0.8).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { logout } from "@/lib/api-auth";
import { POSITION_LABELS } from "@/lib/api-panel";
import { useSession } from "./SessionProvider";

/* ------------------------------------------------------------------ */
/* Küçük, hata yutan yardımcılar                                      */
/* ------------------------------------------------------------------ */

/** Boş/whitespace değerleri null'a indirger — "alan yoksa satırı hiç basma". */
function metin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/**
 * Ad soyaddan en çok iki baş harf. Büyütme `tr-TR` yerel ayarıyla yapılır:
 * "ismail" -> "İ" (İngilizce yerelde "I" olurdu).
 */
function basHarfler(fullName: string | null): string {
  if (!fullName) return "?";
  const parcalar = fullName.split(/\s+/).filter(Boolean);
  if (parcalar.length === 0) return "?";
  const ilk = parcalar[0].charAt(0);
  const son = parcalar.length > 1 ? parcalar[parcalar.length - 1].charAt(0) : "";
  return (ilk + son).toLocaleUpperCase("tr-TR");
}

/**
 * Kurum adı. `/auth/me` yanıtı `user.tenant = {tenant_key, name}` taşıyor
 * ama `SessionUser` tipi (lib/types-auth.ts, başka bir işin dosyası)
 * yalnızca `tenant_key`i bildiriyor. Tipi değiştirmek yerine burada
 * savunmacı okunuyor: alan yoksa satır hiç basılmaz.
 */
function kurumAdi(user: unknown): string | null {
  if (!user || typeof user !== "object") return null;
  const tenant = (user as { tenant?: unknown }).tenant;
  if (tenant && typeof tenant === "object") {
    const ad = metin((tenant as { name?: unknown }).name);
    if (ad) return ad;
    const anahtar = metin((tenant as { tenant_key?: unknown }).tenant_key);
    if (anahtar) return anahtar;
  }
  return metin((user as { tenant_key?: unknown }).tenant_key);
}

/** Rol etiketi — yalnızca üye dışındaki roller için basılır. */
function rolEtiketi(role: unknown): string | null {
  if (role === "admin") return "Yönetici";
  if (role === "editor") return "Editör";
  return null;
}

/* ------------------------------------------------------------------ */
/* Bileşen                                                            */
/* ------------------------------------------------------------------ */

export function AccountMenu() {
  const { status, me, isAdmin, refresh } = useSession();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [cikiyor, setCikiyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const kokRef = useRef<HTMLDivElement | null>(null);
  const dugmeRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  /** Menüyü kapat; istenirse odağı düğmeye geri ver. */
  const kapat = useCallback((odakDugmeye = false) => {
    setOpen(false);
    setHata(null);
    if (odakDugmeye) {
      // Odağı geri vermek klavye kullanıcısı için zorunlu: menü kapanınca
      // odak body'ye düşerse kullanıcı sayfanın başına atılmış olur.
      try {
        dugmeRef.current?.focus();
      } catch {
        /* yok sayılır */
      }
    }
  }, []);

  /* Dışarı tıklama kapatır. `pointerdown` seçildi çünkü `click`
     beklerken açılan menü, dışarıdaki düğmenin ilk tıklamasını yutar. */
  useEffect(() => {
    if (!open) return;

    const disariTikla = (ev: Event) => {
      const kok = kokRef.current;
      const hedef = ev.target;
      if (!kok || !(hedef instanceof Node)) return;
      if (!kok.contains(hedef)) setOpen(false);
    };

    document.addEventListener("pointerdown", disariTikla, true);
    return () => document.removeEventListener("pointerdown", disariTikla, true);
  }, [open]);

  /** Escape: kapat + odağı düğmeye döndür. Menünün her yerinde çalışır. */
  const tusla = useCallback(
    (ev: ReactKeyboardEvent<HTMLDivElement>) => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        kapat(true);
        return;
      }
      if (!open) return;
      if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp" && ev.key !== "Home" && ev.key !== "End") {
        return;
      }
      // role="menu" sözü verdiğimiz için ok tuşları da çalışsın. Tab akışı
      // BOZULMUYOR: oklar ek bir kolaylık, tek gezinme yolu değil.
      const menu = menuRef.current;
      if (!menu) return;
      const ogeler = Array.from(
        menu.querySelectorAll<HTMLElement>('a[href],button:not([disabled])'),
      );
      if (ogeler.length === 0) return;
      ev.preventDefault();
      const simdiki = ogeler.indexOf(document.activeElement as HTMLElement);
      let hedef = 0;
      if (ev.key === "End") hedef = ogeler.length - 1;
      else if (ev.key === "Home") hedef = 0;
      else if (ev.key === "ArrowDown") hedef = simdiki < 0 ? 0 : (simdiki + 1) % ogeler.length;
      else hedef = simdiki <= 0 ? ogeler.length - 1 : simdiki - 1;
      try {
        ogeler[hedef].focus();
      } catch {
        /* yok sayılır */
      }
    },
    [kapat, open],
  );

  /**
   * Odak menüden tamamen çıkarsa kapat. `relatedTarget` kökün içindeyse
   * (menüden menüye Tab) kapatılmaz. `relatedTarget === null` durumunda da
   * KAPATILMAZ: bu, odağın tarayıcı arayüzüne/adres çubuğuna gitmesi
   * demektir ve kullanıcı sekmeye döndüğünde menüyü kapanmış bulmasın.
   * Escape yolu bundan etkilenmez, o kendi başına kapatıyor.
   */
  const odakCikti = useCallback((ev: ReactFocusEvent<HTMLDivElement>) => {
    const sonraki = ev.relatedTarget;
    if (!(sonraki instanceof Node)) return;
    if (!kokRef.current?.contains(sonraki)) setOpen(false);
  }, []);

  /** Çıkış: sunucu oturumu iptal etmeden kullanıcıyı çıkmış gibi göstermeyiz. */
  const cikisYap = useCallback(async () => {
    if (cikiyor) return;
    setCikiyor(true);
    setHata(null);

    const res = await logout();

    if (!res.ok) {
      // Oturum ATILMIYOR: iptal doğrulanmadı, menüde kalıp nedeni söylüyoruz.
      setCikiyor(false);
      setHata(res.error || "Çıkış yapılamadı. Lütfen yeniden deneyin.");
      return;
    }

    setCikiyor(false);
    setOpen(false);
    refresh();
    router.push("/giris");
  }, [cikiyor, refresh, router]);

  /* ---------------------------------------------------------------- */
  /* bilinmiyor — nötr yer tutucu                                     */
  /* ---------------------------------------------------------------- */
  if (status === "bilinmiyor") {
    return (
      <span
        className="hesap-iskelet"
        aria-hidden="true"
        data-durum="bilinmiyor"
      />
    );
  }

  /* ---------------------------------------------------------------- */
  /* yok — giriş / kayıt                                              */
  /* ---------------------------------------------------------------- */
  if (status === "yok") {
    return (
      <span className="flex items-center gap-3" data-durum="yok">
        <Link href="/giris" className="u-kicker u-link-underline text-ink">
          Giriş Yap
        </Link>
        <Link href="/kayit" className="u-kicker u-link-underline text-accent">
          Kayıt Ol
        </Link>
      </span>
    );
  }

  /* ---------------------------------------------------------------- */
  /* var / belirsiz — açılır menü                                     */
  /* ---------------------------------------------------------------- */
  const oturumVar = status === "var";
  const kullanici = oturumVar ? me?.user : null;

  const adSoyad = metin(kullanici?.full_name);
  const eposta = metin(kullanici?.email);
  const unvan = metin(kullanici?.title);
  const pozisyon = metin(POSITION_LABELS[String(me?.profile?.position_code ?? "")]);
  const kurum = oturumVar ? kurumAdi(kullanici) : null;
  const rol = oturumVar ? rolEtiketi(kullanici?.role) : null;

  const dugmeMetni = oturumVar ? (adSoyad ?? eposta ?? "Hesabım") : "Hesap";

  /* Tek bir kimlik satırı bile yoksa blok HİÇ basılmaz — boş kutu ve
     anlamsız ayıraç üretmesin. "—" de yazılmaz (docs/SADELESTIRME.md §0.3
     sayılar için; burada aynı ilke: bilinmeyen alan satır açmaz). */
  const kimlikVar = Boolean(adSoyad || eposta || pozisyon || unvan || kurum || rol);

  return (
    <div
      ref={kokRef}
      className="hesap-kok"
      onKeyDown={tusla}
      onBlur={odakCikti}
      data-durum={status}
    >
      <button
        ref={dugmeRef}
        type="button"
        className="hesap-dugme"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label={oturumVar ? `Hesabım: ${dugmeMetni}` : "Hesap menüsü"}
        onClick={() => {
          setHata(null);
          setOpen((v) => !v);
        }}
      >
        {oturumVar ? (
          <span className="hesap-bas-harf" aria-hidden="true">
            {basHarfler(adSoyad ?? eposta)}
          </span>
        ) : null}
        <span className="hesap-ad">{dugmeMetni}</span>
      </button>

      {open ? (
        <div ref={menuRef} id={menuId} className="hesap-menu">
          {oturumVar && kimlikVar ? (
            <>
              <div className="hesap-menu-kimlik">
                {adSoyad ? <p className="hesap-menu-ad">{adSoyad}</p> : null}
                {eposta ? <p className="hesap-menu-satir">{eposta}</p> : null}
                {pozisyon ? <p className="hesap-menu-satir">{pozisyon}</p> : null}
                {!pozisyon && unvan ? (
                  <p className="hesap-menu-satir">{unvan}</p>
                ) : null}
                {kurum ? <p className="hesap-menu-satir">{kurum}</p> : null}
                {rol ? <p className="hesap-menu-rol">{rol}</p> : null}
              </div>
              <div className="hesap-ayirac" />
            </>
          ) : null}

          {!oturumVar ? (
            <p className="hesap-not">
              Oturum durumu doğrulanamadı — sunucuya ulaşılamıyor. Oturumunuz
              açıksa açık kalmaya devam ediyor.
            </p>
          ) : null}

          {/* role="menu" LISTENIN kendisinde: kimlik bloku, not ve hata
              satiri bir menunun gecerli cocugu degil (yalnizca menuitem ve
              group olabilir), bu yuzden menu rolunun disinda duruyorlar. */}
          <ul className="hesap-menu-liste" role="menu" aria-label="Hesap işlemleri">
            <li role="none">
              <Link
                href="/ayarlar"
                role="menuitem"
                className="hesap-menu-link"
                onClick={() => setOpen(false)}
              >
                Ayarlar
              </Link>
            </li>
            {isAdmin ? (
              <li role="none">
                <Link
                  href="/admin"
                  role="menuitem"
                  className="hesap-menu-link"
                  onClick={() => setOpen(false)}
                >
                  Yönetim
                </Link>
              </li>
            ) : null}
            <li role="none">
              <Link
                href="/durum"
                role="menuitem"
                className="hesap-menu-link"
                onClick={() => setOpen(false)}
              >
                Özellik Durumu
              </Link>
            </li>
            {oturumVar ? (
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="hesap-cikis"
                  disabled={cikiyor}
                  onClick={() => {
                    void cikisYap();
                  }}
                >
                  {cikiyor ? "Çıkılıyor…" : "Çıkış Yap"}
                </button>
              </li>
            ) : null}
          </ul>

          {hata ? (
            <p className="hesap-hata" role="alert">
              {hata}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
