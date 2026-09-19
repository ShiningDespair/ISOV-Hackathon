"use client";

/**
 * KAYIT SIHIRBAZI — alti adim, tek istek
 *
 * NEDEN ADIM ADIM: tek uzun formda ad soyad, sifre, pozisyon, iki sektor
 * alani, ilgi alanlari, vakit ve bulten ayarlari yan yana durur; kullanici
 * ilk ekranda 15 alan gorur ve vazgecer. Alti adimin her birinde 1–3 karar
 * var ve HER ADIMIN VARSAYILANI HAZIR — hicbir adim kullaniciyi kilitlemez,
 * "İleri" demek her zaman mumkun.
 *
 * KAYIT ISTEGI SON ADIMDA, TEK SEFERDE gonderilir. Adim adim kayit
 * (her adimda PATCH) yarim kalmis hesaplar uretir ve e-posta dogrulama
 * akisini bozardi.
 *
 * ISTEK SIRASI ve HATA FELSEFESI:
 *   1) POST /auth/register   — BASARISIZ OLURSA her sey durur, form kalir.
 *   2) PUT  /me/profile      — basarisiz olursa KAYIT GECERLI SAYILIR.
 *   3) PUT  /me/newsletter   — ayni.
 * Sebep: hesap olustuktan sonra kullaniciya "kayit basarisiz" demek onu
 * ayni e-postayla tekrar denemeye iter ve 409 alir. Bu yuzden 2 ve 3
 * basarisizsa kullanici bilgilendirilir, kaydi KAYBETMEZ; tercihler
 * /ayarlar sayfasindan tamamlanabilir.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getInterests,
  getTaxonomy,
  isNotImplemented,
  register,
  safeNextPath,
  saveNewsletter,
  saveProfile,
} from "@/lib/api-auth";
import type { InterestTag, Taxonomy } from "@/lib/types-auth";
import { Notice } from "@/components/settings/Parts";
import { isEmailShaped, isPasswordValid, PASSWORD_MIN_LENGTH } from "@/components/auth/password";

import { DerlemeAnimasyonu, derlemeSatirlari } from "./DerlemeAnimasyonu";
import {
  AdimBulten,
  AdimHesap,
  AdimIlgi,
  AdimPozisyon,
  AdimSektor,
  AdimVakit,
} from "./Steps";
import {
  defaultInterestsFor,
  FALLBACK_INTERESTS,
  FALLBACK_TAXONOMY,
  mergeInterests,
  mergeTaxonomy,
} from "./taxonomy-fallback";

const MAX_IKINCIL = 3;
const MAX_ILGI = 12;

/** Adim basliklari — ilerleme gostergesi ve odak hedefi buradan okur. */
const ADIMLAR = [
  { id: "hesap", kicker: "Hesap", title: "Hesabınızı oluşturun" },
  { id: "pozisyon", kicker: "Pozisyon", title: "Şirkette ne yapıyorsunuz?" },
  { id: "sektor", kicker: "Sektör", title: "Hangi sektörde çalışıyorsunuz?" },
  { id: "ilgi", kicker: "İlgi alanları", title: "Neleri takip etmek istiyorsunuz?" },
  { id: "vakit", kicker: "Vakit", title: "Günde ne kadar vaktiniz var?" },
  { id: "bulten", kicker: "Bülten", title: "E-posta bülteni ister misiniz?" },
] as const;

interface Draft {
  fullName: string;
  email: string;
  password: string;
  position: string;
  sectorPrimary: string;
  sectorSecondary: string[];
  interests: string[];
  timeBudget: number;
  subscribed: boolean;
  frequency: "gunluk" | "haftalik";
  sendHour: number;
}

/**
 * Varsayilanlar. Birincil sektor bos DEGIL: alan zorunlu oldugu icin bos
 * varsayilan kullaniciyi 3. adimda kilitlerdi. En kalabalik imalat
 * bolumu (C28) onceden isaretli gelir ve degistirilebilir.
 */
const DRAFT_DEFAULTS: Draft = {
  fullName: "",
  email: "",
  password: "",
  position: "ust-yonetim",
  sectorPrimary: "C28",
  sectorSecondary: [],
  interests: [],
  timeBudget: 5,
  subscribed: true,
  frequency: "gunluk",
  sendHour: 8,
};

type Phase = "form" | "animasyon" | "ozet";

interface Sonuc {
  profilKaydedildi: boolean;
  profilHata: string | null;
  bultenKaydedildi: boolean;
  bultenHata: string | null;
}

export function KayitSihirbazi() {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [taxonomy, setTaxonomy] = useState<Taxonomy>(FALLBACK_TAXONOMY);
  const [interests, setInterests] = useState<InterestTag[]>(FALLBACK_INTERESTS);
  /** Taksonomi sunucudan gelmediyse kullaniciya sessizce yalan soylemiyoruz. */
  const [metaNot, setMetaNot] = useState<string | null>(null);

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(DRAFT_DEFAULTS);
  /** Kullanici ilgi alanlarina dokunduysa pozisyon degisimi secimi EZMEZ. */
  const [ilgiDokunuldu, setIlgiDokunuldu] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "basari" | "hata"; message: string } | null>(null);
  const [eksikOzellik, setEksikOzellik] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [phase, setPhase] = useState<Phase>("form");
  const [sonuc, setSonuc] = useState<Sonuc | null>(null);
  const [devam, setDevam] = useState("/");

  /* --- taksonomi ------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [tax, ilgi] = await Promise.all([getTaxonomy(), getInterests()]);
      if (cancelled) return;

      setTaxonomy(mergeTaxonomy(tax.ok ? tax.data : null));
      setInterests(mergeInterests(ilgi.ok ? ilgi.data : null));

      if (!tax.ok || !ilgi.ok) {
        const bozuk = !tax.ok ? tax : ilgi;
        setMetaNot(
          isNotImplemented(bozuk)
            ? "Seçenek listesi sunucudan alınamadı: /meta uç noktaları henüz uygulanmadı. Yerel liste kullanılıyor; seçimleriniz geçerli."
            : "Seçenek listesi sunucudan alınamadı, yerel liste kullanılıyor. Seçimleriniz geçerli.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* --- `?devam=` ------------------------------------------------- */
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      setDevam(safeNextPath(sp.get("devam")));
    } catch {
      /* yok sayilir */
    }
  }, []);

  /* --- pozisyona gore on isaretli ilgi alanlari ------------------ */
  useEffect(() => {
    if (ilgiDokunuldu) return;
    setDraft((d) => ({
      ...d,
      interests: defaultInterestsFor(d.position, interests),
    }));
  }, [draft.position, interests, ilgiDokunuldu]);

  /* --- odak yonetimi --------------------------------------------- */
  // ILK RENDER HARIC: adim ya da kip degisince odak yeni adimin basligina
  // gider, ekran okuyucu nerede oldugunu bastan okur. Ilk acilista odagi
  // zorla tasimiyoruz — sayfa yeni yuklenmisken odagi kaydirmak hem
  // beklenmedik bir kaydirma yapar hem de ilk alanin `autoFocus`unu ezer.
  const ilkRender = useRef(true);
  useEffect(() => {
    if (ilkRender.current) {
      ilkRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step, phase]);

  const positions = taxonomy.positions;
  const positionLabel = useMemo(
    () => positions.find((p) => p.code === draft.position)?.label ?? draft.position,
    [positions, draft.position],
  );
  const sectorLabel = useMemo(
    () =>
      taxonomy.sectors.find((s) => s.code === draft.sectorPrimary)?.label ??
      draft.sectorPrimary,
    [taxonomy.sectors, draft.sectorPrimary],
  );
  const vakit = useMemo(
    () => taxonomy.timeBudgets.find((t) => t.minutes === draft.timeBudget) ?? null,
    [taxonomy.timeBudgets, draft.timeBudget],
  );
  const ilgiEtiketleri = useMemo(() => {
    const map = new Map(interests.map((t) => [t.slug, t.label]));
    return draft.interests.map((s) => map.get(s) ?? s);
  }, [interests, draft.interests]);

  const patch = useCallback((p: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...p }));
  }, []);

  /* --- adim dogrulama -------------------------------------------- */
  function dogrula(index: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (index === 0) {
      if (draft.fullName.trim().length < 3) {
        e.fullName = "Adınızı ve soyadınızı yazın.";
      }
      if (!isEmailShaped(draft.email)) {
        e.email = "Geçerli bir e-posta adresi yazın.";
      }
      if (!isPasswordValid(draft.password)) {
        e.password = `Şifre en az ${PASSWORD_MIN_LENGTH} karakter olmalı, en az bir harf ve bir rakam içermeli.`;
      }
    }
    if (index === 2 && !draft.sectorPrimary) {
      e.sectorPrimary = "Bir birincil sektör seçin.";
    }
    return e;
  }

  function ileri() {
    const e = dogrula(step);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      setNotice({
        kind: "hata",
        message:
          step === 0
            ? "Devam etmek için hesap bilgilerini tamamlayın."
            : "Bu adımda eksik bir seçim var.",
      });
      return;
    }
    setNotice(null);
    setStep((s) => Math.min(ADIMLAR.length - 1, s + 1));
  }

  function geri() {
    setNotice(null);
    setErrors({});
    setStep((s) => Math.max(0, s - 1));
  }

  /* --- gonderim -------------------------------------------------- */
  async function gonder() {
    // Son adima kadar atlanmis bir hata kalmis olabilir; hepsini yeniden bak.
    for (let i = 0; i < ADIMLAR.length; i += 1) {
      const e = dogrula(i);
      if (Object.keys(e).length > 0) {
        setErrors(e);
        setStep(i);
        setNotice({ kind: "hata", message: "Bu adımda düzeltilmesi gereken bir alan var." });
        return;
      }
    }

    setBusy(true);
    setNotice(null);
    setEksikOzellik(null);

    // 1) Hesap. Basarisizsa hicbir sey degismez, form yerinde kalir.
    const kayit = await register({
      email: draft.email,
      password: draft.password,
      full_name: draft.fullName,
      title: positionLabel,
    });

    if (!kayit.ok) {
      setBusy(false);
      if (isNotImplemented(kayit)) {
        setEksikOzellik(
          `${kayit.error} Girdiğiniz bilgiler formda duruyor; uç nokta yayına alındığında "Kaydı tamamla" düğmesi çalışacak.`,
        );
      } else {
        setNotice({ kind: "hata", message: kayit.error });
      }
      return;
    }

    // 2) Profil, 3) Bulten. Hatalari kaydi GECERSIZ KILMAZ.
    const profil = await saveProfile({
      position_code: draft.position,
      primary_sector_code: draft.sectorPrimary,
      secondary_sector_codes: draft.sectorSecondary,
      interest_tag_slugs: draft.interests,
      time_budget_min: draft.timeBudget,
    });
    // Abonelik kapaliysa siklik "kapali" gider; backend'de ayri bir
    // `subscribed` alani YOK (bkz. saveNewsletter).
    const bulten = await saveNewsletter({
      frequency: draft.subscribed ? draft.frequency : "kapali",
      send_hour: draft.sendHour,
      send_weekday: draft.frequency === "haftalik" ? 1 : null,
    });

    setBusy(false);
    setSonuc({
      profilKaydedildi: profil.ok,
      profilHata: profil.ok ? null : profil.error,
      bultenKaydedildi: bulten.ok,
      bultenHata: bulten.ok ? null : bulten.error,
    });
    setPhase("animasyon");
  }

  /** Animasyon bitti: her sey kaydedildiyse panele git, degilse ozet goster. */
  const animasyonBitti = useCallback(() => {
    if (sonuc && sonuc.profilKaydedildi && sonuc.bultenKaydedildi) {
      router.replace(devam);
      router.refresh();
      return;
    }
    setPhase("ozet");
  }, [devam, router, sonuc]);

  const satirlar = useMemo(
    () =>
      derlemeSatirlari({
        sectorLabel,
        interestLabels: ilgiEtiketleri,
        minutes: draft.timeBudget,
        items: vakit?.items ?? 0,
      }),
    [sectorLabel, ilgiEtiketleri, draft.timeBudget, vakit],
  );

  /* --- animasyon / ozet kipleri ---------------------------------- */
  if (phase === "animasyon") {
    return (
      <DerlemeAnimasyonu lines={satirlar} onDone={animasyonBitti} items={vakit?.items} />
    );
  }

  if (phase === "ozet") {
    return (
      <div className="otur-kart">
        <p className="u-kicker u-kicker-accent">Kayıt tamamlandı</p>
        <h1 ref={headingRef} tabIndex={-1} className="u-headline u-headline-md otur-odak mt-1">
          Hesabınız oluşturuldu
        </h1>
        <p className="u-body mt-2 text-[0.9375rem] leading-snug">
          Giriş bilgileriniz hazır. Ancak bazı tercihler sunucuya kaydedilemedi —
          aşağıda ne olduğu yazıyor. <strong>Kaydınız geçerli</strong>, tercihleri
          daha sonra ayarlardan tamamlayabilirsiniz.
        </p>

        <ul className="mt-4 space-y-2">
          <li className="u-body border-t border-rule pt-2 text-[0.875rem] leading-snug">
            <strong>Hesap:</strong> oluşturuldu.
          </li>
          <li className="u-body border-t border-rule pt-2 text-[0.875rem] leading-snug">
            <strong>Profil (pozisyon, sektör, ilgi alanları, vakit):</strong>{" "}
            {sonuc?.profilKaydedildi ? "kaydedildi." : `kaydedilemedi — ${sonuc?.profilHata}`}
          </li>
          <li className="u-body border-t border-rule pt-2 text-[0.875rem] leading-snug">
            <strong>Bülten tercihi:</strong>{" "}
            {sonuc?.bultenKaydedildi ? "kaydedildi." : `kaydedilemedi — ${sonuc?.bultenHata}`}
          </li>
        </ul>

        <div className="mt-5 flex flex-wrap gap-3 border-t border-ink pt-4">
          <Link href={devam} className="ayar-btn ayar-btn-primary">
            Panele git
          </Link>
          <Link href="/ayarlar" className="ayar-btn">
            Ayarları aç
          </Link>
        </div>
      </div>
    );
  }

  /* --- form ------------------------------------------------------ */
  const adim = ADIMLAR[step];
  const sonAdim = step === ADIMLAR.length - 1;

  return (
    <div className="otur-kart">
      {/* İlerleme: hem metin hem gorsel. Metin tek basina yeterli — gorsel
          serit `aria-hidden`, cift okuma olmasin. */}
      <div className="otur-ilerleme">
        <p className="u-kicker u-kicker-accent">
          Adım {step + 1} / {ADIMLAR.length} · {adim.kicker}
        </p>
        <ol className="otur-ilerleme-serit" aria-hidden="true">
          {ADIMLAR.map((a, i) => (
            <li key={a.id} data-durum={i < step ? "gecildi" : i === step ? "aktif" : "bekliyor"} />
          ))}
        </ol>
      </div>

      <h1 ref={headingRef} tabIndex={-1} className="u-headline u-headline-md otur-odak mt-2">
        {adim.title}
      </h1>

      <div className="mt-2">
        <Notice kind={notice?.kind ?? null} message={notice?.message ?? null} />
        {eksikOzellik ? (
          <p className="ayar-uyari u-body mt-2">
            <strong>Henüz uygulanmadı.</strong> {eksikOzellik}
          </p>
        ) : null}
        {metaNot && step > 0 && step < 5 ? (
          <p className="u-body u-body-soft mt-2 text-[0.8125rem] leading-snug">{metaNot}</p>
        ) : null}
      </div>

      <form
        className="mt-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (sonAdim) void gonder();
          else ileri();
        }}
      >
        {step === 0 ? (
          <AdimHesap
            fullName={draft.fullName}
            email={draft.email}
            password={draft.password}
            onChange={patch}
            errors={errors}
          />
        ) : null}

        {step === 1 ? (
          <AdimPozisyon
            positions={positions}
            value={draft.position}
            onChange={(next) => patch({ position: next })}
          />
        ) : null}

        {step === 2 ? (
          <AdimSektor
            sectors={taxonomy.sectors}
            primary={draft.sectorPrimary}
            secondary={draft.sectorSecondary}
            maxSecondary={MAX_IKINCIL}
            errors={errors}
            onPrimary={(code) =>
              patch({
                sectorPrimary: code,
                // Birincil secilen sektor ikincillerden dusulur; ayni sektoru
                // iki kez agirliklandirmak skoru bozar.
                sectorSecondary: draft.sectorSecondary.filter((c) => c !== code),
              })
            }
            onSecondary={(codes) => patch({ sectorSecondary: codes })}
          />
        ) : null}

        {step === 3 ? (
          <AdimIlgi
            interests={interests}
            selected={draft.interests}
            maxSelection={MAX_ILGI}
            positionLabel={positionLabel}
            onChange={(next) => {
              setIlgiDokunuldu(true);
              patch({ interests: next });
            }}
          />
        ) : null}

        {step === 4 ? (
          <AdimVakit
            options={taxonomy.timeBudgets}
            value={draft.timeBudget}
            onChange={(next) => patch({ timeBudget: next })}
          />
        ) : null}

        {step === 5 ? (
          <>
            <AdimBulten
              subscribed={draft.subscribed}
              frequency={draft.frequency}
              sendHour={draft.sendHour}
              onChange={patch}
            />
            <section className="otur-ozet" aria-labelledby="otur-ozet-baslik">
              <h2 id="otur-ozet-baslik" className="u-kicker text-ink">
                Kaydı tamamlamadan önce
              </h2>
              <dl className="mt-2">
                <div className="otur-ozet-satir">
                  <dt>Ad soyad</dt>
                  <dd>{draft.fullName || "—"}</dd>
                </div>
                <div className="otur-ozet-satir">
                  <dt>E-posta</dt>
                  <dd>{draft.email || "—"}</dd>
                </div>
                <div className="otur-ozet-satir">
                  <dt>Pozisyon</dt>
                  <dd>{positionLabel}</dd>
                </div>
                <div className="otur-ozet-satir">
                  <dt>Birincil sektör</dt>
                  <dd>{sectorLabel}</dd>
                </div>
                <div className="otur-ozet-satir">
                  <dt>İkincil sektörler</dt>
                  <dd>
                    {draft.sectorSecondary.length
                      ? draft.sectorSecondary
                          .map(
                            (c) =>
                              taxonomy.sectors.find((s) => s.code === c)?.label ?? c,
                          )
                          .join(", ")
                      : "Seçilmedi"}
                  </dd>
                </div>
                <div className="otur-ozet-satir">
                  <dt>İlgi alanları</dt>
                  <dd>
                    {ilgiEtiketleri.length ? `${ilgiEtiketleri.length} başlık` : "Seçilmedi"}
                  </dd>
                </div>
                <div className="otur-ozet-satir">
                  <dt>Vakit</dt>
                  <dd>{vakit ? `${vakit.label} · ${vakit.detail}` : `${draft.timeBudget} dakika`}</dd>
                </div>
              </dl>
            </section>
          </>
        ) : null}

        <div className="otur-gezinme">
          <button type="button" className="ayar-btn" onClick={geri} disabled={step === 0 || busy}>
            Geri
          </button>
          <button type="submit" className="ayar-btn ayar-btn-primary" disabled={busy}>
            {busy
              ? "Kaydediliyor…"
              : sonAdim
                ? "Kaydı tamamla"
                : `İleri · ${ADIMLAR[step + 1]?.kicker ?? ""}`}
          </button>
        </div>
      </form>

      <p className="u-body u-body-soft mt-5 border-t border-rule pt-3 text-[0.875rem]">
        Hesabınız var mı?{" "}
        <Link
          href={devam !== "/" ? `/giris?devam=${encodeURIComponent(devam)}` : "/giris"}
          className="u-link-underline text-ink"
        >
          Giriş yapın
        </Link>
        .
      </p>
    </div>
  );
}
