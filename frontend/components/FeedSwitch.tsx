/**
 * BANA ÖZEL / GENEL ANAHTARI — bültenin iki akışı arasında geçiş.
 *
 * Neden burada: "Panelim" ayrı bir sayfaydı, kullanıcı iki ayrı yer
 * arasında gidip gelmek zorunda kalıyordu ("Panelim kısmı ayrı bir sayfa
 * olmasın, bülten ile aynı sayfa olsun, bir yerde switch ekle"). Artık tek
 * sayfa, iki akış: `?akis=ozel` ve `?akis=genel`.
 *
 * MODEL: `akis` İÇERİĞİ ve YOĞUNLUĞU seçer, `view` (görünüm anahtarı)
 * SUNUMU seçer. İkisi birbirinden bağımsız; "Bana Özel" kart görünümünde
 * de gazete görünümünde de açılabilir.
 *
 * `Link` tabanlı, yani JavaScript olmadan da çalışır ve sunucuda
 * render edilir — hidrasyon sıçraması yok. Aktif olan `aria-current="page"`
 * ile işaretli; renk TEK BAŞINA gösterge değil (WCAG 1.4.1), aktif
 * seçenekte kalın çerçeve + ters kontrast birlikte var ve ekran okuyucu
 * için `aria-current` yazılı.
 */

import Link from "next/link";

export type FeedMode = "ozel" | "genel";

/** `?akis=` değerini güvenli biçimde daraltır. */
export function normalizeFeedMode(value: unknown): FeedMode | null {
  const text = String(value ?? "").trim();
  if (text === "ozel") return "ozel";
  if (text === "genel") return "genel";
  return null;
}

/**
 * Anahtarların KORUMASI gereken arama parametreleri.
 *
 * Neden beyaz liste (allow-list), neden "gelen her şeyi geçir" değil:
 * `searchParams` dışarıdan gelir, dizi de olabilir ve bilinmeyen anahtar
 * bağlantıya yapıştırılırsa hem URL şişer hem de yansıtılmış parametre
 * yolu açılır. Liste kısa ve bilinçli.
 */
const KEPT_PARAMS = [
  "region",
  "band",
  "tag",
  "q",
  "category",
  "source",
  "vakit",
  "akis",
  "duzen",
] as const;

/** searchParams değerini tek bir string'e indirger (dizi gelebilir). */
function one(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw !== undefined && raw.trim() !== "" ? raw : undefined;
}

/**
 * Mevcut arama parametrelerini KORUYARAK `/` üzerinde yeni bir URL üretir.
 * `overrides` içinde `undefined` verilen anahtar URL'den DÜŞER.
 */
export function feedHref(
  params: Record<string, string | string[] | undefined>,
  overrides: Partial<Record<(typeof KEPT_PARAMS)[number], string | undefined>>,
): string {
  const sp = new URLSearchParams();
  for (const key of KEPT_PARAMS) {
    const value =
      key in overrides ? overrides[key] : one(params[key]);
    if (value) sp.set(key, value);
  }
  const qs = sp.toString();
  return qs ? `/?${qs}` : "/";
}

export function FeedSwitch({
  params,
  active,
  /** Oturum yoksa anahtarın altına küçük bir giriş bağlantısı düşer. */
  showLogin = false,
}: {
  params: Record<string, string | string[] | undefined>;
  active: FeedMode;
  showLogin?: boolean;
}) {
  const items: { mode: FeedMode; label: string; hint: string }[] = [
    {
      mode: "ozel",
      label: "Bana Özel",
      hint: "Pozisyonunuza ve vakit bütçenize göre düzenlenmiş panel",
    },
    {
      mode: "genel",
      label: "Genel",
      hint: "Herkes için aynı bülten, genel önem sıralaması",
    },
  ];

  return (
    <div className="akis-anahtar-kap">
      <nav className="akis-anahtar" aria-label="Bülten akışı seçimi">
        <ul className="akis-anahtar-liste">
          {items.map((item) => (
            <li key={item.mode}>
              <Link
                href={feedHref(params, { akis: item.mode })}
                className="akis-anahtar-oge"
                aria-current={item.mode === active ? "page" : undefined}
                title={item.hint}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {showLogin ? (
        <p className="akis-anahtar-not">
          Kişiselleştirme için{" "}
          <Link href="/giris" className="u-link-underline">
            giriş yapın
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
