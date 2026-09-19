/**
 * DEĞİŞİKLİKLER — /degisiklikler
 *
 * Amaç: "ne değişti?" sorusunun tek bakışta cevabı. Bu yüzden varsayılan
 * görünüm ÇOK KISA — her değişiklik tek satır. Detay isteyen satırı açar
 * (`<details>`, JS gerektirmez).
 *
 * Görünüm yuvası (data-view-slot) KULLANILMAZ: panel dört görünümün
 * hepsinde erişilebilir olmalı.
 *
 * `/changes` henüz uygulanmadıysa (501) ya da router bağlanmadıysa (404)
 * sayfa ÇÖKMEZ: temiz bir "takip henüz etkin değil" durumu gösterir. Sayı
 * uydurulmaz, boş liste "değişiklik yok" gibi sunulmaz.
 */

import type { Metadata } from "next";
import Link from "next/link";

import {
  CHANGE_TYPE_LABEL,
  getChanges,
  hazirDegil,
  normalizeChangeType,
} from "@/lib/api-me";
import { formatNumber } from "@/lib/format";

import {
  DateRangeChip,
  DateRangeFilter,
  gecerliGun,
  tarihAraligiEtiketi,
  type DateFilterState,
} from "@/components/DateRangeFilter";
import { ChangeList } from "@/components/changes/ChangeList";
import { ChangeTypeFilter } from "@/components/changes/ChangeTypeFilter";
import { SinceLastVisit } from "@/components/changes/SinceLastVisit";
import { DataUnavailable, EmptyState } from "@/components/States";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Değişiklikler",
  description:
    "Bültendeki değişikliklerin kısa dökümü: yeni haberler, büyüyen kümeler, yükselen bandlar ve dosya gelişmeleri.",
};

const BASE = "/degisiklikler";
const LIMIT = 200;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value && value.trim() !== "" ? value : undefined;
}

export default async function DegisikliklerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;

  // Tür parametresi ENUM dışıysa yok sayılır — uydurma filtre gösterilmez.
  const tur = normalizeChangeType(one(sp.type));
  const state: DateFilterState = {
    from: gecerliGun(one(sp.from)),
    to: gecerliGun(one(sp.to)),
    type: tur ?? undefined,
  };

  const res = await getChanges({
    from: state.from,
    to: state.to,
    type: state.type,
    limit: LIMIT,
  });

  const aralik = tarihAraligiEtiketi(state.from, state.to);

  const baslik = (
    <header className="border-b border-ink py-5">
      <p className="u-kicker u-kicker-accent">Takip</p>
      <h1 className="u-headline u-headline-lg mt-1">Değişiklikler</h1>
      <p className="u-body u-body-soft mt-2 max-w-2xl text-[0.95rem]">
        Her değişiklik tek satır. Ayrıntı için satırı açın. Yeni haberler,
        doğrulayan kaynak sayısının artması, önem bandının yükselmesi, aynı
        mevzuat dosyasındaki gelişmeler ve özet güncellemeleri burada toplanır.
      </p>
      <div className="mt-3">
        {/* Oturum ve uç nokta varsa görünür; yoksa hiç basılmaz. */}
        <SinceLastVisit />
      </div>
    </header>
  );

  const filtreler = (
    <div className="degis-filtre-blok">
      <DateRangeFilter
        state={state}
        basePath={BASE}
        className="degis-tarih-sag"
      />
      <ChangeTypeFilter
        state={state}
        basePath={BASE}
        counts={res.ok ? res.data.counts : undefined}
        /* Sayılar yalnızca tür filtresi YOKKEN gösterilir: filtreliyken
           sorgu tek türü döndürür, diğer türlerin sayısı bilinmiyor demektir
           ve "0" basmak yanlış olur. */
        showCounts={
          res.ok &&
          !state.type &&
          (!res.data.countsFromList || res.data.data.length >= res.data.total)
        }
      />
      {aralik || state.type ? (
        <div className="degis-cipler">
          <span className="u-kicker text-ink-faint">Etkin Filtreler</span>
          <DateRangeChip state={state} basePath={BASE} />
          {state.type && tur ? (
            <Link
              href={`${BASE}${
                state.from || state.to
                  ? `?${new URLSearchParams({
                      ...(state.from ? { from: state.from } : {}),
                      ...(state.to ? { to: state.to } : {}),
                    }).toString()}`
                  : ""
              }`}
              className="tag-chip"
              title="Tür filtresini kaldır"
            >
              Tür: {CHANGE_TYPE_LABEL[tur]} <span aria-hidden="true">×</span>
              <span className="sr-only-custom"> filtresini kaldır</span>
            </Link>
          ) : null}
          <Link href={BASE} className="u-kicker u-link-underline text-accent">
            Tümünü Temizle
          </Link>
        </div>
      ) : null}
    </div>
  );

  /* --- Gövde: üç ayrı durum ---------------------------------------- */
  let govde: React.ReactNode;

  if (!res.ok && hazirDegil(res.status)) {
    // Uç nokta yok: "bozuk" değil, "henüz yok". Ayrım kullanıcı için önemli.
    govde = (
      <EmptyState
        title="Değişiklik takibi henüz etkin değil."
        hint="Sunucu tarafındaki değişiklik kaydı (/api/changes) yayına alındığında yeni haberler, büyüyen kümeler ve dosya gelişmeleri bu sayfada satır satır listelenecek."
      />
    );
  } else if (!res.ok) {
    govde = <DataUnavailable message={res.error} />;
  } else if (res.data.data.length === 0) {
    govde = (
      <EmptyState
        title="Bu aralıkta değişiklik yok"
        hint="Tarih aralığını genişletmeyi ya da tür filtresini kaldırmayı deneyin."
      />
    );
  } else {
    govde = (
      <>
        <p className="degis-toplam u-kicker">
          {formatNumber(res.data.total || res.data.data.length)} kayıt
          {aralik ? ` · ${aralik}` : ""}
          {res.data.total > res.data.data.length
            ? ` · ilk ${formatNumber(res.data.data.length)} gösteriliyor`
            : ""}
        </p>
        <ChangeList items={res.data.data} />
      </>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-14 sm:px-6">
      {baslik}
      {filtreler}
      {govde}
      <p className="degis-dipnot">
        Değişiklikler kurumun panelinde herkes için aynıdır; “son ziyaretinizden
        beri” satırı yalnızca sizin oturumunuza bakar.
      </p>
    </div>
  );
}
