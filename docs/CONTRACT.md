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

`KRITIK` (>=80) | `YUKSEK` (>=60) | `ORTA` (>=35) | `DUSUK` (<35)

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
