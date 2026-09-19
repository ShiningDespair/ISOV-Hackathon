"use client";

/**
 * PAYLAŞ MENÜSÜ.
 *
 * Kanallar: WhatsApp · LinkedIn · e-posta (mailto) · bağlantıyı kopyala ·
 * cihazın paylaşım penceresi (yalnızca `navigator.share` varsa, mobilde) ·
 * sunucudan e-posta (`PUT /me/articles/:id/share` + `{channel,to}`).
 *
 * TASARIM KARARLARI
 * - Paylaşım metni BAŞLIK + KAYNAK + BAĞLANTI. Özet eklenmez: WhatsApp'ta
 *   2-4 cümlelik özet mesajı okunmaz hâle getiriyor, e-postada zaten haberin
 *   kendisi açılıyor.
 * - Tarayıcı kanalları kaydın başarısına BAĞLI DEĞİL. `/me/*` henüz 501
 *   dönüyor; buna rağmen WhatsApp açılmalı. Bu yüzden kayıt sessizce denenir
 *   (`recordShareQuietly`) ve hata gösterilmez — kullanıcının işi olmuştur.
 * - SUNUCUDAN e-posta başka iştir: orada işi yapan sunucudur, hata AÇIKÇA
 *   söylenir (SMTP yapılandırılmamışsa dahil). Sessiz başarısızlık yok.
 *
 * ERİŞİLEBİLİRLİK: `role="menu"`, oklarla gezinme, Home/End, Escape ile
 * kapanma ve odağın düğmeye dönmesi, dışına tıklamada kapanma, durum
 * mesajları `aria-live="polite"`.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  hazirDegil,
  oturumGerekli,
  paylasimAdresleri,
  paylasimMetni,
  recordShare,
  recordShareQuietly,
  type PaylasilacakHaber,
  type ShareChannel,
} from "@/lib/api-me";

// Metin ve adres kurgusu `lib/api-me.ts`'te duruyor: saf fonksiyon olarak
// sunucu tarafından da çağrılabiliyor, böylece üretilen wa.me / mailto
// adresleri tarayıcı olmadan ölçülebiliyor.
export type { PaylasilacakHaber };
export { paylasimMetni };

/** Paylaşılacak bağlantı: haberin kendi adresi, yoksa paneldeki sayfası. */
function baglantiOf(haber: PaylasilacakHaber, override?: string): string {
  if (override) return override;
  const u = haber.url?.trim();
  if (u && /^https?:/i.test(u)) return u;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/haber/${haber.id}`;
  }
  return `/haber/${haber.id}`;
}

function epostaGecerli(value: string): boolean {
  const v = value.trim();
  // Kasıtlı olarak gevşek: son doğrulama sunucunun işi, buradaki kontrol
  // yalnızca bariz yazım hatasını yakalar.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

export function ShareMenu({
  haber,
  shareUrl,
  className,
  label = "Paylaş",
}: {
  haber: PaylasilacakHaber;
  shareUrl?: string;
  className?: string;
  label?: string;
}) {
  const [acik, setAcik] = useState(false);
  const [durum, setDurum] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [formAcik, setFormAcik] = useState(false);
  const [alici, setAlici] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [cihazVar, setCihazVar] = useState(false);

  const kokRef = useRef<HTMLDivElement | null>(null);
  const dugmeRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  /**
   * Menü öğelerini DOM'dan okur.
   *
   * Öğeleri render sırasında bir diziye toplamak (callback ref) BOZUKTU:
   * React değişmeyen öğelerin ref geri çağrısını yeniden çalıştırmaz, bu
   * yüzden ikinci render'dan sonra dizi eksik kalıyordu ve ok tuşları
   * çalışmıyordu. DOM sorgusu her zaman güncel listeyi verir.
   */
  const menuOgeleri = useCallback((): HTMLElement[] => {
    const kok = menuRef.current;
    if (!kok) return [];
    return Array.from(kok.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  }, []);

  // navigator.share yalnızca tarayıcıda ve çoğunlukla mobilde var.
  // Sunucu render'ında bilinemez; effect ile eklenir (hidrasyon uyumu).
  useEffect(() => {
    setCihazVar(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const kapat = useCallback(
    (odakDondur = true) => {
      setAcik(false);
      setFormAcik(false);
      if (odakDondur) dugmeRef.current?.focus();
    },
    [],
  );

  // Dışına tıklama ve Escape.
  useEffect(() => {
    if (!acik) return;

    const tikla = (e: MouseEvent) => {
      if (!kokRef.current?.contains(e.target as Node)) kapat(false);
    };
    const tus = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        kapat();
      }
    };

    document.addEventListener("mousedown", tikla);
    document.addEventListener("keydown", tus);
    return () => {
      document.removeEventListener("mousedown", tikla);
      document.removeEventListener("keydown", tus);
    };
  }, [acik, kapat]);

  // Menü açılınca ilk öğeye odaklan.
  useEffect(() => {
    if (!acik) return;
    const t = window.setTimeout(() => menuOgeleri()[0]?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [acik, menuOgeleri]);

  /**
   * Ok tuşlarıyla gezinme.
   *
   * İKİ TUZAK BİLİNÇLİ OLARAK ELENDİ:
   * - Metin girdisi içinde oklar CARET'i hareket ettirmeli; menü gezintisi
   *   girdiyi ele geçirirse e-posta adresi düzeltilemez olur.
   * - "Tab'a basınca menüyü kapat" kuralı, menü içindeki e-posta formuna
   *   klavyeyle ULAŞILMASINI engelliyordu (form kapanıp gidiyordu). Menü
   *   Escape ve dışına tıklama ile kapanır; Tab doğal sırayla ilerler.
   */
  function menuKlavye(e: React.KeyboardEvent<HTMLDivElement>) {
    const hedef = e.target as HTMLElement | null;
    const yaziAlani =
      hedef instanceof HTMLInputElement || hedef instanceof HTMLTextAreaElement;
    if (yaziAlani) return;

    const ogeler = menuOgeleri();
    if (ogeler.length === 0) return;
    const su = ogeler.indexOf(document.activeElement as HTMLElement);

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const yon = e.key === "ArrowDown" ? 1 : -1;
      const sonraki = (su + yon + ogeler.length) % ogeler.length;
      ogeler[sonraki]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      ogeler[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      ogeler[ogeler.length - 1]?.focus();
    }
  }

  const baglanti = () => baglantiOf(haber, shareUrl);
  const metin = () => paylasimMetni(haber, baglanti());

  /** Yeni sekmede aç — popup engellenirse kullanıcıya söyle. */
  function disaAc(url: string, kanal: ShareChannel) {
    setHata(null);
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w) {
      setHata(
        "Tarayıcı yeni sekmeyi engelledi. Açılır pencere iznini verip tekrar deneyin.",
      );
      return;
    }
    setDurum(`${kanal === "whatsapp" ? "WhatsApp" : "LinkedIn"} penceresi açıldı.`);
    void recordShareQuietly(haber.id, kanal);
    kapat(false);
  }

  function whatsapp() {
    disaAc(paylasimAdresleri(haber, baglanti()).whatsapp, "whatsapp");
  }

  function linkedin() {
    disaAc(paylasimAdresleri(haber, baglanti()).linkedin, "linkedin");
  }

  function mailto() {
    setHata(null);
    window.location.href = paylasimAdresleri(haber, baglanti()).mailto;
    setDurum("E-posta uygulamanız açılıyor.");
    void recordShareQuietly(haber.id, "eposta");
    kapat(false);
  }

  async function kopyala() {
    setHata(null);
    const deger = metin();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(deger);
      } else {
        throw new Error("clipboard yok");
      }
      setDurum("Bağlantı kopyalandı.");
      void recordShareQuietly(haber.id, "baglanti");
      kapat(false);
    } catch {
      // Güvenli olmayan bağlam (http) ya da izin reddi: sessizce geçmek
      // yerine kullanıcıya ne yapacağını söyle.
      setHata(
        `Kopyalama izni alınamadı. Bağlantıyı elle kopyalayabilirsiniz: ${baglanti()}`,
      );
    }
  }

  async function cihaz() {
    setHata(null);
    try {
      await navigator.share({ title: haber.title, text: metin(), url: baglanti() });
      setDurum("Paylaşım penceresi açıldı.");
      void recordShareQuietly(haber.id, "cihaz");
      kapat(false);
    } catch (err) {
      // Kullanıcı vazgeçtiyse hata göstermek yanlış olur.
      const iptal = err instanceof Error && err.name === "AbortError";
      if (!iptal) setHata("Cihaz paylaşımı açılamadı.");
    }
  }

  async function sunucudanGonder(e: React.FormEvent) {
    e.preventDefault();
    setHata(null);
    setDurum(null);

    if (!epostaGecerli(alici)) {
      setHata("Geçerli bir e-posta adresi girin.");
      return;
    }

    setGonderiliyor(true);
    const res = await recordShare(haber.id, "eposta", alici.trim());
    setGonderiliyor(false);

    if (res.ok) {
      setDurum(`Haber ${alici.trim()} adresine gönderildi.`);
      setAlici("");
      setFormAcik(false);
      return;
    }

    // Hatayı ANLAŞILIR Türkçe ile söyle; ham HTTP kodu yeterli değil.
    if (hazirDegil(res.status)) {
      setHata(
        "Sunucudan e-posta gönderimi henüz yayında değil. Şimdilik “E-posta ile paylaş” seçeneği kendi e-posta uygulamanızı açar.",
      );
    } else if (oturumGerekli(res.status)) {
      setHata("Sunucudan göndermek için giriş yapmanız gerekiyor.");
    } else {
      setHata(
        `Gönderilemedi: ${res.error} SMTP ayarları tanımlı değilse yönetici panelinden tanımlanması gerekir.`,
      );
    }
  }

  return (
    <div className={`eylem-sarmal ${className ?? ""}`.trim()} ref={kokRef}>
      <button
        type="button"
        ref={dugmeRef}
        className="eylem-btn"
        aria-haspopup="menu"
        aria-expanded={acik}
        aria-controls={acik ? menuId : undefined}
        onClick={() => {
          setHata(null);
          setAcik((v) => !v);
        }}
      >
        <span aria-hidden="true" className="eylem-ikon">
          ↗
        </span>
        {/* Dar alanda metin görsel olarak gizlenir ama erişilebilir adı
            korur (`eylem-kok[data-compact]` kuralı) — aria-label ile
            değiştirmek ekran okuyucuya iki farklı ad verirdi. */}
        <span className="eylem-btn-metin">{label}</span>
      </button>

      {acik ? (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label={`“${haber.title}” haberini paylaş`}
          className="eylem-menu"
          onKeyDown={menuKlavye}
        >
          <button type="button" role="menuitem" className="eylem-menu-oge" onClick={whatsapp}>
            WhatsApp ile gönder
          </button>
          <button type="button" role="menuitem" className="eylem-menu-oge" onClick={mailto}>
            E-posta ile paylaş
            <span className="eylem-menu-ipucu">kendi e-posta uygulamanız</span>
          </button>
          <button type="button" role="menuitem" className="eylem-menu-oge" onClick={linkedin}>
            LinkedIn'de paylaş
          </button>
          <button type="button" role="menuitem" className="eylem-menu-oge" onClick={kopyala}>
            Bağlantıyı kopyala
          </button>
          {cihazVar ? (
            <button type="button" role="menuitem" className="eylem-menu-oge" onClick={cihaz}>
              Cihazın paylaşım penceresi
            </button>
          ) : null}

          <div className="eylem-menu-ayrac" role="separator" />

          <button
            type="button"
            role="menuitem"
           
            className="eylem-menu-oge"
            aria-expanded={formAcik}
            onClick={() => {
              setHata(null);
              setFormAcik((v) => !v);
            }}
          >
            Sunucudan e-posta gönder
            <span className="eylem-menu-ipucu">alıcıya panel üzerinden yollar</span>
          </button>

          {formAcik ? (
            <form className="eylem-form" onSubmit={sunucudanGonder}>
              <label className="eylem-form-alan">
                <span className="u-kicker">Alıcı e-posta</span>
                <input
                  type="email"
                  value={alici}
                  autoComplete="email"
                  required
                  placeholder="ornek@firma.com"
                  className="eylem-girdi"
                  onChange={(e) => setAlici(e.target.value)}
                />
              </label>
              <button type="submit" className="eylem-btn eylem-btn-birincil" disabled={gonderiliyor}>
                {gonderiliyor ? "Gönderiliyor…" : "Gönder"}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {/* Durum ve hata: menü kapansa bile görünür kalır. */}
      <p className="eylem-bildirim" role="status" aria-live="polite">
        {durum}
      </p>
      {hata ? (
        <p className="eylem-bildirim eylem-bildirim-hata" role="alert" aria-live="assertive">
          {hata}
        </p>
      ) : null}
    </div>
  );
}

export default ShareMenu;
