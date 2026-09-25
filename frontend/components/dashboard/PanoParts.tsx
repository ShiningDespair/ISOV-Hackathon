/**
 * Panelin ortak parçaları: başlık, bilgi notu, bölüm sarmalayıcı ve
 * düzen önizleme bağlantıları.
 */

import Link from "next/link";

import { SectionRule } from "@/components/States";
import {
  LAYOUT_HINTS,
  LAYOUT_LABELS,
  PANEL_LAYOUTS,
  type PanelLayout,
  type TimeBudget,
} from "@/lib/api-panel";

/** Bilgi / uyarı satırı — kullanıcıya durumu dürüstçe söyler. */
export function PanoNotice({
  children,
  tone = "bilgi",
}: {
  children: React.ReactNode;
  tone?: "bilgi" | "uyari";
}) {
  return (
    <p className="pano-bilgi" data-ton={tone} role="status" aria-live="polite">
      {children}
    </p>
  );
}

/**
 * Bilgi notu yığını — İLK EKRANI YEMEZ.
 *
 * Notlar dürüstlük gereği duruyor (uç yayında değil / oturum yok / önizleme
 * kipi gibi ayrımlar kullanıcıya AYRI cümlelerle söylenir) ama üç not üst
 * üste ~150 piksel yiyor ve haber başlığını ilk ekranın dışına itiyordu.
 * Çözüm gizlemek DEĞİL katlamak: ilk not her zaman açık, kalanlar
 * `<details>` içinde ve sayısı özet satırında yazılı. `<details>` JS'siz
 * çalışır, klavyeyle açılır, ekran okuyucuda "N not daha" olarak duyurulur.
 */
export function PanoNotices({
  notices,
  warnFirst = false,
}: {
  notices: string[];
  /** İlk not bir uyarı mı (profil/oturum durumu) yoksa düz bilgi mi. */
  warnFirst?: boolean;
}) {
  if (notices.length === 0) return null;

  const [first, ...rest] = notices;

  return (
    <div className="pano-bilgi-yigin">
      <PanoNotice tone={warnFirst ? "uyari" : "bilgi"}>{first}</PanoNotice>

      {rest.length > 0 ? (
        <details className="akis-not-katla">
          <summary className="akis-not-ozet">
            {rest.length} not daha
          </summary>
          <div className="akis-not-govde">
            {rest.map((note, i) => (
              <PanoNotice key={i}>{note}</PanoNotice>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

/**
 * Panel başlığı — TEK SATIR.
 *
 * Eskiden üç satır basıyordu (kicker + h1 + iki cümlelik açıklama) ve
 * bunun yalnızca üçüncü satırı bilgi taşıyordu. Şimdi hepsi tek satırda,
 * orta nokta ile ayrılmış: pozisyon · düzen · "N dakika / M kalem" ·
 * kişiselleştirme durumu.
 *
 * `h1` BURADA DEĞİL: panel artık `/` sayfasının içinde yaşıyor ve o
 * sayfanın kendi `h1`i var. İki `h1` ana yer işareti (landmark) sırasını
 * bozar ve ekran okuyucuda "hangisi sayfanın adı" belirsizleşir. Başlık
 * `h2` olarak basılır.
 */
export function PanoHeader({
  layout,
  positionLabel,
  fullName,
  timeBudget,
  itemCount,
  personalized,
}: {
  layout: PanelLayout;
  positionLabel: string | null;
  fullName: string | null;
  timeBudget: TimeBudget;
  itemCount: number;
  personalized: boolean;
}) {
  const parts: string[] = [
    positionLabel ?? "Pozisyon bilgisi yok",
    `${LAYOUT_LABELS[layout]} düzeni`,
    `${timeBudget} dakika / ${itemCount} kalem`,
    personalized ? "pozisyonunuza göre sıralı" : "genel önem sırası",
  ];

  return (
    <header className="pano-header akis-header-tek">
      <h2 className="akis-header-ad" title={LAYOUT_HINTS[layout]}>
        {fullName ? `${fullName} — panelim` : "Panelim"}
      </h2>
      <p className="akis-header-satir">
        {parts.map((part, i) => (
          <span key={i}>
            {i > 0 ? (
              <span aria-hidden="true" className="akis-ayrac">
                ·
              </span>
            ) : null}
            {part}
          </span>
        ))}
      </p>
    </header>
  );
}

/** Kural çizgili bölüm — mevcut `SectionRule` yeniden kullanılıyor. */
export function PanoSection({
  title,
  right,
  children,
  id,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section className="pano-bolum" id={id} data-pano-bolum={id}>
      <SectionRule title={title} right={right} />
      {children}
    </section>
  );
}

/**
 * Düzen önizleme bağlantıları.
 *
 * Neden var: dört düzenin tamamı canlı olarak görülebilsin diye. Gerçek
 * düzen `/auth/me` içindeki `layout` alanından gelir; buradaki `?duzen=`
 * parametresi yalnızca ÖNİZLEME içindir ve kullanıcının profilini
 * DEĞİŞTİRMEZ.
 *
 * Hedef `/panelim` DEĞİL `/?akis=ozel`: panelim ayrı bir sayfa olmaktan
 * çıktı, bültenin "Bana Özel" akışı oldu. `/panelim` yalnızca eski
 * bağlantılar 404 vermesin diye yönlendirme olarak duruyor; önizleme
 * bağlantısının oraya gidip geri sıçraması gereksiz bir tur atardı.
 *
 * Vakit kademeleri BURADA YOK: sayfanın en altındaki `TimeBudgetSwitch`
 * aynı işi yapıyor ve aynı anahtarı iki kez basmak kullanıcının hangisinin
 * geçerli olduğunu sormasına yol açıyordu.
 */
export function LayoutPreview({
  active,
  timeBudget,
}: {
  active: PanelLayout;
  timeBudget: TimeBudget;
}) {
  return (
    <nav className="pano-onizleme" aria-label="Panel düzeni önizleme">
      <span className="u-kicker text-ink-faint">Düzen önizleme</span>
      <ul className="pano-onizleme-liste">
        {PANEL_LAYOUTS.map((item) => (
          <li key={item}>
            <Link
              href={`/?akis=ozel&duzen=${item}&vakit=${timeBudget}`}
              className="pano-onizleme-baglanti"
              aria-current={item === active ? "page" : undefined}
            >
              {LAYOUT_LABELS[item]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
