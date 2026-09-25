/**
 * "BUGÜN BİLMENİZ GEREKEN 3 ŞEY" — Bana Özel akışının EN ÜSTÜ.
 *
 * ÖLÇÜLEN SORUN (persona testi, mobil 390×844, beş kullanıcının üçü):
 * Bana Özel akışında ilk ekranda TEK BİR haber kartı yoktu. İlk gerçek
 * haber Kart'ta y=813–872, Görsel'de y=863 (ekran 844). Önünde masthead,
 * akış anahtarı, panel başlığı, KPI şeridi, kayan şerit, görünüm başlığı
 * ("Kart Görünümü — Bugünün Özeti") ve 7 bölge çipi duruyordu. İki
 * personanın "tek şey" cümlesi aynıydı: "kaydırmadan 3 başlık, yanında
 * tek dokunuşla WhatsApp" (genel müdür) ve "ilk ekranda 3 şey, yanında
 * senin için ne demek" (üretim mühendisi).
 *
 * KURALLAR
 * - SIRA API'NİN: kalemler kişisel sıranın ilk üçü, istemcide yeniden
 *   sıralanmaz. Çağıran (`PersonalPanel`) diziyi DİLİMLER, sıralamaz.
 * - METİN ÜRETİLMEZ: tek cümle `leadSentence` (kart görünümüyle aynı
 *   fonksiyon), paylaşım adresi `paylasimAdresleri` + `paylasilacak`
 *   (Paylaş menüsüyle aynı kurgu). Yeni özet ya da yeni mesaj metni yok.
 * - GEREKÇE UYDURULMAZ: "Neden sizin için" satırı yalnızca GERÇEK bir
 *   eşleşmeden yazılır — backend'in `matched_interests`i (yoksa istemci
 *   yedeği: haberin etiketi ∩ kullanıcının ilgi alanı), yoksa
 *   odak bölgesi, yoksa önem bandı (yalnızca KRİTİK/YÜKSEK; bu durumda
 *   etiket "Neden burada" olur, çünkü bant KİŞİSEL bir gerekçe değil).
 *   Hiçbiri yoksa satır BASILMAZ. Sektör eşleşmesi yazılmıyor: liste
 *   yanıtı haberin sektör kodlarını taşımıyor (ölçüldü: `/articles?
 *   sort=kisisel` kaleminde `sectors` alanı yok, `personal` null) ve
 *   taşımayan veriden "sektörünüz" demek uydurma olurdu.
 * - `importance_score` OKUNMAZ; bant yalnızca rozet ve metin olarak.
 *
 * PİKSEL BÜTÇESİ (390×844, varsayılan yazı boyutu). Masthead ve akış
 * anahtarı bu bloğun ÜSTÜNDE ve başka iş paketlerinin; canlıda
 * 25.09.2026'da masthead 0–156, anahtar 156–207 ölçüldü, bu turun yerel
 * kopyasında (masthead'e tazelik satırı eklenmiş, anahtar 44 px'e
 * çıkmış) 0–191 ve 191–251.
 *   blok başlığı (kicker + not tek satır, 2 px çizgi) ....  ~31 px
 *   kalem üst dolgusu ....................................  ~10 px
 *   → İLK BAŞLIK y ≈ 251 + 31 + 10 = ~292 px   (hedef < 400)
 *   kalem başına:
 *     başlık  ≤ 3 satır × 22 px (satır sınırı 3) .........  ≤ 66 px
 *     cümle   ≤ 2 satır × 20 px (satır sınırı 2) .........  ≤ 40 px
 *     gerekçe ≤ 2 satır × 17 px (satır sınırı 2) .........  ≤ 34 px
 *     eylem satırı: WhatsApp 186×44 + simgeli Paylaş/Gizle
 *       44×44, toplam ~293 px, TEK satır ..................  44 px
 *     aralıklar 3 × 6 + dolgu 20 + ayraç 1 ...............  ~39 px
 *     toplam ........................ tipik ~205, en kötü ~243 px
 *   → ÜÇÜNCÜ BAŞLIK y ≈ 282 + 2 × 205 = ~692 tipik,
 *                       282 + 2 × 243 = ~768 en kötü     (ekran 844)
 *
 * ÖLÇÜLDÜ (yerel SSR kopyası + gerçek Chromium 390×844, emre.tunc,
 * 4 düzen × 4 görünüm = 16 sayfa, hepsinde aynı): blok 251–919, kalemler
 * 208 / 203 / 226 px, başlıklar y = 292 / 500 / 703 (üçüncünün alt kenarı
 * 769), ilk ekranda 3 gerçek haber başlığı (şerit hariç), yatay taşma yok.
 * Önceki durum (canlı, aynı hesap): ilk haber y = 813, ilk ekranda 0.
 * Kalan her şey (Filtrele, notlar, panel başlığı, KPI, şerit, görünüm
 * akışı) bu bloğun ALTINDA.
 */

import Link from "next/link";
import { headers } from "next/headers";

import { ArticleActions, HidableArticle } from "@/components/ArticleActions";
import { BandBadge } from "@/components/BandBadge";
import { leadSentence } from "@/components/DigestCard";
import { FALLBACK_INTERESTS } from "@/components/onboarding/taxonomy-fallback";
import { paylasilacak, paylasimAdresleri } from "@/lib/api-me";
import { normalizeBand, normalizeRegion, regionLabel } from "@/lib/format";
import type { Article } from "@/lib/types";

/** Blokta kaç kalem — ürün cümlesi "3 şey". */
export const UCU_ADET = 3;

/** Gerekçe satırında adı yazılan ilgi alanı üst sınırı (satır 2'yi aşmasın). */
const GEREKCE_ETIKET_MAX = 2;

/** Kullanıcı profilinden gerekçe için gereken en küçük parça. */
export interface UcuProfil {
  interestTagSlugs: string[];
  regionFocus: string[];
}

export interface Gerekce {
  /** `kisisel`: profilden gelen eşleşme · `genel`: yalnızca önem bandı. */
  tur: "kisisel" | "genel";
  metin: string;
}

/**
 * İlgi alanının kullanıcıya gösterilecek adı — SLUG EKRANA BASILMAZ.
 *
 * Önce haberin kendi etiket adı (`tags[].label`): etiket sözlüğü DB'de
 * Türkçeleştirildi ("Çelik", "CBAM (Sınırda Karbon)"), yani tek doğruluk
 * kaynağı orası. `matched_interests` haberin etiketlerinde olmayan bir slug
 * getirirse kayıt sihirbazının sözlüğüne bakılır (kullanıcı ilgi alanını
 * orada o adla seçti). İkisi de yoksa `null` — adı bilinmeyen eşleşme
 * sayılır ama adı uydurulmaz.
 */
function ilgiAdi(slug: string, apiLabel: string | undefined): string | null {
  const api = apiLabel?.trim();
  if (api) return api;
  return FALLBACK_INTERESTS.find((t) => t.slug === slug)?.label ?? null;
}

/**
 * Backend'in hesapladığı eşleşme (`matched_interests`, WP2 — kişisel sıra
 * yanıtında). `types.ts` bu alanı henüz taşımıyor ve alan eski backend'de
 * hiç gelmiyor; bu yüzden tip daraltmasıyla okunur. Alan YOKSA `null`
 * (istemci yedeğine düşülür); alan VAR ama boşsa `[]` (backend "eşleşme
 * yok" dedi — istemci bunu ezmez).
 */
function sunucuEslesmesi(article: Article): string[] | null {
  const raw = (article as Article & { matched_interests?: unknown })
    .matched_interests;
  if (!Array.isArray(raw)) return null;
  return raw.filter((x): x is string => typeof x === "string" && x.trim() !== "");
}

/**
 * Haberin kullanıcıya neden gösterildiği — YALNIZCA gerçek eşleşme.
 * Eşleşme yoksa `null`: satır basılmaz, yer tutucu yazılmaz.
 */
export function gerekceOf(article: Article, profil: UcuProfil): Gerekce | null {
  // 1) İlgi alanı. ÖNCE backend'in `matched_interests`i (sıralamayı yapan
  //    taraf neyi eşleştirdiğini en iyi bilir); alan gelmediyse (bu alan
  //    yayına çıkmadan önceki backend) istemci yedeği: haberin etiketleri
  //    ∩ profildeki ilgi alanları, PROFİLİN sırasıyla.
  const etiketler = new Map<string, string | undefined>();
  for (const t of article.tags ?? []) {
    if (t?.slug) etiketler.set(t.slug, t.label);
  }
  const ortak =
    sunucuEslesmesi(article) ??
    profil.interestTagSlugs.filter((s) => etiketler.has(s));
  if (ortak.length > 0) {
    const bilinen = ortak
      .map((s) => ilgiAdi(s, etiketler.get(s)))
      .filter((ad): ad is string => ad !== null);
    const adlar = bilinen.slice(0, GEREKCE_ETIKET_MAX);
    const kalan = ortak.length - adlar.length;
    if (adlar.length === 0) {
      return { tur: "kisisel", metin: "İlgi alanlarınızdan biriyle eşleşiyor" };
    }
    return {
      tur: "kisisel",
      metin: `${ortak.length > 1 ? "İlgi alanlarınız" : "İlgi alanınız"}: ${adlar.join(", ")}${kalan > 0 ? ` ve ${kalan} alan daha` : ""}`,
    };
  }

  // 2) Odak bölgesi. KÜRESEL haber odak dışında da puan alıyor (backend
  //    personalRank.regionScore) ama bu "odak bölgeniz" demek değil;
  //    yalnızca birebir eşleşme yazılır.
  if (article.region && profil.regionFocus.length > 0) {
    const bolge = normalizeRegion(article.region);
    if (profil.regionFocus.some((r) => normalizeRegion(r) === bolge)) {
      return { tur: "kisisel", metin: `Odak bölgeniz: ${regionLabel(bolge)}` };
    }
  }

  // 3) Önem bandı — kişisel değil, korpus geneli. Bu yüzden `genel`.
  const bant = normalizeBand(article.importance_band);
  if (bant === "KRITIK") return { tur: "genel", metin: "Korpus genelinde kritik önemde" };
  if (bant === "YUKSEK") return { tur: "genel", metin: "Korpus genelinde yüksek önemde" };
  return null;
}

/**
 * Paylaşılacak bağlantı — `ShareMenu.baglantiOf` ile AYNI kural: haberin
 * kendi (kaynak) adresi; yoksa paneldeki sayfası. Sunucuda `window` yok,
 * bu yüzden köken istek başlıklarından okunur.
 */
async function baglantiOf(article: Article): Promise<string> {
  const u = article.url?.trim();
  if (u && /^https?:/i.test(u)) return u;
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (host) return `${proto}://${host}/haber/${article.id}`;
  } catch {
    /* başlık okunamadı — göreli adrese düş */
  }
  return `/haber/${article.id}`;
}

function UcuKalem({
  article,
  sira,
  gerekce,
  whatsapp,
}: {
  article: Article;
  sira: number;
  gerekce: Gerekce | null;
  whatsapp: string;
}) {
  const cumle = leadSentence(article);
  return (
    <li className="akis-uc-kalem" data-sira={sira}>
      <HidableArticle articleId={article.id}>
        <article className="akis-uc-govde">
          <h3 className="akis-uc-baslik">
            <Link href={`/haber/${article.id}`} className="akis-uc-baglanti">
              {article.title}
            </Link>
          </h3>

          {cumle ? <p className="akis-uc-cumle">{cumle}</p> : null}

          {gerekce ? (
            <p className="akis-uc-neden" data-tur={gerekce.tur}>
              <BandBadge band={article.importance_band} />
              <span>
                <strong className="akis-uc-neden-etiket">
                  {gerekce.tur === "kisisel" ? "Neden sizin için:" : "Neden burada:"}
                </strong>{" "}
                {gerekce.metin}
              </span>
            </p>
          ) : null}

          <div className="akis-uc-eylem">
            {/* Düz bağlantı: JS yüklenmeden de çalışır, tek dokunuş.
                Metin ve adres `paylasimAdresleri`nden — Paylaş menüsündeki
                "WhatsApp ile gönder" ile birebir aynı mesaj. */}
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="akis-uc-wa"
              aria-label={`“${article.title}” haberini WhatsApp'ta gönder`}
            >
              <span aria-hidden="true" className="akis-uc-wa-ikon">
                ✆
              </span>
              WhatsApp&apos;ta gönder
            </a>
            {/* `compact`: yalnızca simge (ad ekran okuyucuda kalır) — tüm
                kartlardaki Paylaş/Gizle ile aynı görünüm. Metinli sürümde
                satır 390 px'te ~381 px tutuyor ve kalemi ikinci satıra
                (+~50 px) taşıyordu; simgeli sürüm ~293 px. */}
            <ArticleActions haber={paylasilacak(article)} compact />
          </div>
        </article>
      </HidableArticle>
    </li>
  );
}

export async function BugununUcu({
  articles,
  profil,
  personalized,
}: {
  /** API sırasındaki İLK kalemler — çağıran dilimler, burada sıralanmaz. */
  articles: Article[];
  profil: UcuProfil;
  /** Liste gerçekten kişisel sırayla mı geldi (başlık yanındaki not). */
  personalized: boolean;
}) {
  const kalemler = articles.slice(0, UCU_ADET);
  if (kalemler.length === 0) return null;

  const hazir = await Promise.all(
    kalemler.map(async (a) => ({
      article: a,
      gerekce: gerekceOf(a, profil),
      whatsapp: paylasimAdresleri(paylasilacak(a), await baglantiOf(a)).whatsapp,
    })),
  );

  const baslik =
    kalemler.length === UCU_ADET
      ? "Bugün Bilmeniz Gereken 3 Şey"
      : `Bugün Bilmeniz Gereken ${kalemler.length} Şey`;

  return (
    <section className="akis-uc" aria-labelledby="akis-uc-baslik">
      <div className="akis-uc-ust">
        <h2 id="akis-uc-baslik" className="akis-uc-ust-baslik">
          {baslik}
        </h2>
        <span className="akis-uc-ust-not">
          {personalized ? "pozisyonunuza göre" : "genel önem sırası"}
        </span>
      </div>
      <ol className="akis-uc-liste">
        {hazir.map((k, i) => (
          <UcuKalem
            key={k.article.id}
            article={k.article}
            sira={i + 1}
            gerekce={k.gerekce}
            whatsapp={k.whatsapp}
          />
        ))}
      </ol>
    </section>
  );
}
