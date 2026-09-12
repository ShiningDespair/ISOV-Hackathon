# ISOV-Hackathon — Teknik Sozlesme (v1)

Paralel gelistirme icin ortak kontrat. **Bu dosya tek dogruluk kaynagidir.**

## Portlar (sunucuda bos oldugu dogrulandi)

| Servis     | Host portu | Container portu |
|------------|-----------|-----------------|
| frontend   | 3005      | 3000            |
| backend    | 5005      | 5005            |
| mysql      | 3312      | 3306            |
| qdrant     | 6335      | 6333            |

Docker network: `isov`. Proxy: `hackathon.dhsyazilim.com` -> `isov-frontend:3000`,
`/api/*` -> `isov-backend:5005`.

## Bolgeler (ENUM, sabit)

`KURESEL` | `TURKIYE` | `AMERIKA` | `AVRUPA` | `ASYA` | `DIGER`

## Onem bandi (ENUM, generated column)

`KRITIK` (>=78) | `YUKSEK` (>=70) | `ORTA` (>=62) | `DUSUK` (<62)

Esikler ilk korpusun gercek dagilimina gore kalibre edildi (131 haber,
skor araligi 50,8-84,9, ortalama 68,1). Ilk tahmini degerler 80/60/35
haberlerin %80'ini tek banda yigiyordu.

## Gizli onem skoru — `articles.importance_score` DECIMAL(5,2)

Agirlikli toplam, 0..100:

| Bilesen        | Agirlik | Aciklama |
|----------------|---------|----------|
| `authority`    | 0.25    | Kaynak otoritesi (`sources.authority_weight`) |
| `impact`       | 0.25    | ISO/ISOV uyelerine dogrudan etki (mevzuat/tesvik/maliyet) |
| `keyword`      | 0.20    | Tetikleyici etiketlerin agirlik toplami (`tags.weight`) |
| `recency`      | 0.15    | Yayin tazeligi, 7 gunde dogrusal soner |
| `corroboration`| 0.10    | Kume uye sayisi (kac bagimsiz kaynak dogrulamis) |
| `reach`        | 0.05    | Kaynagin erisim/olcek tahmini |

`importance_factors` JSON'unda **ham bilesenler** (0..100) saklanir:
```json
{"authority":85,"impact":90,"keyword":70,"recency":95,"corroboration":40,"reach":60}
```
Panelde ham skor gosterilmez; sadece band + siralama kullanilir.

## Seed JSON formati (`seed/*.json`)

Her toplama ajani asagidaki formatta TEK bir JSON dosyasi yazar:

```json
{
  "collector": "mevzuat",
  "collected_at": "2026-09-12T10:00:00+03:00",
  "sources": [
    {
      "slug": "resmi-gazete",
      "name": "Resmi Gazete",
      "homepage_url": "https://www.resmigazete.gov.tr",
      "source_type": "mevzuat",
      "authority_weight": 100,
      "country_code": "TR",
      "language": "tr"
    }
  ],
  "articles": [
    {
      "source_slug": "resmi-gazete",
      "url": "https://...",
      "title": "...",
      "body": "Haberin metni / ozetlenebilir govde (200-1500 kelime).",
      "published_at": "2026-09-10T08:00:00+03:00",
      "language": "tr",
      "summary": "2-4 cumlelik Turkce ozet. ISO/ISOV uyesi sanayiciye ne ifade ettigini soyler.",
      "key_points": ["Madde 1", "Madde 2", "Madde 3"],
      "entities": {"kurum": ["KOSGEB"], "kisi": [], "sektor": ["Makine"]},
      "region": "TURKIYE",
      "category": "mevzuat",
      "sentiment": "NOTR",
      "tags": ["tesvik", "kobi", "mevzuat-degisikligi"],
      "importance_factors": {
        "authority": 100, "impact": 85, "keyword": 70,
        "recency": 95, "corroboration": 30, "reach": 60
      }
    }
  ]
}
```

Kurallar:
- `source_slug` mutlaka ayni dosyanin `sources[]` listesinde tanimli olmali.
- `tags` slug formatinda, kucuk harf, tire ayrac, Turkce karakter yok (`kdv-orani`, `ar-ge-tesviki`).
- `published_at` ISO-8601, TRT (+03:00).
- `importance_score` **yazilmaz** — seeder `importance_factors`'tan hesaplar.
- `region` yukaridaki 6 degerden biri.
- `url` gercek ve benzersiz olmali (tekillestirme url_hash uzerinden calisir).

## Tekillestirme (dedup) — iki katman

### 1) Sozcuksel katman (mevcut, degismedi) — `backend/src/lib/dedup.js`
`url_hash` -> `content_hash` -> simhash hamming + baslik/govde Jaccard.
Ayni dildeki haberlerde dogru calisir. Esikler: `DEDUP_*` env degiskenleri.

### 2) Semantik katman (EK) — `backend/src/services/{embeddings,vectorStore}.js`
Sozcuksel kumeleme bittikten **sonra** calisir ve sonucunun uzerine **yazmaz**,
yalnizca yeni birlestirmeler ekler. Amaci: ayni olayi farkli dillerde anlatan
haberleri yakalamak (or. "ECB politika faizini 25 baz puan artirdi" <->
"ECB hikes rates to 2.5%"; bu iki metin ortak token paylasmadigi icin
sozcuksel katman onlari goremez).

- **Model**: `Xenova/multilingual-e5-base` (768 boyut, CPU, `@huggingface/transformers`).
  **API anahtari YOK**; model HuggingFace'ten indirilip `backend/.cache/models`
  altinda saklanir (git'e girmez, compose'da `model_cache` volume'u).
  e5 ailesi girdiye `query: ` oneki ister — `embeddings.js` bunu kendisi ekler.
- **Embedlenen metin**: `title + ". " + summary`. Ozetler sozlesme geregi hep
  Turkce, basliklar orijinal dilinde; ikisi birlikte en iyi ayrimi veriyor.
- **Vektor deposu**: Qdrant, koleksiyon `isov_articles`, mesafe `Cosine`,
  boyut modelden alinir.
- **Birlestirme kosullari (HEPSI saglanmali)**:
  1. kosinus benzerligi >= `SEMANTIC_SIMILARITY_THRESHOLD`
  2. **farkli `source_id`** — kume "kac bagimsiz kaynak dogruladi" demektir
  3. `published_at` farki <= `SEMANTIC_MAX_DAY_GAP` gun
  4. **sayisal uyum**: iki metinde de rakam varsa en az biri ortusmeli
     (binlik/ondalik ayraci ve yillar normalize edilir; taraflardan biri
     rakamsizsa bu sinir uygulanmaz)

### Esigin kalibrasyonu (tahmin degil, olcum)
131 haberlik canli veri, farkli kaynakli ve <=4 gun arali 4.840 cift:

| Olcum | Deger |
|-------|-------|
| medyan | 0,8585 |
| p90 | 0,8870 |
| p99 | 0,9175 |
| p99,5 | 0,9320 |
| p99,9 | 0,9521 |
| maks | 0,9760 |

Secilen esik bu dagilimin **~p99,5**'ine denk geliyor.

Elle etiketlenen 12 "ayni olay" grubuna gore esik taramasi
(sayisal uyum siniri acik):

| Esik | Dogru cift | Yanlis pozitif |
|------|-----------|----------------|
| 0,925 | 21 | 2 |
| 0,930 | 19 | 1 |
| **0,935** | **18** | **0** |
| 0,940 | 15 | 0 |

Secilen esik: **0,935**. Gerekcesi: yanlis pozitifi sifirlayan en dusuk esik.
0,930'da "Fransa'da sanayi uretimi" <-> "Italya'da sanayi uretimi" cifti
(0,9303) sizmaya basliyor — kullaniciya alakasiz iki haberi "ayni olay" diye
gostermek, bir kumeyi kacirmaktan daha kotu.

**Durustce not**: ayrim mutlak degil. Bilinen dogru ciftlerin bir kismi
esigin altinda kaliyor ve kaciriliyor (or. 115 "Lagarde Calls ECB Hike
'No Brainer'" <-> 116 = 0,9036; bu deger gurultunun p99'una yakin, guvenle
yakalanamiyor). Katman **recall degil precision** icin ayarlandi.

### Ayarlar ve dayaniklilik
`SEMANTIC_DEDUP_ENABLED`, `SEMANTIC_SIMILARITY_THRESHOLD`, `SEMANTIC_MAX_DAY_GAP`,
`SEMANTIC_REQUIRE_NUMERIC_AGREEMENT`, `EMBEDDING_MODEL`, `EMBEDDING_CACHE_DIR`,
`EMBEDDING_LOAD_TIMEOUT_MS`, `QDRANT_URL`, `QDRANT_COLLECTION`, `QDRANT_TIMEOUT_MS`.

> Model **veya** Qdrant erisilemezse hicbir yerde hata firlatilmaz; seeder ve
> API eskisi gibi calisir, sadece semantik kume olusmaz. Model degistirilirse
> esik **yeniden kalibre edilmelidir** (skor olcegi modele ozgudur).

## Backend API

Taban: `/api`

| Method | Yol                      | Aciklama |
|--------|--------------------------|----------|
| GET    | `/health`                | `{ok:true, db:true}` |
| GET    | `/articles`              | Liste. Query: `region, band, category, tag, q, from, to, source, page, limit, sort` |
| GET    | `/articles/:id`          | Detay + kume uyeleri + etiketler |
| GET    | `/clusters/:id`          | Kume ve tum uyeleri |
| GET    | `/tags`                  | Etiketler + kullanim sayisi |
| GET    | `/sources`               | Kaynaklar |
| GET    | `/stats/overview`        | Bolge/band/kategori dagilimlari, gunluk seri |
| GET    | `/reports`               | Rapor listesi |
| GET    | `/reports/:id`           | Rapor + icindeki haberler |
| POST   | `/reports/generate`      | Body: `{period_start, period_end, period_type}` |
| POST   | `/collect/run`           | Toplama calistir (demo: idempotent) |

Liste yaniti:
```json
{"data":[...], "page":1, "limit":20, "total":137, "totalPages":7}
```

Haber objesi (API cikti sekli):
```json
{
  "id": 1, "title": "...", "url": "...", "summary": "...",
  "key_points": [...], "entities": {...},
  "region": "TURKIYE", "category": "mevzuat", "sentiment": "NOTR",
  "importance_band": "KRITIK", "importance_score": 87.5,
  "published_at": "...", "source": {"slug":"...","name":"...","source_type":"..."},
  "tags": [{"slug":"tesvik","label":"Tesvik","kind":"konu"}],
  "cluster": {"id": 4, "member_count": 3}
}
```
> `importance_score` sadece `?reveal=1` ile doner; normalde `null`.

## Frontend

- Next.js 15 App Router, TypeScript, Tailwind v4.
- NYT tipografisi: baslik serif, govde serif, meta/kicker sans-serif kucuk-buyuk harf.
- **Iki gorunum**: `Panel` (varsayilan) ve `Gazete` (basili gazete mizanpaji) — ust bardaki switch.
- Renk: kagit `#F7F7F5`, metin `#121212`, kural cizgileri `#E2E2E0`, vurgu `#8B0000`.
