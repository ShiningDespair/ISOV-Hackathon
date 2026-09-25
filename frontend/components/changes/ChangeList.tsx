/**
 * DEĞİŞİKLİK LİSTESİ — gün gün gruplanmış tek satırlık kayıtlar.
 *
 * Gruplama Europe/Istanbul takvimine göre yapılır; UTC'ye göre gruplamak
 * gece yarısı sonrası kayıtları yanlış güne yazardı.
 *
 * `basligiSeviyesi`: liste artık kendi sayfasında değil, `/raporlar`
 * içindeki "Değişiklikler" modülünün İÇİNDE duruyor. Modülün başlığı `h2`
 * olduğu için gün başlıkları `h3` olmak zorunda — yoksa sayfada aynı
 * düzeyde onlarca `h2` birikir ve ekran okuyucunun başlık ağacı düzleşir.
 * Varsayılan `h2` bırakıldı ki tek başına kullanımda davranış değişmesin.
 */

import type { ChangeItem } from "@/lib/api-me";
import { changeAt } from "@/lib/api-me";
import { formatDate } from "@/lib/format";
import { istanbulGunu } from "@/components/DateRangeFilter";

import { ChangeRow } from "./ChangeRow";

/** Kaydın İstanbul takvimindeki günü ("YYYY-MM-DD"); zaman yoksa null. */
function gunuOf(item: ChangeItem): string | null {
  const t = changeAt(item);
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : istanbulGunu(d);
}

export function ChangeList({
  items,
  basligiSeviyesi = "h2",
}: {
  items: ChangeItem[];
  basligiSeviyesi?: "h2" | "h3" | "h4";
}) {
  // Gün -> kayıtlar. Map ekleme sırasını korur; liste backend'den tarihe
  // göre azalan geldiği için ek sıralama yapılmaz.
  const gruplar = new Map<string, ChangeItem[]>();
  for (const item of items) {
    const key = gunuOf(item) ?? "bilinmiyor";
    const list = gruplar.get(key) ?? [];
    list.push(item);
    gruplar.set(key, list);
  }

  const Baslik = basligiSeviyesi;

  return (
    <div className="degis-liste">
      {[...gruplar.entries()].map(([gun, kayitlar]) => (
        <section key={gun} className="degis-grup" aria-labelledby={`gun-${gun}`}>
          <Baslik id={`gun-${gun}`} className="u-kicker degis-grup-baslik">
            {gun === "bilinmiyor" ? "Tarihi belirsiz" : formatDate(gun)}
            <span className="degis-grup-sayi"> · {kayitlar.length} kayıt</span>
          </Baslik>
          <ul className="degis-satirlar">
            {kayitlar.map((item, i) => (
              <ChangeRow
                key={`${item.id ?? item.change_key ?? "k"}-${i}`}
                item={item}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default ChangeList;
