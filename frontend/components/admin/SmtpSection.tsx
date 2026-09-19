"use client";

/**
 * SMTP YAPILANDIRMASI
 *
 * ŞİFRE SÖZLEŞMESİ (kritik):
 *  - Backend şifreyi ASLA döndürmez, yalnızca `password_tanimli: boolean`.
 *    Bu yüzden alan boş açılır ve yanında "tanımlı" yazar; boş bırakılırsa
 *    istek gövdesine KONMAZ, mevcut şifre korunur.
 *  - "Şifreyi sil" ayrı bir onay kutusu: boş bırakmakla silmek ayrı
 *    niyetler, aynı hareketle ifade edilemez.
 *  - `SETTINGS_SECRET` tanımsızsa şifre alanı DEVRE DIŞI ve NEDENİ yazılı.
 *    Diğer alanlar (sunucu, port, gönderen) yazılabilir kalır: şifre
 *    olmadan da yapılandırmanın yarısını kaydetmek anlamlıdır ve
 *    kullanıcıyı boş bir ekranla cezalandırmaz.
 */

import { useEffect, useState } from "react";

import { Field, Notice, Switch } from "@/components/settings/Parts";
import {
  putAdminSetting,
  sendSmtpTest,
  type AyarZarfi,
  type SmtpAyari,
  type SmtpTestSonucu,
} from "@/lib/api-admin";

import { Rozet } from "./Parts";

interface FormDurumu {
  host: string;
  port: string;
  secure: boolean;
  user: string;
  password: string;
  from_name: string;
  from_email: string;
  sifreyiSil: boolean;
}

function formaCevir(v: SmtpAyari): FormDurumu {
  return {
    host: v.host ?? "",
    port: String(v.port ?? 587),
    secure: Boolean(v.secure),
    user: v.user ?? "",
    password: "",
    from_name: v.from_name ?? "",
    from_email: v.from_email ?? "",
    sifreyiSil: false,
  };
}

/** İstemci tarafı doğrulama — backend'e gitmeden anlaşılır uyarı verir. */
function dogrula(f: FormDurumu): Partial<Record<keyof FormDurumu, string>> {
  const h: Partial<Record<keyof FormDurumu, string>> = {};

  if (f.host.trim() && !/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(f.host.trim())) {
    h.host = "Sunucu adresi bir alan adı olmalıdır (örnek: smtp.yandex.com).";
  }
  const port = Number(f.port);
  if (f.port.trim() === "" || !Number.isInteger(port) || port < 1 || port > 65535) {
    h.port = "Port 1 ile 65535 arasında bir tam sayı olmalıdır.";
  }
  if (f.from_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.from_email.trim())) {
    h.from_email = "Geçerli bir e-posta adresi girin.";
  }
  if (f.password && f.sifreyiSil) {
    h.password = "Aynı anda şifre yazıp silmeyi seçemezsiniz. Birini tercih edin.";
  }
  return h;
}

export function SmtpSection({
  zarf,
  onKaydedildi,
}: {
  zarf: AyarZarfi<SmtpAyari>;
  onKaydedildi: (yeni: AyarZarfi<SmtpAyari>) => void;
}) {
  const [form, setForm] = useState<FormDurumu>(() => formaCevir(zarf.value));
  const [hatalar, setHatalar] = useState<Partial<Record<keyof FormDurumu, string>>>({});
  const [bildirim, setBildirim] = useState<{ kind: "basari" | "hata"; text: string } | null>(null);
  const [kaydediyor, setKaydediyor] = useState(false);

  const [testAdres, setTestAdres] = useState("");
  const [testMesaj, setTestMesaj] = useState<SmtpTestSonucu | null>(null);
  const [testHata, setTestHata] = useState<string | null>(null);
  const [testEdiyor, setTestEdiyor] = useState(false);

  // Üst katman ayarları yeniden yüklerse form da güncellenir; yazılmış
  // şifre alanı KASTEN sıfırlanır (ekranda hiç durmasın).
  useEffect(() => {
    setForm(formaCevir(zarf.value));
  }, [zarf]);

  const anahtar = zarf.sir_anahtari;
  const sifreYazilabilir = anahtar?.available !== false;
  const sifreTanimli = zarf.value.password_tanimli;

  function alan<K extends keyof FormDurumu>(ad: K, deger: FormDurumu[K]) {
    setForm((o) => ({ ...o, [ad]: deger }));
    setBildirim(null);
  }

  async function kaydet(e: React.FormEvent) {
    e.preventDefault();
    const h = dogrula(form);
    setHatalar(h);
    if (Object.keys(h).length > 0) {
      setBildirim({ kind: "hata", text: "Formda düzeltilmesi gereken alanlar var." });
      return;
    }

    // Kısmi gövde: şifre yalnızca gerçekten değişiyorsa gönderilir.
    const govde: Record<string, unknown> = {
      host: form.host.trim(),
      port: Number(form.port),
      secure: form.secure,
      user: form.user.trim(),
      from_name: form.from_name.trim(),
      from_email: form.from_email.trim(),
    };
    if (form.sifreyiSil) govde.password = "";
    else if (form.password) govde.password = form.password;

    setKaydediyor(true);
    setBildirim(null);
    const res = await putAdminSetting<SmtpAyari>("smtp", govde);
    setKaydediyor(false);

    if (!res.ok) {
      setBildirim({ kind: "hata", text: res.error });
      return;
    }
    onKaydedildi(res.data);
    setForm((o) => ({ ...o, password: "", sifreyiSil: false }));
    setBildirim({
      kind: "basari",
      text: form.sifreyiSil
        ? "SMTP ayarları kaydedildi ve şifre silindi."
        : form.password
          ? "SMTP ayarları ve yeni şifre kaydedildi."
          : "SMTP ayarları kaydedildi. Şifre değiştirilmedi.",
    });
  }

  async function testGonder() {
    setTestEdiyor(true);
    setTestHata(null);
    setTestMesaj(null);
    const res = await sendSmtpTest(testAdres.trim() || undefined);
    setTestEdiyor(false);
    if (!res.ok) {
      setTestHata(res.error);
      return;
    }
    setTestMesaj(res.data);
  }

  return (
    <div className="max-w-3xl">
      {/* Anahtar yoksa NEDEN yazılı — boş bir devre dışı alan bırakılmaz. */}
      {!sifreYazilabilir ? (
        <p className="ayar-uyari mb-4" data-tur="hata">
          <strong>Şifre alanı devre dışı.</strong>{" "}
          {anahtar?.reason ??
            "SETTINGS_SECRET tanımlı değil, SMTP şifresi kaydedilemez."}{" "}
          Şifre dışındaki alanlar kaydedilebilir.
        </p>
      ) : null}

      <form onSubmit={kaydet} noValidate>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <Field
            label="Sunucu adresi"
            hint="Örnek: smtp.yandex.com"
            error={hatalar.host}
            errorId="smtp-host-hata"
          >
            <input
              className="ayar-input"
              type="text"
              value={form.host}
              autoComplete="off"
              aria-invalid={hatalar.host ? true : undefined}
              aria-describedby={hatalar.host ? "smtp-host-hata" : undefined}
              onChange={(e) => alan("host", e.currentTarget.value)}
            />
          </Field>

          <Field
            label="Port"
            hint="465 için güvenli bağlantı açık, 587 için kapalı olur."
            error={hatalar.port}
            errorId="smtp-port-hata"
          >
            <input
              className="ayar-input"
              type="number"
              min={1}
              max={65535}
              value={form.port}
              aria-invalid={hatalar.port ? true : undefined}
              aria-describedby={hatalar.port ? "smtp-port-hata" : undefined}
              onChange={(e) => alan("port", e.currentTarget.value)}
            />
          </Field>

          <div className="ayar-field">
            <span className="u-kicker block text-ink">Güvenli bağlantı (TLS)</span>
            <span className="u-body u-body-soft block text-[0.75rem] leading-snug">
              465 numaralı portta açık, 587’de kapalı olmalıdır.
            </span>
            <div className="mt-2">
              <Switch
                checked={form.secure}
                onChange={(v) => alan("secure", v)}
                label="SMTP güvenli bağlantı"
              />
            </div>
          </div>

          <Field label="Kullanıcı adı" hint="Genellikle gönderen e-posta adresiyle aynı.">
            <input
              className="ayar-input"
              type="text"
              value={form.user}
              autoComplete="off"
              onChange={(e) => alan("user", e.currentTarget.value)}
            />
          </Field>

          <Field
            label="Şifre"
            hint={
              sifreTanimli
                ? "Kayıtlı bir şifre var. Boş bırakırsanız değişmez."
                : "Henüz şifre kaydedilmedi."
            }
            error={hatalar.password}
            errorId="smtp-sifre-hata"
          >
            <input
              className="ayar-input"
              type="password"
              value={form.password}
              disabled={!sifreYazilabilir || form.sifreyiSil}
              autoComplete="new-password"
              placeholder={sifreTanimli ? "••••••••  (tanımlı)" : ""}
              aria-invalid={hatalar.password ? true : undefined}
              aria-describedby={hatalar.password ? "smtp-sifre-hata" : undefined}
              onChange={(e) => alan("password", e.currentTarget.value)}
            />
          </Field>

          <div className="ayar-field">
            <span className="u-kicker block text-ink">Şifre durumu</span>
            <p className="mt-2">
              <Rozet tur={sifreTanimli ? "iyi" : "uyari"}>
                {sifreTanimli ? "Tanımlı" : "Tanımsız"}
              </Rozet>
            </p>
            {sifreTanimli && sifreYazilabilir ? (
              <label className="u-body mt-3 flex items-start gap-2 text-[0.8125rem] leading-snug">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.sifreyiSil}
                  onChange={(e) => alan("sifreyiSil", e.currentTarget.checked)}
                />
                <span>Kayıtlı şifreyi sil (gönderim kimlik doğrulaması olmadan denenir).</span>
              </label>
            ) : null}
            <p className="u-body u-body-soft mt-2 text-[0.75rem] leading-snug">
              Şifre sunucuda AES-256-GCM ile şifrelenmiş saklanır ve hiçbir API
              yanıtında geri dönmez.
            </p>
          </div>

          <Field label="Gönderen adı" hint="E-postalarda görünen ad.">
            <input
              className="ayar-input"
              type="text"
              value={form.from_name}
              onChange={(e) => alan("from_name", e.currentTarget.value)}
            />
          </Field>

          <Field
            label="Gönderen e-posta"
            error={hatalar.from_email}
            errorId="smtp-from-hata"
          >
            <input
              className="ayar-input"
              type="email"
              value={form.from_email}
              autoComplete="off"
              aria-invalid={hatalar.from_email ? true : undefined}
              aria-describedby={hatalar.from_email ? "smtp-from-hata" : undefined}
              onChange={(e) => alan("from_email", e.currentTarget.value)}
            />
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="submit" className="ayar-btn ayar-btn-primary" disabled={kaydediyor}>
            {kaydediyor ? "Kaydediliyor…" : "SMTP ayarlarını kaydet"}
          </button>
          {zarf.updated_at ? (
            <span className="u-kicker text-ink-faint">
              Son kayıt: {new Date(zarf.updated_at).toLocaleString("tr-TR")}
            </span>
          ) : (
            <span className="u-kicker text-ink-faint">Varsayılan değerler</span>
          )}
        </div>

        <div className="mt-3">
          <Notice kind={bildirim?.kind ?? null} message={bildirim?.text ?? null} />
        </div>
      </form>

      {/* --- Test e-postası --- */}
      <div className="yon-altbolum">
        <h3 className="u-kicker text-ink">Test e-postası</h3>
        <p className="u-body u-body-soft mt-1 text-[0.875rem] leading-snug">
          Gönderim denemesi her durumda gönderim kaydına yazılır — başarısız
          olsa bile izi kalır ve nedeni burada yazılıdır.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <Field label="Alıcı adresi" hint="Boş bırakırsanız kendi adresinize gönderilir.">
              <input
                className="ayar-input"
                type="email"
                value={testAdres}
                autoComplete="off"
                onChange={(e) => setTestAdres(e.currentTarget.value)}
              />
            </Field>
          </div>
          <button type="button" className="ayar-btn" onClick={testGonder} disabled={testEdiyor}>
            {testEdiyor ? "Gönderiliyor…" : "Test e-postası gönder"}
          </button>
        </div>

        <div aria-live="polite" role="status" className="mt-3">
          {testHata ? (
            <p className="ayar-bildirim" data-tur="hata">
              {testHata}
            </p>
          ) : null}
          {testMesaj ? (
            <>
              <p
                className="ayar-bildirim"
                data-tur={testMesaj.status === "gonderildi" ? "basari" : "hata"}
              >
                {testMesaj.aciklama}
              </p>
              {testMesaj.tani ? (
                <dl className="yon-tani">
                  <div>
                    <dt>Gönderim hazır</dt>
                    <dd>{testMesaj.tani.hazir ? "Evet" : "Hayır"}</dd>
                  </div>
                  <div>
                    <dt>nodemailer paketi</dt>
                    <dd>{testMesaj.tani.nodemailer ? "Kurulu" : "Kurulu değil"}</dd>
                  </div>
                  <div>
                    <dt>Yapılandırma kaynağı</dt>
                    <dd>{testMesaj.tani.kaynak ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Sunucu</dt>
                    <dd>
                      {testMesaj.tani.sunucu ?? "—"}
                      {testMesaj.tani.port ? `:${testMesaj.tani.port}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Gönderen</dt>
                    <dd>{testMesaj.tani.gonderen ?? "—"}</dd>
                  </div>
                  {testMesaj.tani.eksik.length > 0 ? (
                    <div>
                      <dt>Eksik</dt>
                      <dd>{testMesaj.tani.eksik.join(", ")}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
