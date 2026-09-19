"use client";

/**
 * GİZLE DİYALOĞU — "bu haber bana uygun değil".
 *
 * ADLANDIRMA: kullanıcı isteğinde bu düğme "düzenle" diye geçiyordu; öyle
 * adlandırılmadı. "Düzenle" kullanıcıya HABERİ değiştireceğini düşündürür,
 * oysa yapılan şey haberin kendi panelinden çıkarılması ve gerekçenin
 * bildirilmesidir. Yanlış etiket, yanlış beklenti üretir.
 *
 * SÖZLEŞME: `PUT /me/articles/:id/hide` → `{hidden:true, reason, note}`.
 * `reason` backend ENUM'u ile birebir aynı slug (`lib/api-me.ts`).
 * Veri SİLİNMEZ; işlem yalnızca bu kullanıcının panelini etkiler ve bu
 * diyalogda açıkça yazılıdır.
 *
 * ERİŞİLEBİLİRLİK: `role="dialog"` + `aria-modal`, odak tuzağı (Tab/Shift+Tab
 * diyalogdan çıkmaz), Escape ile kapanma, kapanınca odağın çağıran düğmeye
 * dönmesi, hata mesajı `role="alert"`.
 */

import { useEffect, useId, useRef, useState } from "react";

import {
  HIDE_NOTE_MAX,
  HIDE_REASONS,
  HIDE_REASON_LABEL,
  hazirDegil,
  hideArticle,
  oturumGerekli,
  type HideReason,
} from "@/lib/api-me";

/** Odaklanabilir öğe seçicisi — odak tuzağı için. */
const ODAKLANABILIR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function HideDialog({
  haber,
  onClose,
  onHidden,
}: {
  haber: { id: number; title: string };
  onClose: () => void;
  /** Sunucu gizlemeyi kabul ettiğinde çağrılır (iyimser kaldırma için). */
  onHidden: (bilgi: { reason: HideReason; note?: string }) => void;
}) {
  const [sebep, setSebep] = useState<HideReason | "">("");
  const [not, setNot] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const kokRef = useRef<HTMLDivElement | null>(null);
  const oncekiOdak = useRef<HTMLElement | null>(null);
  const baslikId = useId();
  const aciklamaId = useId();
  const hataId = useId();

  // Açılışta odağı diyaloğa al, kapanışta çağırana geri ver.
  useEffect(() => {
    oncekiOdak.current =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;

    const ilk = kokRef.current?.querySelector<HTMLElement>(ODAKLANABILIR);
    ilk?.focus();

    return () => {
      oncekiOdak.current?.focus();
    };
  }, []);

  // Escape + odak tuzağı.
  useEffect(() => {
    function tus(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const kok = kokRef.current;
      if (!kok) return;
      const ogeler = Array.from(kok.querySelectorAll<HTMLElement>(ODAKLANABILIR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (ogeler.length === 0) return;

      const ilk = ogeler[0]!;
      const son = ogeler[ogeler.length - 1]!;
      const aktif = document.activeElement as HTMLElement | null;

      if (e.shiftKey && (aktif === ilk || !kok.contains(aktif))) {
        e.preventDefault();
        son.focus();
      } else if (!e.shiftKey && aktif === son) {
        e.preventDefault();
        ilk.focus();
      }
    }

    document.addEventListener("keydown", tus, true);
    return () => document.removeEventListener("keydown", tus, true);
  }, [onClose]);

  // Arka plan kaydırması kilitlenir; diyalog açıkken sayfa kaymasın.
  useEffect(() => {
    const onceki = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = onceki;
    };
  }, []);

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata(null);

    if (!sebep) {
      setHata("Lütfen bir sebep seçin.");
      return;
    }

    setGonderiliyor(true);
    const res = await hideArticle(haber.id, {
      reason: sebep,
      note: not.trim() || undefined,
    });
    setGonderiliyor(false);

    if (res.ok) {
      onHidden({ reason: sebep, note: not.trim() || undefined });
      return;
    }

    if (hazirDegil(res.status)) {
      setHata(
        "Gizleme sunucuda henüz uygulanmadı; haber panelinizde kalmaya devam edecek. Gerekçeniz kaydedilemedi.",
      );
    } else if (oturumGerekli(res.status)) {
      setHata("Haberi gizlemek için giriş yapmanız gerekiyor.");
    } else {
      setHata(res.error);
    }
  }

  const kalan = HIDE_NOTE_MAX - not.length;

  return (
    <div className="eylem-katman" onMouseDown={(e) => {
      // Yalnızca örtünün kendisine tıklamada kapat; içeriğe tıklama kapatmaz.
      if (e.target === e.currentTarget) onClose();
    }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={baslikId}
        aria-describedby={aciklamaId}
        className="eylem-diyalog"
        ref={kokRef}
      >
        <header className="eylem-diyalog-bas">
          <p className="u-kicker u-kicker-accent">Panelinizden çıkar</p>
          <h2 id={baslikId} className="u-headline u-headline-md mt-1">
            Bu haber bana uygun değil
          </h2>
          <p id={aciklamaId} className="eylem-diyalog-aciklama">
            Bu işlem <strong>yalnızca sizin panelinizi</strong> etkiler. Haber
            silinmez, kurumun arşivinde kalır ve diğer kullanıcılar görmeye
            devam eder. Gerekçeniz sıralamanın sizin için düzeltilmesinde
            kullanılır.
          </p>
          <p className="eylem-diyalog-haber">{haber.title}</p>
        </header>

        <form onSubmit={gonder} className="eylem-diyalog-govde">
          <fieldset className="eylem-fieldset">
            <legend className="u-kicker">Neden burada olmamalı?</legend>
            <div className="eylem-sebepler">
              {HIDE_REASONS.map((r) => (
                <label key={r} className="eylem-sebep">
                  <input
                    type="radio"
                    name="sebep"
                    value={r}
                    checked={sebep === r}
                    onChange={() => {
                      setSebep(r);
                      setHata(null);
                    }}
                  />
                  <span>{HIDE_REASON_LABEL[r]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="eylem-form-alan">
            <span className="u-kicker">
              Açıklama <span className="eylem-istege-bagli">(isteğe bağlı)</span>
            </span>
            <textarea
              value={not}
              maxLength={HIDE_NOTE_MAX}
              rows={3}
              className="eylem-girdi eylem-alan-cok"
              placeholder="Örn. Bu mevzuat bizim NACE kodumuzu kapsamıyor."
              onChange={(e) => setNot(e.target.value.slice(0, HIDE_NOTE_MAX))}
            />
            <span className="eylem-sayac" aria-live="polite">
              {kalan} karakter kaldı
            </span>
          </label>

          {hata ? (
            <p id={hataId} className="eylem-bildirim eylem-bildirim-hata" role="alert">
              {hata}
            </p>
          ) : null}

          <div className="eylem-diyalog-ayak">
            <button type="button" className="eylem-btn" onClick={onClose}>
              Vazgeç
            </button>
            <button
              type="submit"
              className="eylem-btn eylem-btn-birincil"
              disabled={gonderiliyor}
              aria-describedby={hata ? hataId : undefined}
            >
              {gonderiliyor ? "Gizleniyor…" : "Haberi gizle"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default HideDialog;
