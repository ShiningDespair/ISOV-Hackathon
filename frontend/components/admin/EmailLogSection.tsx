"use client";

/**
 * GÖNDERİM KAYDI (`email_log`)
 *
 * Gövde saklanmaz (KVKK + boyut), yalnızca özeti: alıcı, tür, konu, durum
 * ve hata metni. Bu yüzden tablo "ne gönderildi" değil "ne oldu" sorusunu
 * yanıtlar — başarısızlığın NEDENİ en önemli sütun.
 *
 * Durum süzgecindeki sayılar SÜZGEÇTEN BAĞIMSIZ toplamlar; "hata" sekmesine
 * geçince toplamın değişmesi kullanıcıyı yanıltırdı.
 */

import { useCallback, useEffect, useState } from "react";

import { formatDateTime, formatNumber } from "@/lib/format";
import {
  EPOSTA_DURUM_ETIKET,
  EPOSTA_TUR_ETIKET,
  getAdminEmailLog,
  type EmailKind,
  type EmailStatus,
  type EpostaKaydiSayfasi,
} from "@/lib/api-admin";

import { DurumSatiri, Rozet, Sayfalama } from "./Parts";

const DURUMLAR: EmailStatus[] = ["kuyrukta", "gonderildi", "hata", "iptal"];

function rozetTuru(s: EmailStatus): "iyi" | "uyari" | "kotu" | "notr" {
  if (s === "gonderildi") return "iyi";
  if (s === "kuyrukta") return "uyari";
  if (s === "hata") return "kotu";
  return "notr";
}

export function EmailLogSection() {
  const [sayfa, setSayfa] = useState<EpostaKaydiSayfasi | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);

  const [durum, setDurum] = useState<EmailStatus | "">("");
  const [tur, setTur] = useState<EmailKind | "">("");
  const [page, setPage] = useState(1);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const res = await getAdminEmailLog({ status: durum, kind: tur, page, limit: 20 });
    setYukleniyor(false);
    if (!res.ok) {
      setHata(res.error);
      return;
    }
    setHata(null);
    setSayfa(res.data);
  }, [durum, tur, page]);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  const sayaclar = sayfa?.meta?.durumlar ?? null;

  return (
    <div>
      <div className="yon-filtre">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="u-kicker mr-1 text-ink-faint">Durum</span>
          <button
            type="button"
            className="ayar-chip"
            aria-pressed={durum === ""}
            onClick={() => {
              setDurum("");
              setPage(1);
            }}
          >
            Tümü
          </button>
          {DURUMLAR.map((d) => (
            <button
              key={d}
              type="button"
              className="ayar-chip"
              aria-pressed={durum === d}
              onClick={() => {
                setDurum(d);
                setPage(1);
              }}
            >
              {EPOSTA_DURUM_ETIKET[d]}
              {sayaclar ? ` (${formatNumber(sayaclar[d] ?? 0)})` : ""}
            </button>
          ))}
        </div>

        <label>
          <span className="u-kicker block text-ink-faint">Tür</span>
          <select
            className="ayar-select"
            value={tur}
            onChange={(e) => {
              setTur(e.currentTarget.value as EmailKind | "");
              setPage(1);
            }}
          >
            <option value="">Tümü</option>
            {(sayfa?.meta?.turler ?? []).map((t) => (
              <option key={t} value={t}>
                {EPOSTA_TUR_ETIKET[t] ?? t}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="ayar-btn" onClick={() => void yukle()} disabled={yukleniyor}>
          {yukleniyor ? "Yenileniyor…" : "Yenile"}
        </button>
      </div>

      <DurumSatiri
        yukleniyor={yukleniyor && !sayfa}
        hata={hata}
        bos={Boolean(sayfa && sayfa.data.length === 0)}
        bosMesaj={
          durum || tur
            ? "Bu süzgeçle eşleşen gönderim kaydı yok."
            : "Henüz hiç e-posta gönderim denemesi yapılmadı."
        }
      />

      {sayfa && sayfa.data.length > 0 ? (
        <div className="ayar-scroll mt-3">
          <table className="ayar-table yon-tablo">
            <caption className="sr-only">E-posta gönderim kaydı</caption>
            <thead>
              <tr>
                <th scope="col">Zaman</th>
                <th scope="col">Alıcı</th>
                <th scope="col">Tür</th>
                <th scope="col">Durum</th>
                <th scope="col">Açıklama</th>
              </tr>
            </thead>
            <tbody>
              {sayfa.data.map((k) => (
                <tr key={k.id}>
                  <td className="whitespace-nowrap">
                    {formatDateTime(k.queued_at)}
                    {k.sent_at ? (
                      <span className="u-body u-body-soft block text-[0.75rem]">
                        Gönderim: {formatDateTime(k.sent_at)}
                      </span>
                    ) : null}
                  </td>
                  <td className="break-all">
                    {k.to_email}
                    {k.user_name ? (
                      <span className="u-body u-body-soft block text-[0.75rem]">
                        {k.user_name}
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap">
                    {EPOSTA_TUR_ETIKET[k.kind] ?? k.kind}
                    {k.digest_date ? (
                      <span className="u-body u-body-soft block text-[0.75rem]">
                        {k.digest_date}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <Rozet tur={rozetTuru(k.status)}>{EPOSTA_DURUM_ETIKET[k.status]}</Rozet>
                    {k.attempt_count > 1 ? (
                      <span className="u-body u-body-soft block text-[0.75rem]">
                        {formatNumber(k.attempt_count)} deneme
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {k.subject ? (
                      <span className="u-body block text-[0.875rem]">{k.subject}</span>
                    ) : null}
                    {k.error ? (
                      <span className="yon-hata-metni">{k.error}</span>
                    ) : null}
                    {k.article_count > 0 ? (
                      <span className="u-body u-body-soft block text-[0.75rem]">
                        {formatNumber(k.article_count)} haber
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {sayfa ? (
        <Sayfalama
          page={sayfa.page}
          totalPages={sayfa.totalPages}
          total={sayfa.total}
          birim="kayıt"
          busy={yukleniyor}
          onChange={setPage}
        />
      ) : null}
    </div>
  );
}
