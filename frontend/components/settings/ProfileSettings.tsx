"use client";

/**
 * PROFİL AYARLARI — /ayarlar sayfasının en üst bölümü
 *
 * NEDEN VAR: pozisyon, sektör, ilgi alanları ve vakit bütçesi yalnızca
 * KAYIT SIRASINDA seçilebiliyordu. `PUT /me/profile` ucu çalışıyordu ama
 * arayüzde onu çağıran hiçbir yer yoktu; yani kullanıcı bir kez seçtiği
 * pozisyonu bir daha değiştiremiyordu. Bu, sözleşmenin "hepsi sonradan
 * profil ayarlarından düzenlenebilir" maddesinin karşılığı.
 *
 * ADIMLAR YENİDEN YAZILMADI: `components/onboarding/Steps.tsx` içindeki
 * `AdimPozisyon` / `AdimSektor` / `AdimIlgi` / `AdimVakit` saf sunum
 * bileşenleri (durum tutmaz, istek atmaz) ve burada olduğu gibi
 * kullanılıyor. İkinci bir sektör arayüzü yazmak, iki formun birbirinden
 * kayması demekti — projede eşiklerin üç ayrı yerde kopyalanıp kayması
 * hatası bir kez yaşandı.
 *
 * OTURUM: yeni bir `/auth/me` isteği ATILMAZ. `SessionProvider` oturumu
 * sayfa başına bir kez çekiyor; mevcut profil oradan okunuyor, kayıttan
 * sonra `refresh()` ile aynı bağlam yenileniyor. Böylece üst bardaki
 * Hesabım menüsü de güncel pozisyonu gösterir.
 *
 * ALAN ADLARI SÖZLEŞMEYLE BİREBİR (`time_budget_min`,
 * `primary_sector_code`, `secondary_sector_codes`, `interest_tag_slugs`):
 * uç, tanımadığı alanı HATA VERMEDEN yok sayıyor, yani yanlış ad yazmak
 * 200 döner ama seçim sessizce kaybolur. `saveProfile()` bu eşlemeyi tek
 * yerde yapıyor, burada tekrarlanmıyor.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { getInterests, getTaxonomy, isNotImplemented, saveProfile } from "@/lib/api-auth";
import { useSession } from "@/components/SessionProvider";
import { Notice } from "@/components/settings/Parts";
import type { InterestTag, Taxonomy, UserProfile } from "@/lib/types-auth";

import {
  AdimIlgi,
  AdimPozisyon,
  AdimSektor,
  AdimVakit,
} from "@/components/onboarding/Steps";
import {
  FALLBACK_INTERESTS,
  FALLBACK_TAXONOMY,
  mergeInterests,
  mergeTaxonomy,
} from "@/components/onboarding/taxonomy-fallback";

/** Kayıt sihirbazındaki sınırların aynısı — iki form aynı şeyi konuşsun. */
const MAX_IKINCIL = 3;
const MAX_ILGI = 12;

/**
 * Pozisyon -> açılış görünümü.
 *
 * TEK DOĞRULUK KAYNAĞI BACKEND: `backend/src/lib/positions.js` içindeki
 * `POSITION_VIEW` ve `/auth/me` yanıtındaki `default_view` alanı. Burada
 * eşleme TÜRETİLMEZ; sunucudan gelen `default_view` okunur, gelmezse
 * satır hiç basılmaz. Eşlemeyi burada da tutmak, pozisyon ile görünümün
 * birbirinden kayabileceği ikinci bir yer açardı.
 */
const VIEW_LABELS: Record<string, string> = {
  panel: "Panel",
  gazete: "Gazete",
  gorsel: "Görsel",
  kart: "Kart",
};

interface Draft {
  position: string;
  sectorPrimary: string;
  sectorSecondary: string[];
  interests: string[];
  timeBudget: number;
}

/** Profil satırı yoksa kullanılacak taslak — kayıt sihirbazıyla aynı. */
const DRAFT_DEFAULTS: Draft = {
  position: "ust-yonetim",
  sectorPrimary: "C28",
  sectorSecondary: [],
  interests: [],
  timeBudget: 5,
};

function draftFromProfile(profile: UserProfile | null | undefined): Draft {
  if (!profile) return DRAFT_DEFAULTS;
  return {
    position: profile.position_code || DRAFT_DEFAULTS.position,
    sectorPrimary: profile.primary_sector_code || DRAFT_DEFAULTS.sectorPrimary,
    sectorSecondary: Array.isArray(profile.secondary_sector_codes)
      ? profile.secondary_sector_codes.slice(0, MAX_IKINCIL)
      : [],
    interests: Array.isArray(profile.interest_tag_slugs)
      ? profile.interest_tag_slugs.slice(0, MAX_ILGI)
      : [],
    timeBudget:
      typeof profile.time_budget_min === "number" && profile.time_budget_min > 0
        ? profile.time_budget_min
        : DRAFT_DEFAULTS.timeBudget,
  };
}

/** İki taslak aynı mı — "Kaydet" yalnızca gerçek değişiklikte açılır. */
function ayni(a: Draft, b: Draft): boolean {
  const dizi = (x: string[], y: string[]) =>
    x.length === y.length && [...x].sort().join("|") === [...y].sort().join("|");
  return (
    a.position === b.position &&
    a.sectorPrimary === b.sectorPrimary &&
    a.timeBudget === b.timeBudget &&
    dizi(a.sectorSecondary, b.sectorSecondary) &&
    dizi(a.interests, b.interests)
  );
}

/** Kural çizgili alt bölüm — ayarlar sayfasının kendi dili. */
function Blok({
  baslik,
  ozet,
  children,
}: {
  baslik: string;
  ozet: string;
  children: React.ReactNode;
}) {
  return (
    <div className="profil-blok">
      <div className="profil-blok-bas">
        <h3 className="u-kicker text-ink">{baslik}</h3>
        <p className="u-body u-body-soft profil-blok-ozet">{ozet}</p>
      </div>
      <div className="profil-blok-govde">{children}</div>
    </div>
  );
}

export function ProfileSettings() {
  const { status, me, refresh } = useSession();

  const [taxonomy, setTaxonomy] = useState<Taxonomy>(FALLBACK_TAXONOMY);
  const [interests, setInterests] = useState<InterestTag[]>(FALLBACK_INTERESTS);
  const [metaNot, setMetaNot] = useState<string | null>(null);

  /** Sunucudaki hâli — "değişti mi" karşılaştırmasının sabit tarafı. */
  const [kayitli, setKayitli] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft>(DRAFT_DEFAULTS);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "basari" | "hata";
    message: string;
  } | null>(null);

  /* --- taksonomi: kayıt sihirbazıyla aynı yol ---------------------- */
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

  /* --- oturum gelince mevcut profili forma yaz --------------------- */
  // `status === "var"` olmadan yazmıyoruz: "bilinmiyor" hâlinde varsayılanı
  // kayıtlı değer sanmak, kullanıcı hiçbir şeye dokunmadan "Kaydet"i açık
  // görmesine ve kendi seçimini varsayılanla ezmesine yol açardı.
  useEffect(() => {
    if (status !== "var") return;
    const next = draftFromProfile(me?.profile ?? null);
    setKayitli(next);
    setDraft(next);
  }, [status, me?.profile]);

  const positionLabel = useMemo(() => {
    const found = taxonomy.positions.find((p) => p.code === draft.position);
    return found?.label ?? draft.position;
  }, [taxonomy.positions, draft.position]);

  const layoutLabel = useMemo(() => {
    const found = taxonomy.positions.find((p) => p.code === draft.position);
    return found?.layoutLabel ?? null;
  }, [taxonomy.positions, draft.position]);

  /**
   * Sunucunun bildirdiği açılış görünümü. Yalnızca KAYITLI pozisyon için
   * geçerli: kullanıcı listeden başka bir pozisyon seçtiyse bu satır
   * artık onu anlatmıyor, o yüzden gizlenir. Eşleme burada
   * TÜRETİLMEZ (bkz. VIEW_LABELS yorumu).
   */
  const acilisGorunumu =
    kayitli && kayitli.position === draft.position && me?.default_view
      ? (VIEW_LABELS[String(me.default_view)] ?? null)
      : null;

  const degisti = kayitli !== null && !ayni(kayitli, draft);

  const kaydet = useCallback(async () => {
    if (!degisti || busy) return;
    setBusy(true);
    setNotice(null);

    const res = await saveProfile({
      position_code: draft.position,
      primary_sector_code: draft.sectorPrimary,
      secondary_sector_codes: draft.sectorSecondary,
      interest_tag_slugs: draft.interests,
      time_budget_min: draft.timeBudget,
    });

    if (!res.ok) {
      setNotice({
        kind: "hata",
        message: isNotImplemented(res)
          ? "Profil kaydetme ucu henüz yayında değil; seçiminiz kaydedilmedi."
          : `Profil kaydedilemedi. ${res.error}`,
      });
      setBusy(false);
      return;
    }

    // Sunucunun kabul ettiği hâl artık "kayıtlı" taraf.
    setKayitli(draft);
    setNotice({
      kind: "basari",
      message:
        "Profil kaydedildi. Panel düzeni ve haber sıralaması bir sonraki sayfa yüklemesinde yenilenir.",
    });
    // Üst bardaki Hesabım menüsü ve kişisel akış aynı bağlamdan okuyor.
    refresh();
    setBusy(false);
  }, [degisti, busy, draft, refresh]);

  function geriAl() {
    if (kayitli) setDraft(kayitli);
    setNotice(null);
  }

  /* --- oturum yok / belirsiz -------------------------------------- */
  if (status === "yok") {
    return (
      <p className="u-body u-body-soft text-[0.9375rem] leading-snug">
        Profil ayarları için oturum açmanız gerekiyor.
      </p>
    );
  }

  if (status === "bilinmiyor") {
    return (
      <p className="u-body u-body-soft text-[0.9375rem] leading-snug">
        Profil okunuyor…
      </p>
    );
  }

  if (status === "belirsiz" || kayitli === null) {
    return (
      <p className="u-body u-body-soft text-[0.9375rem] leading-snug">
        Profil bilgisi okunamadı. Oturumunuz düşmüş olabilir ya da kullanıcı
        ucu geçici olarak yanıt vermiyor; sayfayı yenileyip tekrar deneyin.
      </p>
    );
  }

  const profilYok = (me?.profile ?? null) === null;

  return (
    <div className="profil-kap">
      <Notice
        kind={metaNot ? "hata" : null}
        message={metaNot}
        id="profil-meta-not"
      />

      {profilYok ? (
        <p className="ayar-bildirim" data-tur="hata">
          Henüz bir profil kaydınız yok, bu yüzden haberler herkes için aynı
          genel önem sırasıyla geliyor. Aşağıdaki seçimleri kaydettiğinizde
          kişiselleştirme devreye girer.
        </p>
      ) : null}

      {/* Pozisyonun SONUCU — kullanıcı neyi değiştirdiğini bilmeli.
          Pozisyon yalnızca bir etiket değil: panel düzenini ve açılış
          görünümünü de belirliyor. */}
      <dl className="profil-sonuc">
        <div>
          <dt className="u-kicker text-ink-faint">Pozisyon</dt>
          <dd className="u-body profil-sonuc-deger">{positionLabel}</dd>
        </div>
        {layoutLabel ? (
          <div>
            <dt className="u-kicker text-ink-faint">Panel düzeni</dt>
            <dd className="u-body profil-sonuc-deger">{layoutLabel}</dd>
          </div>
        ) : null}
        {acilisGorunumu ? (
          <div>
            <dt className="u-kicker text-ink-faint">Açılış görünümü</dt>
            <dd className="u-body profil-sonuc-deger">
              {acilisGorunumu}
              <span className="u-body u-body-soft profil-sonuc-not">
                Görünüm anahtarından başka bir görünüm seçtiyseniz sizin
                seçiminiz geçerli kalır.
              </span>
            </dd>
          </div>
        ) : null}
      </dl>

      <Blok
        baslik="Pozisyon"
        ozet="Panelin düzenini ve hangi konuların üste çıkacağını belirler."
      >
        <AdimPozisyon
          positions={taxonomy.positions}
          value={draft.position}
          onChange={(next) => setDraft((d) => ({ ...d, position: next }))}
        />
      </Blok>

      <Blok
        baslik="Sektör"
        ozet="Haberlerdeki sektör bilgisiyle eşleştirilir. Birincil sektör zorunlu, en çok üç ikincil sektör seçilebilir."
      >
        <AdimSektor
          sectors={taxonomy.sectors}
          primary={draft.sectorPrimary}
          secondary={draft.sectorSecondary}
          onPrimary={(code) => setDraft((d) => ({ ...d, sectorPrimary: code }))}
          onSecondary={(codes) =>
            setDraft((d) => ({ ...d, sectorSecondary: codes }))
          }
          errors={{}}
          maxSecondary={MAX_IKINCIL}
        />
      </Blok>

      <Blok
        baslik="İlgi alanları"
        ozet="Seçtiğiniz konular sıralamada öne çıkar. Hiç seçmezseniz sıralama pozisyon ve sektörden hesaplanır."
      >
        <AdimIlgi
          interests={interests}
          selected={draft.interests}
          onChange={(next) => setDraft((d) => ({ ...d, interests: next }))}
          maxSelection={MAX_ILGI}
          positionLabel={positionLabel}
        />
      </Blok>

      <Blok
        baslik="Vakit bütçesi"
        ozet="Kaç haber göreceğinizi ve özetlerin uzunluğunu belirler."
      >
        <AdimVakit
          options={taxonomy.timeBudgets}
          value={draft.timeBudget}
          onChange={(next) => setDraft((d) => ({ ...d, timeBudget: next }))}
        />
      </Blok>

      {/* Bildirim kabı her zaman DOM'da (aria-live bölgesi sonradan
          eklenirse ekran okuyucular değişikliği duyurmaz). */}
      <Notice
        kind={notice?.kind ?? null}
        message={notice?.message ?? null}
        id="profil-bildirim"
      />

      <div className="profil-eylem">
        <button
          type="button"
          className="profil-kaydet"
          disabled={!degisti || busy}
          onClick={kaydet}
        >
          {busy ? "Kaydediliyor…" : "Profili Kaydet"}
        </button>
        <button
          type="button"
          className="profil-geri"
          disabled={!degisti || busy}
          onClick={geriAl}
        >
          Değişiklikleri geri al
        </button>
        {/* Durum metne yazılı, yalnızca düğmenin sönük görünmesine
            bırakılmadı (WCAG 1.4.1: renk/kontrast tek gösterge olamaz). */}
        <span className="u-kicker text-ink-faint" aria-live="polite">
          {degisti ? "Kaydedilmemiş değişiklik var" : "Kaydedilmiş"}
        </span>
      </div>
    </div>
  );
}
