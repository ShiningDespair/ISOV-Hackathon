"use client";

/**
 * GENEL BAKIŞ
 *
 * Salt okunur. Burada değiştirilebilir hiçbir ayar yok; amaç "sistem şu an
 * nerede" sorusunu tek ekranda yanıtlamak: kaç kullanıcı hangi rolde, kim
 * ne zaman girmiş, korpus ne kadar, son toplama ne getirdi, e-posta kuyruğu
 * ne durumda ve hangi ayarlar eksik.
 *
 * SAYI UYDURULMAZ: bir alan gelmezse "—" basılır.
 */

import { formatDateTime, formatNumber, relativeTime } from "@/lib/format";
import {
  DURUM_ETIKET,
  EPOSTA_DURUM_ETIKET,
  ROL_ETIKET,
  type AdminOverview,
  type AdminRole,
  type AdminStatus,
  type EmailStatus,
} from "@/lib/api-admin";

import { DurumSatiri, Rozet, SayiKutusu } from "./Parts";

const TETIKLEYICI: Record<string, string> = {
  manuel: "Manuel",
  zamanlanmis: "Zamanlanmış",
  seed: "Başlangıç verisi",
};

export function OverviewSection({
  veri,
  yukleniyor,
  hata,
}: {
  veri: AdminOverview | null;
  yukleniyor: boolean;
  hata: string | null;
}) {
  if (!veri) {
    return (
      <DurumSatiri
        yukleniyor={yukleniyor}
        hata={hata}
        bos={!yukleniyor && !hata}
        bosMesaj="Genel bakış verisi alınamadı."
      />
    );
  }

  const k = veri.kullanicilar;
  const c = veri.korpus;
  const r = veri.son_toplama;
  const a = veri.ayarlar;

  const epostaToplam = (Object.values(veri.eposta) as number[]).reduce(
    (t, n) => t + Number(n || 0),
    0,
  );

  return (
    <div>
      {hata ? (
        <p className="ayar-bildirim mb-4" data-tur="hata" role="alert">
          {hata}
        </p>
      ) : null}

      {/* --- Sayı kutuları --- */}
      <div className="yon-kutu-grid">
        <SayiKutusu
          etiket="Kullanıcı"
          deger={formatNumber(k.toplam)}
          not={`${formatNumber(k.role_gore.admin ?? 0)} yönetici · ${formatNumber(
            k.role_gore.editor ?? 0,
          )} editör · ${formatNumber(k.role_gore.uye ?? 0)} üye`}
        />
        <SayiKutusu
          etiket="Haber"
          deger={formatNumber(c.haber)}
          not={`${formatNumber(c.tekil_haber)} tekil · ${formatNumber(
            c.haber - c.tekil_haber,
          )} tekrar elendi`}
        />
        <SayiKutusu
          etiket="Kaynak"
          deger={formatNumber(c.kaynak)}
          not={`${formatNumber(c.etkin_kaynak)} tanesi sistemde etkin`}
        />
        <SayiKutusu etiket="Küme" deger={formatNumber(c.kume)} not="Aynı olayı yazan kaynak grupları" />
        <SayiKutusu
          etiket="E-posta kaydı"
          deger={formatNumber(epostaToplam)}
          not={
            epostaToplam === 0
              ? "Henüz gönderim denemesi yok"
              : (Object.entries(veri.eposta) as [EmailStatus, number][])
                  .filter(([, n]) => Number(n) > 0)
                  .map(([s, n]) => `${formatNumber(Number(n))} ${EPOSTA_DURUM_ETIKET[s]}`)
                  .join(" · ")
          }
        />
        <SayiKutusu
          etiket="Son toplama"
          deger={r ? (relativeTime(r.finished_at ?? r.started_at) || "—") : "—"}
          not={
            r
              ? `${formatNumber(r.fetched_count)} kayıt · ${formatNumber(
                  r.new_count,
                )} yeni · ${formatNumber(r.duplicate_count)} tekrar · ${formatNumber(
                  r.error_count,
                )} hata`
              : "Toplama kaydı yok"
          }
        />
      </div>

      {/* --- Üç kolon: durumlar, son girişler, ayar sağlığı --- */}
      <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-3">
        <div className="min-w-0">
          <h3 className="u-kicker border-b border-ink pb-1 text-ink">
            Kullanıcı Durumları
          </h3>
          <table className="ayar-table mt-1">
            <caption className="sr-only">Role ve duruma göre kullanıcı sayıları</caption>
            <thead>
              <tr>
                <th scope="col">Kırılım</th>
                <th scope="col">Sayı</th>
              </tr>
            </thead>
            <tbody>
              {(["admin", "editor", "uye"] as AdminRole[]).map((rol) => (
                <tr key={rol}>
                  <th scope="row" className="font-normal">
                    {ROL_ETIKET[rol]}
                  </th>
                  <td className="tabular-nums">{formatNumber(k.role_gore[rol] ?? 0)}</td>
                </tr>
              ))}
              {(["aktif", "beklemede", "askida", "pasif"] as AdminStatus[]).map((d) => (
                <tr key={d}>
                  <th scope="row" className="font-normal text-ink-soft">
                    {DURUM_ETIKET[d]}
                  </th>
                  <td className="tabular-nums text-ink-soft">
                    {formatNumber(k.duruma_gore[d] ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="min-w-0">
          <h3 className="u-kicker border-b border-ink pb-1 text-ink">Son Girişler</h3>
          {k.son_girisler.length === 0 ? (
            <p className="u-body u-body-soft mt-2 text-[0.9375rem]">
              Henüz kimse giriş yapmamış.
            </p>
          ) : (
            <ul className="mt-1">
              {k.son_girisler.map((u) => (
                <li
                  key={u.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-rule py-2"
                >
                  <span className="u-body min-w-0 text-[0.9375rem]">
                    {u.full_name || u.email}
                    <span className="u-kicker ml-2 text-ink-faint">{ROL_ETIKET[u.role]}</span>
                  </span>
                  <span className="u-kicker text-ink-soft">
                    {formatDateTime(u.last_login_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0">
          <h3 className="u-kicker border-b border-ink pb-1 text-ink">Ayar Sağlığı</h3>
          <ul className="mt-1">
            <li className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-rule py-2">
              <span className="u-body text-[0.9375rem]">SMTP yapılandırması</span>
              <Rozet tur={a.smtp_hazir ? "iyi" : "uyari"}>
                {a.smtp_hazir ? "Tam" : "Eksik"}
              </Rozet>
            </li>
            <li className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-rule py-2">
              <span className="u-body text-[0.9375rem]">
                Şifre anahtarı (SETTINGS_SECRET)
              </span>
              <Rozet tur={a.sir_anahtari.available ? "iyi" : "kotu"}>
                {a.sir_anahtari.available ? "Tanımlı" : "Tanımsız"}
              </Rozet>
            </li>
            <li className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-rule py-2">
              <span className="u-body text-[0.9375rem]">Kişiselleştirme</span>
              <Rozet tur={a.kisiselestirme_acik ? "iyi" : "notr"}>
                {a.kisiselestirme_acik ? "Açık" : "Kapalı"}
              </Rozet>
            </li>
            <li className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-rule py-2">
              <span className="u-body text-[0.9375rem]">Bülten</span>
              <Rozet tur={a.bulten_acik ? "iyi" : "notr"}>
                {a.bulten_acik ? "Açık" : "Kapalı"}
              </Rozet>
            </li>
            <li className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-rule py-2">
              <span className="u-body text-[0.9375rem]">Yeni kayıt</span>
              <Rozet tur={a.kayit_acik ? "iyi" : "notr"}>
                {a.kayit_acik ? "Açık" : "Kapalı"}
              </Rozet>
            </li>
          </ul>
          {!a.sir_anahtari.available && a.sir_anahtari.reason ? (
            <p className="ayar-uyari mt-3">{a.sir_anahtari.reason}</p>
          ) : null}
          {r?.trigger_type ? (
            <p className="u-body u-body-soft mt-3 text-[0.8125rem] leading-snug">
              Son toplama tetikleyicisi:{" "}
              {TETIKLEYICI[r.trigger_type] ?? r.trigger_type}
              {r.finished_at ? ` — ${formatDateTime(r.finished_at)}` : ""}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
