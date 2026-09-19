"use client";

/**
 * KULLANICI ve ROL YÖNETİMİ
 *
 * Tablo + arama + rol/durum süzgeci + satır başına rol/durum değiştirme +
 * şifre sıfırlama bağlantısı üretme.
 *
 * SIRALAMA SUNUCUDA: 14 kullanıcıda istemci tarafı sıralama yeterdi, ama
 * liste sayfalı — yalnızca görünen sayfayı sıralamak "en son giren kim"
 * sorusuna YANLIŞ cevap verirdi. `aria-sort` başlıkları sunucu sıralamasını
 * sürüyor.
 *
 * SON YÖNETİCİ KORUMASI istemcide TEKRARLANMAZ, yalnızca ÖNCEDEN UYARIR:
 * tek karar noktası backend. İstemcide ikinci bir kural yazmak, ikisinin
 * ayrışması demekti. Düğme yine gönderir, backend 400 + Türkçe açıklama
 * döndürürse o mesaj olduğu gibi gösterilir.
 *
 * ŞİFRE SIFIRLAMA BAĞLANTISI yanıtta gelir ve kopyalanabilir gösterilir.
 * Bilinçli karar: SMTP bozukken kimse hesabına erişemez kalmasın.
 */

import { useCallback, useEffect, useState } from "react";

import { Notice } from "@/components/settings/Parts";
import { formatDateTime, formatNumber } from "@/lib/format";
import {
  DURUM_ETIKET,
  ROL_ETIKET,
  createResetLink,
  getAdminUsers,
  patchAdminUser,
  type AdminRole,
  type AdminStatus,
  type AdminUser,
  type KullaniciSayfasi,
  type SifirlamaBaglantisi,
} from "@/lib/api-admin";

import { DurumSatiri, KopyaKutusu, Rozet, Sayfalama, SiraliBaslik } from "./Parts";

const ROLLER: AdminRole[] = ["uye", "editor", "admin"];
const DURUMLAR: AdminStatus[] = ["beklemede", "aktif", "askida", "pasif"];

/** Sütun -> sunucu sıralama anahtarı (artan / azalan). */
const SIRA: Record<string, { asc: string; desc: string }> = {
  eposta: { asc: "eposta", desc: "eposta-desc" },
  isim: { asc: "isim", desc: "isim-desc" },
  rol: { asc: "rol", desc: "rol-desc" },
  durum: { asc: "durum", desc: "durum-desc" },
  giris: { asc: "giris-desc", desc: "giris" },
  kayit: { asc: "eski", desc: "yeni" },
};

function durumRozetTuru(d: AdminStatus): "iyi" | "uyari" | "kotu" | "notr" {
  if (d === "aktif") return "iyi";
  if (d === "beklemede") return "uyari";
  if (d === "askida") return "kotu";
  return "notr";
}

export function UsersSection({ benimId }: { benimId: number | null }) {
  const [sayfa, setSayfa] = useState<KullaniciSayfasi | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [qGirdi, setQGirdi] = useState("");
  const [rolFiltre, setRolFiltre] = useState<AdminRole | "">("");
  const [durumFiltre, setDurumFiltre] = useState<AdminStatus | "">("");
  const [sutun, setSutun] = useState<keyof typeof SIRA>("kayit");
  const [yon, setYon] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const [bekleyen, setBekleyen] = useState<number | null>(null);
  const [bildirim, setBildirim] = useState<{ kind: "basari" | "hata"; text: string } | null>(null);
  const [baglanti, setBaglanti] = useState<SifirlamaBaglantisi | null>(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const res = await getAdminUsers({
      q,
      role: rolFiltre,
      status: durumFiltre,
      sort: SIRA[sutun][yon],
      page,
      limit: 20,
    });
    setYukleniyor(false);
    if (!res.ok) {
      setHata(res.error);
      return;
    }
    setHata(null);
    setSayfa(res.data);
  }, [q, rolFiltre, durumFiltre, sutun, yon, page]);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  function siralamaDegistir(yeni: keyof typeof SIRA) {
    if (yeni === sutun) {
      setYon((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSutun(yeni);
      setYon(yeni === "kayit" || yeni === "giris" ? "desc" : "asc");
    }
    setPage(1);
  }

  async function guncelle(u: AdminUser, patch: { role?: AdminRole; status?: AdminStatus }) {
    setBekleyen(u.id);
    setBildirim(null);
    const res = await patchAdminUser(u.id, patch);
    setBekleyen(null);

    if (!res.ok) {
      // Backend'in Türkçe açıklaması olduğu gibi gösterilir — son yönetici
      // koruması, geçersiz rol ve bulunamayan kullanıcı hepsi buradan gelir.
      setBildirim({ kind: "hata", text: res.error });
      // Liste sunucudaki gerçek duruma geri döner; ekranda yanlış değer kalmasın.
      void yukle();
      return;
    }

    const guncel = res.data;
    setSayfa((o) =>
      o
        ? { ...o, data: o.data.map((x) => (x.id === guncel.id ? { ...x, ...guncel } : x)) }
        : o,
    );
    setBildirim({
      kind: "basari",
      text: `${guncel.full_name || guncel.email}: rol ${ROL_ETIKET[guncel.role]}, durum ${
        DURUM_ETIKET[guncel.status]
      } olarak kaydedildi.`,
    });
    // Aktif yönetici sayacı değişmiş olabilir.
    void yukle();
  }

  async function sifirlamaUret(u: AdminUser) {
    setBekleyen(u.id);
    setBildirim(null);
    setBaglanti(null);
    const res = await createResetLink(u.id);
    setBekleyen(null);
    if (!res.ok) {
      setBildirim({ kind: "hata", text: res.error });
      return;
    }
    setBaglanti(res.data);
  }

  const aktifAdmin = sayfa?.meta?.aktif_admin ?? null;

  return (
    <div>
      {/* --- Süzgeçler --- */}
      <form
        className="yon-filtre"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(qGirdi);
          setPage(1);
        }}
      >
        <label className="min-w-[14rem] flex-1">
          <span className="u-kicker block text-ink-faint">Ara</span>
          <input
            className="ayar-input"
            type="search"
            value={qGirdi}
            placeholder="E-posta, ad ya da unvan"
            onChange={(e) => setQGirdi(e.currentTarget.value)}
          />
        </label>

        <label>
          <span className="u-kicker block text-ink-faint">Rol</span>
          <select
            className="ayar-select"
            value={rolFiltre}
            onChange={(e) => {
              setRolFiltre(e.currentTarget.value as AdminRole | "");
              setPage(1);
            }}
          >
            <option value="">Tümü</option>
            {ROLLER.map((r) => (
              <option key={r} value={r}>
                {ROL_ETIKET[r]}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="u-kicker block text-ink-faint">Durum</span>
          <select
            className="ayar-select"
            value={durumFiltre}
            onChange={(e) => {
              setDurumFiltre(e.currentTarget.value as AdminStatus | "");
              setPage(1);
            }}
          >
            <option value="">Tümü</option>
            {DURUMLAR.map((d) => (
              <option key={d} value={d}>
                {DURUM_ETIKET[d]}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" className="ayar-btn">
          Uygula
        </button>
        {q || rolFiltre || durumFiltre ? (
          <button
            type="button"
            className="ayar-btn"
            onClick={() => {
              setQ("");
              setQGirdi("");
              setRolFiltre("");
              setDurumFiltre("");
              setPage(1);
            }}
          >
            Temizle
          </button>
        ) : null}
      </form>

      {aktifAdmin !== null ? (
        <p className="u-body u-body-soft mt-2 text-[0.8125rem] leading-snug">
          Sistemde {formatNumber(aktifAdmin)} aktif yönetici var.{" "}
          {aktifAdmin <= 1
            ? "Son yönetici düşürülemez; panelin kilitlenmemesi için bu işlem reddedilir."
            : "Kendi yönetici rolünüzü kendiniz kaldıramazsınız."}
        </p>
      ) : null}

      <div className="mt-3">
        <Notice kind={bildirim?.kind ?? null} message={bildirim?.text ?? null} />
      </div>

      {baglanti ? (
        <div className="yon-altbolum">
          <h3 className="u-kicker text-ink">
            Şifre sıfırlama bağlantısı — {baglanti.kullanici.email}
          </h3>
          <div className="mt-2">
            <KopyaKutusu
              etiket="Tek kullanımlık bağlantı"
              deger={baglanti.url}
              aciklama={
                <>
                  {baglanti.uyari}
                  {baglanti.expires_at
                    ? ` Geçerlilik bitişi: ${formatDateTime(baglanti.expires_at)}.`
                    : ""}
                </>
              }
            />
          </div>
          <div className="mt-2">
            <button type="button" className="ayar-btn" onClick={() => setBaglanti(null)}>
              Kapat
            </button>
          </div>
        </div>
      ) : null}

      <DurumSatiri
        yukleniyor={yukleniyor && !sayfa}
        hata={hata}
        bos={Boolean(sayfa && sayfa.data.length === 0)}
        bosMesaj="Bu süzgeçle eşleşen kullanıcı yok."
      />

      {sayfa && sayfa.data.length > 0 ? (
        <div className="ayar-scroll mt-3">
          <table className="ayar-table yon-tablo">
            <caption className="sr-only">
              Kullanıcılar: rol, durum, son giriş ve yönetim işlemleri
            </caption>
            <thead>
              <tr>
                <SiraliBaslik
                  baslik="Ad"
                  aktif={sutun === "isim"}
                  yon={yon}
                  onClick={() => siralamaDegistir("isim")}
                />
                <SiraliBaslik
                  baslik="E-posta"
                  aktif={sutun === "eposta"}
                  yon={yon}
                  onClick={() => siralamaDegistir("eposta")}
                />
                <SiraliBaslik
                  baslik="Rol"
                  aktif={sutun === "rol"}
                  yon={yon}
                  onClick={() => siralamaDegistir("rol")}
                />
                <SiraliBaslik
                  baslik="Durum"
                  aktif={sutun === "durum"}
                  yon={yon}
                  onClick={() => siralamaDegistir("durum")}
                />
                <SiraliBaslik
                  baslik="Son giriş"
                  aktif={sutun === "giris"}
                  yon={yon}
                  onClick={() => siralamaDegistir("giris")}
                />
                <th scope="col">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {sayfa.data.map((u) => {
                const benim = benimId !== null && u.id === benimId;
                const mesgul = bekleyen === u.id;
                return (
                  <tr key={u.id} data-inactive={u.status !== "aktif" ? "true" : undefined}>
                    <th scope="row" className="font-normal">
                      {u.full_name || "—"}
                      {benim ? (
                        <span className="u-kicker ml-2 text-accent">Siz</span>
                      ) : null}
                      {u.title ? (
                        <span className="u-body u-body-soft block text-[0.8125rem] leading-snug">
                          {u.title}
                        </span>
                      ) : null}
                    </th>
                    <td className="break-all">
                      {u.email}
                      {u.locked_until ? (
                        <span className="u-body u-body-soft block text-[0.75rem] leading-snug">
                          Kilitli: {formatDateTime(u.locked_until)} ·{" "}
                          {formatNumber(u.failed_login_count)} başarısız deneme
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <label>
                        <span className="sr-only">{u.email} rolü</span>
                        <select
                          className="ayar-select"
                          value={u.role}
                          disabled={mesgul}
                          onChange={(e) =>
                            guncelle(u, { role: e.currentTarget.value as AdminRole })
                          }
                        >
                          {ROLLER.map((r) => (
                            <option key={r} value={r}>
                              {ROL_ETIKET[r]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </td>
                    <td>
                      <label>
                        <span className="sr-only">{u.email} durumu</span>
                        <select
                          className="ayar-select"
                          value={u.status}
                          disabled={mesgul}
                          onChange={(e) =>
                            guncelle(u, { status: e.currentTarget.value as AdminStatus })
                          }
                        >
                          {DURUMLAR.map((d) => (
                            <option key={d} value={d}>
                              {DURUM_ETIKET[d]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <span className="mt-1 block">
                        <Rozet tur={durumRozetTuru(u.status)}>{DURUM_ETIKET[u.status]}</Rozet>
                      </span>
                    </td>
                    <td className="whitespace-nowrap">
                      {u.last_login_at ? formatDateTime(u.last_login_at) : "Hiç girmedi"}
                      {u.aktif_oturum > 0 ? (
                        <span className="u-body u-body-soft block text-[0.75rem]">
                          {formatNumber(u.aktif_oturum)} açık oturum
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ayar-btn"
                        disabled={mesgul}
                        onClick={() => sifirlamaUret(u)}
                      >
                        {mesgul ? "…" : "Şifre bağlantısı"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {sayfa ? (
        <Sayfalama
          page={sayfa.page}
          totalPages={sayfa.totalPages}
          total={sayfa.total}
          birim="kullanıcı"
          busy={yukleniyor}
          onChange={setPage}
        />
      ) : null}
    </div>
  );
}
