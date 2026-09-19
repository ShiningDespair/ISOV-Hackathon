"use client";

/**
 * GIRIS FORMU — dort kip, tek bilesen.
 *
 *   giris    : e-posta + sifre
 *   unuttum  : sifirlama baglantisi iste
 *   sifirla  : ?token= ile gelindiginde yeni sifre belirle
 *   zorunlu  : must_change_password ise sifre degistirmeden ilerlenemez
 *
 * Dort kip AYNI bilesende, cunku hepsi ayni "kimlik kurtarma" akisinin
 * parcasi ve aralarinda durum tasiniyor (girilen e-posta "unuttum" kipine,
 * girilen sifre "zorunlu" kipinde `current` alanina gecer). Ayri sayfalara
 * bolmek kullaniciyi ayni bilgiyi iki kez yazmaya zorlardi.
 *
 * HATA AYRIMI onemli ve kasten yapiliyor (bkz. lib/api-auth.ts login()):
 *   401 yanlis sifre · 423 hesap kilitli · 429 IP hiz siniri.
 * Uc durumu tek mesajla gostermek, kilitli hesabin sahibini sifresini
 * tekrar tekrar denemeye ve kilidi uzatmaya iter.
 *
 * `useSearchParams()` KULLANILMIYOR: o kanca statik render edilen sayfada
 * Suspense sarmalayici zorunlu kiliyor. `devam` ve `token` mount sonrasi
 * `window.location` uzerinden okunuyor.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  changePassword,
  isNotImplemented,
  login,
  requestPasswordReset,
  resetPassword,
  safeNextPath,
} from "@/lib/api-auth";
import { Notice } from "@/components/settings/Parts";

import { isEmailShaped, isPasswordValid, PASSWORD_MIN_LENGTH } from "./password";
import { PasswordField, TextField } from "./PasswordField";

type Mode = "giris" | "unuttum" | "sifirla" | "zorunlu";

export function LoginForm() {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [mode, setMode] = useState<Mode>("giris");
  const [devam, setDevam] = useState("/");
  const [token, setToken] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "basari" | "hata"; message: string } | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  /** 501 ayri gosterilir: "hata" degil, "henuz yok". */
  const [eksikOzellik, setEksikOzellik] = useState<string | null>(null);

  // `devam` ve `token` yalnizca tarayicida okunabilir.
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      setDevam(safeNextPath(sp.get("devam")));
      const t = (sp.get("token") ?? "").trim();
      if (t) {
        setToken(t);
        setMode("sifirla");
      }
    } catch {
      /* adres cozulemedi — varsayilanla devam */
    }
  }, []);

  // Kip degisince odak yeni basliga gitsin; ekran okuyucu nerede oldugunu
  // bilsin. ILK RENDER HARIC: sayfa ilk acildiginda odak e-posta alaninda
  // kalir (autoFocus), kullanici dogrudan yazmaya baslayabilir.
  const ilkRender = useRef(true);
  useEffect(() => {
    if (ilkRender.current) {
      ilkRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [mode]);

  const reset = useCallback(() => {
    setNotice(null);
    setEksikOzellik(null);
    setFieldError({});
  }, []);

  const go = useCallback(
    (target: string) => {
      router.replace(target);
      // Panel sunucu bileseni; cerez yeni geldi, veriyi yeniden cekmeli.
      router.refresh();
    },
    [router],
  );

  /* --- giris ----------------------------------------------------- */
  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    reset();

    const errs: Record<string, string> = {};
    if (!isEmailShaped(email)) errs.email = "Geçerli bir e-posta adresi yazın.";
    if (!password) errs.password = "Şifrenizi yazın.";
    if (Object.keys(errs).length) {
      setFieldError(errs);
      setNotice({ kind: "hata", message: "Formda eksik ya da hatalı alan var." });
      return;
    }

    setBusy(true);
    const res = await login({ email, password });
    setBusy(false);

    if (!res.ok) {
      if (isNotImplemented(res)) setEksikOzellik(res.error);
      else setNotice({ kind: "hata", message: res.error });
      return;
    }

    const data = res.data ?? {};
    const zorunlu = Boolean(data.must_change_password ?? data.user?.must_change_password);
    if (zorunlu) {
      setMode("zorunlu");
      setNotice({
        kind: "hata",
        message:
          "Bu hesabın şifresi yönetici tarafından sıfırlanmış. Devam etmek için yeni bir şifre belirlemeniz gerekiyor.",
      });
      return;
    }
    go(devam);
  }

  /* --- zorunlu sifre degistirme ---------------------------------- */
  async function submitForced(e: React.FormEvent) {
    e.preventDefault();
    reset();

    const errs: Record<string, string> = {};
    if (!isPasswordValid(nextPassword)) {
      errs.next = `Yeni şifre en az ${PASSWORD_MIN_LENGTH} karakter olmalı, bir harf ve bir rakam içermeli.`;
    }
    if (nextPassword !== repeatPassword) errs.repeat = "İki şifre aynı değil.";
    if (nextPassword && nextPassword === password) {
      errs.next = "Yeni şifre eskisiyle aynı olamaz.";
    }
    if (Object.keys(errs).length) {
      setFieldError(errs);
      setNotice({ kind: "hata", message: "Yeni şifre koşulları karşılanmıyor." });
      return;
    }

    setBusy(true);
    const res = await changePassword(password, nextPassword);
    setBusy(false);

    if (!res.ok) {
      if (isNotImplemented(res)) setEksikOzellik(res.error);
      else setNotice({ kind: "hata", message: res.error });
      return;
    }
    go(devam);
  }

  /* --- sifirlama baglantisi iste --------------------------------- */
  async function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    reset();
    if (!isEmailShaped(email)) {
      setFieldError({ email: "Geçerli bir e-posta adresi yazın." });
      return;
    }

    setBusy(true);
    const res = await requestPasswordReset(email);
    setBusy(false);

    if (!res.ok) {
      if (isNotImplemented(res)) setEksikOzellik(res.error);
      else setNotice({ kind: "hata", message: res.error });
      return;
    }
    // Yanit her durumda AYNI: adresin kayitli olup olmadigi sizdirilmaz.
    setNotice({
      kind: "basari",
      message:
        "Bu adres kayıtlıysa sıfırlama bağlantısı gönderildi. E-posta gönderimi kapalıysa yöneticiniz size tek kullanımlık bir bağlantı oluşturabilir.",
    });
  }

  /* --- token ile yeni sifre -------------------------------------- */
  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    reset();

    const errs: Record<string, string> = {};
    if (!isPasswordValid(nextPassword)) {
      errs.next = `Şifre en az ${PASSWORD_MIN_LENGTH} karakter olmalı, bir harf ve bir rakam içermeli.`;
    }
    if (nextPassword !== repeatPassword) errs.repeat = "İki şifre aynı değil.";
    if (Object.keys(errs).length) {
      setFieldError(errs);
      return;
    }

    setBusy(true);
    const res = await resetPassword(token, nextPassword);
    setBusy(false);

    if (!res.ok) {
      if (isNotImplemented(res)) setEksikOzellik(res.error);
      else setNotice({ kind: "hata", message: res.error });
      return;
    }
    setMode("giris");
    setToken("");
    setPassword("");
    setNextPassword("");
    setRepeatPassword("");
    setNotice({
      kind: "basari",
      message: "Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.",
    });
  }

  const title =
    mode === "giris"
      ? "Giriş yapın"
      : mode === "unuttum"
        ? "Şifrenizi mi unuttunuz?"
        : mode === "sifirla"
          ? "Yeni şifre belirleyin"
          : "Şifrenizi değiştirin";

  return (
    <div className="otur-kart">
      <h1 ref={headingRef} tabIndex={-1} className="u-headline u-headline-md otur-odak">
        {title}
      </h1>

      {mode === "giris" && devam !== "/" ? (
        <p className="u-body u-body-soft mt-1 text-[0.8125rem] leading-snug">
          Giriş yaptıktan sonra gitmek istediğiniz sayfaya döneceksiniz.
        </p>
      ) : null}

      <div className="mt-3">
        <Notice kind={notice?.kind ?? null} message={notice?.message ?? null} />
        {eksikOzellik ? (
          <p className="ayar-uyari u-body mt-2">
            <strong>Henüz uygulanmadı.</strong> {eksikOzellik}
          </p>
        ) : null}
      </div>

      {mode === "giris" ? (
        <form onSubmit={submitLogin} noValidate className="mt-4 space-y-4">
          <TextField
            label="E-posta"
            type="email"
            inputMode="email"
            autoComplete="username"
            value={email}
            onChange={setEmail}
            error={fieldError.email}
            autoFocus
            placeholder="ad.soyad@kurum.com.tr"
          />
          <PasswordField
            label="Şifre"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            error={fieldError.password}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="ayar-btn ayar-btn-primary" disabled={busy}>
              {busy ? "Giriş yapılıyor…" : "Giriş yap"}
            </button>
            <button
              type="button"
              className="otur-mini-btn"
              onClick={() => {
                reset();
                setMode("unuttum");
              }}
            >
              Şifremi unuttum
            </button>
          </div>
        </form>
      ) : null}

      {mode === "zorunlu" ? (
        <form onSubmit={submitForced} noValidate className="mt-4 space-y-4">
          <p className="u-body text-[0.9375rem] leading-snug">
            <strong>{email}</strong> hesabı için yeni bir şifre belirleyin.
          </p>
          <PasswordField
            label="Yeni şifre"
            value={nextPassword}
            onChange={setNextPassword}
            error={fieldError.next}
            hint={`En az ${PASSWORD_MIN_LENGTH} karakter, bir harf ve bir rakam.`}
            showStrength
            autoFocus
          />
          <PasswordField
            label="Yeni şifre (yeniden)"
            value={repeatPassword}
            onChange={setRepeatPassword}
            error={fieldError.repeat}
          />
          <button type="submit" className="ayar-btn ayar-btn-primary" disabled={busy}>
            {busy ? "Kaydediliyor…" : "Şifreyi değiştir ve devam et"}
          </button>
        </form>
      ) : null}

      {mode === "unuttum" ? (
        <form onSubmit={submitForgot} noValidate className="mt-4 space-y-4">
          <p className="u-body text-[0.9375rem] leading-snug">
            Hesabınızın e-posta adresini yazın. Kayıtlıysa sıfırlama bağlantısı
            gönderilir.
          </p>
          <TextField
            label="E-posta"
            type="email"
            inputMode="email"
            autoComplete="username"
            value={email}
            onChange={setEmail}
            error={fieldError.email}
            autoFocus
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="ayar-btn ayar-btn-primary" disabled={busy}>
              {busy ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}
            </button>
            <button
              type="button"
              className="otur-mini-btn"
              onClick={() => {
                reset();
                setMode("giris");
              }}
            >
              Girişe dön
            </button>
          </div>
        </form>
      ) : null}

      {mode === "sifirla" ? (
        <form onSubmit={submitReset} noValidate className="mt-4 space-y-4">
          <p className="u-body text-[0.9375rem] leading-snug">
            Sıfırlama bağlantısıyla geldiniz. Yeni şifrenizi belirleyin.
          </p>
          <PasswordField
            label="Yeni şifre"
            value={nextPassword}
            onChange={setNextPassword}
            error={fieldError.next}
            hint={`En az ${PASSWORD_MIN_LENGTH} karakter, bir harf ve bir rakam.`}
            showStrength
            autoFocus
          />
          <PasswordField
            label="Yeni şifre (yeniden)"
            value={repeatPassword}
            onChange={setRepeatPassword}
            error={fieldError.repeat}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="ayar-btn ayar-btn-primary" disabled={busy}>
              {busy ? "Kaydediliyor…" : "Şifreyi kaydet"}
            </button>
            <button
              type="button"
              className="otur-mini-btn"
              onClick={() => {
                reset();
                setToken("");
                setMode("giris");
              }}
            >
              Girişe dön
            </button>
          </div>
        </form>
      ) : null}

      <p className="u-body u-body-soft mt-6 border-t border-rule pt-3 text-[0.875rem]">
        Hesabınız yok mu?{" "}
        <Link
          href={devam !== "/" ? `/kayit?devam=${encodeURIComponent(devam)}` : "/kayit"}
          className="u-link-underline text-ink"
        >
          Adım adım kayıt olun
        </Link>
        .
      </p>
    </div>
  );
}
