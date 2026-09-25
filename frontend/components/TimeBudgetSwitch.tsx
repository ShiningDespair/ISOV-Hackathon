/**
 * VAKİT BÜTÇESİ ANAHTARI — 2 dk / 5 dk / 10 dk.
 *
 * Kullanıcının isteği birebir: "en altta yine aynı seçenekler olsun 2 5 10
 * dk". Bu yüzden sayfanın EN ALTINDA duruyor ve HER İKİ akışta (bana
 * özel / genel) görünüyor: okumayı bitiren kişi "bu bana az/çok geldi"
 * dediği anda seçeneği elinin altında bulur.
 *
 * Sayılar ELLE YAZILMAZ, `DENSITY`den okunur. Aynı sayıyı iki yerde yazmak
 * (metinde 30, kodda 20) kullanıcıya yalan söylemenin en kolay yoluydu.
 *
 * `Link` tabanlı — JavaScript olmadan çalışır. Aktif kademe
 * `aria-current="page"` ile işaretli, renk tek başına gösterge değil.
 */

import Link from "next/link";

import { densityOf, TIME_BUDGETS, type TimeBudget } from "@/lib/api-panel";

import { feedHref, type FeedMode } from "./FeedSwitch";

/** Kademenin ne demek olduğunu DENSITY'den türeten tek satır. */
export function budgetSentence(budget: TimeBudget): string {
  const d = densityOf(budget);
  if (d.full > 0) {
    return `${budget} dk: ${d.items} haber, ilk ${d.full}'sı tam özet, gerisi ${d.bullets} madde`;
  }
  if (d.bullets > 0) {
    return `${budget} dk: ${d.items} haber, her biri ${d.bullets} madde`;
  }
  return `${budget} dk: ${d.items} haber, her biri tek cümle`;
}

export function TimeBudgetSwitch({
  params,
  active,
  feed,
}: {
  params: Record<string, string | string[] | undefined>;
  /**
   * Etkin kademe. `null` = HİÇBİRİ etkin değil: genel akışta `?vakit=`
   * verilmemişse liste bugünkü davranışını (60 haber) korur ve bir kademeyi
   * "seçili" göstermek kullanıcıya yalan söylemek olurdu.
   */
  active: TimeBudget | null;
  /** Hangi akışta olduğumuz — açıklama cümlesi buna göre değişir. */
  feed: FeedMode;
}) {
  return (
    <section className="akis-vakit" aria-labelledby="akis-vakit-baslik">
      <h2 id="akis-vakit-baslik" className="akis-vakit-baslik">
        Ne kadar vaktiniz var?
      </h2>

      <nav aria-label="Vakit bütçesi seçimi">
        <ul className="akis-vakit-liste">
          {TIME_BUDGETS.map((dk) => (
            <li key={dk}>
              <Link
                href={feedHref(params, { vakit: String(dk) })}
                className="akis-vakit-oge"
                aria-current={dk === active ? "page" : undefined}
                title={budgetSentence(dk)}
              >
                {dk} dk
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="akis-vakit-aciklama">
        {active === null
          ? "Kademe seçilmedi: genel bülten bugünkü tam listesini gösteriyor."
          : budgetSentence(active)}
        {feed === "genel" ? (
          <>
            {" "}
            Genel akış gazete karakterini koruduğu için kalem sayısını bu
            sayının üç katıyla sınırlar.
          </>
        ) : null}
      </p>
    </section>
  );
}
