/**
 * DEĞİŞİKLİK SATIRI — varsayılan hâli ÇOK KISA.
 *
 * Bir satır = tür etiketi + başlık + ne değiştiği (tek ibare) + zaman.
 * Ayrıntı `<details>` içinde durur: JS gerekmez, klavyeyle açılır, yazdırmada
 * açık basılır. Panelin amacı "takip edilebilirlik" olduğu için varsayılan
 * görünüm satır satır taranabilir olmalı; detay isteyen açar.
 *
 * ONAYSIZ KAYIT: `is_confirmed=0` gelen dosya gelişmeleri kesin olarak
 * sunulmaz. Etiket "aynı konuda gelişme olabilir" der, satır kesik çizgiyle
 * işaretlenir. Bunu "dosya gelişti" diye sunmak kullanıcıyı yanıltmak olurdu.
 */

import Link from "next/link";

import {
  CHANGE_TYPE_ACIKLAMA,
  CHANGE_TYPE_KISA,
  CHANGE_TYPE_LABEL,
  changeAt,
  changeCekinceli,
  changeOzet,
  changeSourceName,
  changeTitle,
  changeUrl,
  normalizeChangeType,
  type ChangeItem,
} from "@/lib/api-me";
import { formatDateTime, isoDate, relativeTime } from "@/lib/format";

export function ChangeRow({ item }: { item: ChangeItem }) {
  const tur = normalizeChangeType(item.change_type);
  const cekinceli = changeCekinceli(item);
  const zaman = changeAt(item);
  const hedef = changeUrl(item);
  const kaynak = changeSourceName(item);
  const disBaglanti = Boolean(hedef && /^https?:/i.test(hedef));

  return (
    <li className="degis-satir" data-tur={tur ?? "diger"} data-cekinceli={cekinceli ? "true" : "false"}>
      <details className="degis-detay">
        <summary className="degis-ozet">
          <span className="degis-tur" aria-hidden="true">
            {tur ? CHANGE_TYPE_KISA[tur] : "Kayıt"}
          </span>
          <span className="sr-only-custom">
            {tur ? CHANGE_TYPE_LABEL[tur] : "Değişiklik"}:{" "}
          </span>
          <span className="degis-baslik">{changeTitle(item)}</span>
          <span className="degis-ne" aria-hidden="true">
            —
          </span>
          <span className="degis-ne-metin">{changeOzet(item)}</span>
          {cekinceli ? (
            <span className="degis-cekince">aynı konuda gelişme olabilir</span>
          ) : null}
          {zaman ? (
            <time className="degis-zaman" dateTime={isoDate(zaman)}>
              {relativeTime(zaman)}
            </time>
          ) : null}
        </summary>

        <div className="degis-detay-govde">
          {tur ? (
            <p className="degis-detay-satir">{CHANGE_TYPE_ACIKLAMA[tur]}</p>
          ) : null}

          {cekinceli ? (
            <p className="degis-detay-satir degis-detay-cekince">
              Bu eşleşme <strong>onaylanmadı</strong>: aynı mevzuat dosyasının
              yeni bir aşaması olabilir, ama kesin değil. Doğrulamak için
              habere bakın.
            </p>
          ) : null}

          <dl className="degis-detay-liste">
            {kaynak ? (
              <>
                <dt>Kaynak</dt>
                <dd>{kaynak}</dd>
              </>
            ) : null}
            {zaman ? (
              <>
                <dt>Kayıt zamanı</dt>
                <dd>{formatDateTime(zaman)}</dd>
              </>
            ) : null}
            {item.thread_id ? (
              <>
                <dt>Dosya</dt>
                <dd>#{item.thread_id}</dd>
              </>
            ) : null}
          </dl>

          {hedef ? (
            disBaglanti ? (
              <a
                href={hedef}
                target="_blank"
                rel="noopener noreferrer"
                className="u-kicker u-link-underline"
              >
                Kaynağa git ↗
              </a>
            ) : (
              <Link href={hedef} className="u-kicker u-link-underline">
                Habere git →
              </Link>
            )
          ) : null}
        </div>
      </details>
    </li>
  );
}

export default ChangeRow;
