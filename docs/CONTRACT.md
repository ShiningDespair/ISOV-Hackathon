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
| `authority`    | 0.30    | Kaynak otoritesi (`sources.authority_weight`) |
| `impact`       | 0.25    | ISO/ISOV uyelerine dogrudan etki (mevzuat/tesvik/maliyet) |
| `keyword`      | 0.20    | Tetikleyici etiketlerin agirlik toplami (`tags.weight`) |
| `recency`      | 0.15    | Yayin tazeligi, 7 gunde dogrusal soner |
| `corroboration`| 0.10    | Kume uye sayisi (kac bagimsiz kaynak dogrulamis) |

`importance_factors` JSON'unda **ham bilesenler** (0..100) saklanir:
```json
{"authority":85,"impact":90,"keyword":70,"recency":95,"corroboration":40}
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
        "recency": 95, "corroboration": 30
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
| GET    | `/articles`              | Liste. Query: `region, band, category, tag, q, from, to, source, watched_only, tenant_key, page, limit, sort` |
| GET    | `/articles/:id`          | Detay + kume uyeleri + etiketler |
| GET    | `/clusters/:id`          | Kume ve tum uyeleri |
| GET    | `/tags`                  | Etiketler + kullanim sayisi |
| GET    | `/sources`               | Kaynaklar |
| GET    | `/stats/overview`        | Bolge/band/kategori dagilimlari, gunluk seri |
| GET    | `/reports`               | Rapor listesi |
| GET    | `/reports/:id`           | Rapor + icindeki haberler |
| POST   | `/reports/generate`      | Body: `{period_start, period_end, period_type}` |
| POST   | `/collect/run`           | Toplama calistir (demo: idempotent) |
| PATCH  | `/sources/:id`           | Yonetici alanlari. Body: `{authority_weight?, name?}` — `is_active` KABUL EDILMEZ |
| PUT    | `/sources/:id/watch`     | Kiraci izleme tercihi. Body: `{is_watched, tenant_key?}` |
| PUT    | `/sources/watch/bulk`    | Toplu izleme tercihi. Body: `{source_ids:number[], is_watched, tenant_key?}` |
| POST   | `/sources`               | Yeni kaynak ekle. Body: `{slug?, name, homepage_url, source_type, authority_weight?, country_code?, language?}` |
| GET    | `/source-suggestions`    | Onerilen kaynaklar. Query: `status` |
| POST   | `/source-suggestions`    | Kaynak oner. Body: `{name, url, reason?, submitted_by?, source_type?}` |
| PATCH  | `/source-suggestions/:id`| Durum degistir. Body: `{status: 'beklemede'\|'kabul'\|'red'}` |
| POST   | `/articles/fetch-images` | Eksik `image_url` alanlarini og:image ile doldurur |

`articles` yaniti yeni alan tasir: `image_url` (string \| null).
Gorsel bulunamayan haberlerde `null` doner; frontend tipografik bir
yer tutucuya duser, bos kutu gostermez.

`sources` yaniti `is_active`, `is_watched` ve `article_count` tasir.

### Kaynak izleme modeli — COK KIRACILI (iki katman)

Sistem cok kiracili dusunulmustur. **Gerekce: bir kiracinin izlemek istemedigi
kaynagi baska bir kiraci izliyor olabilir**, bu yuzden veri paylasilan ve kalicidir.

**1) Global katman — paylasilan, kalici.** `sources` tablosu ve toplama tum
kiracilar arasinda PAYLASILIR. **Toplama HICBIR ZAMAN durmaz** ve haber verisi
HICBIR KOSULDA silinmez. `sources.is_active` yalnizca YONETICI duzeyinde
"bu kaynak artik hic taranmiyor" (or. site kapandi) anlamina gelir; panel
arayuzunden degistirilmez ve `PATCH /sources/:id` govdesinden **kabul edilmez**
(gonderilirse 400 doner). Varsayilan 1 kalir.

**2) Kiraci katmani — panelde izleme.** `tenant_source_prefs
(tenant_key, source_id, is_watched)` tablosu. Tabloya yalnizca **sapmalar**
yazilir: kayit YOKSA varsayilan `is_watched = true`, yani hicbir sey secmemis
bir kiraci tum kaynaklari gorur. Izlemeyi birakmak yalnizca o kiracinin
gorunumunu degistirir; toplama devam eder, haberler veritabaninda kalir.

Kimlik dogrulama henuz yok: `tenant_key` istekten gelir (query parametresi,
govde alani veya `X-Tenant-Key` basligi), yoksa `'isov'` kullanilir. Kimlik
eklendiginde sema degismeden gercek kiraciya baglanir.

**Haber listesi:** `GET /articles` varsayilan davranisi degismez (tum haberler).
`GET /articles?watched_only=1&tenant_key=isov` yalnizca o kiracinin izledigi
kaynaklarin haberlerini dondurur. Izlenmeyen kaynagin haberleri SILINMEZ,
yalnizca bu suzgecle gizlenir.

`POST /sources` ve `POST /source-suggestions` uclari cakisma durumunda 409 doner;
govde hata zarfinin yaninda mevcut kaydi da tasir:
`{"error":{"code":"CONFLICT","message":"..."}, "data":{...}}`.

`POST /articles/fetch-images` govdesi `{limit?}` alir (HTTP yolunda ust sinir 100)
ve ozet dondurur: `{attempted, found, not_found, errors, failing_hosts, top_sources, ...}`.
Daha buyuk toplu is icin backend'de `npm run images` kullanilir.

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

## Gorunum varyantlari (4)

`<html data-view="...">` belirler. Dordu de DOM'a basilir, CSS birini gosterir.

| deger | ad | amac |
|---|---|---|
| `panel` | Panel | Filtreli, okunabilir liste (varsayilan) |
| `gazete` | Gazete | Basili gazete mizanpaji, yazdirmaya hazir |
| `gorsel` | Gorsel | Ana tasarim + haber gorselleri (thumbnail) |
| `kart` | Kart | Az metin, yalnizca konu ozetleri |

Yuvalar: `<div data-view-slot="panel|gazete|gorsel|kart">`.
Yazdirmada DAIMA `gazete` yuvasi basilir (hangi gorunum secili olursa olsun).

**Oncelik kurali (kritik):** "sec ve gorunur yap" kurallari `(0,2,1)`
ozgullukte. `@media print` kurallari AYNI ozgullukte olmak ve dosyada
DAHA SONRA gelmek zorunda; daha dusuk ozgullukte bir print kurali kaybeder
ve sayfa bos cikar. Bu hata bir kez yasandi, `frontend/app/globals.css`
icindeki yazdirma blogunun yorumuna bakin.

## Erisilebilirlik sozlesmesi

Ayarlar `<html>` uzerine yazilir; gorsel karsiliklari yalnizca
`globals.css` sonundaki ERISILEBILIRLIK blogunda tanimli.

| oznitelik / degisken | degerler |
|---|---|
| `data-a11y-font` | `varsayilan` \| `okunabilir` (Atkinson Hyperlegible) \| `disleksi` (Lexend) |
| `data-a11y-contrast` | `normal` \| `yuksek` \| `koyu` |
| `data-a11y-palette` | `normal` \| `protanopi` \| `deuteranopi` \| `tritanopi` \| `monokrom` |
| `data-a11y-underline` | `0` \| `1` |
| `data-a11y-motion` | `normal` \| `azalt` |
| `data-a11y-ruler` | `0` \| `1` |
| `data-a11y-images` | `acik` \| `gizli` |
| `--a11y-font-scale` | 0.9–1.6 |
| `--a11y-line` | 1.4–2.1 |
| `--a11y-letter` | 0–0.12em |
| `--a11y-word` | 0–0.4em |

Saklama: `localStorage` anahtari `isov:a11y` (JSON). Tek uygulama noktasi
`components/A11yProvider.tsx`; denetimler `components/A11yControls.tsx`
(widget ve /ayarlar ayni bileseni kullanir).

Gorsel gizlenebilir olsun diye her haber gorseli `data-a11y-image`
ozniteligi tasimali.

## Frontend

- Next.js 15 App Router, TypeScript, Tailwind v4.
- NYT tipografisi: baslik serif, govde serif, meta/kicker sans-serif kucuk-buyuk harf.
- **Iki gorunum**: `Panel` (varsayilan) ve `Gazete` (basili gazete mizanpaji) — ust bardaki switch.
- Renk: kagit `#F7F7F5`, metin `#121212`, kural cizgileri `#E2E2E0`, vurgu `#8B0000`.

---

# KULLANICI SISTEMI ve KISISELLESTIRME (v2)

## Kimlik dogrulama sozlesmesi

**Panel TAMAMEN KAPALI.** Oturumsuz istek korunan uclarda `401` alir.
Acik kalan tek ucler: `/api/health`, `/api/auth/*`, `/api/meta/*`.

| Method | Yol | Aciklama |
|---|---|---|
| POST | `/auth/register` | `{email, password, full_name, title?, tenant_key?}` -> 201 + oturum cerezi |
| POST | `/auth/login` | `{email, password}` -> 200 + oturum cerezi |
| POST | `/auth/logout` | Oturumu iptal eder (`sessions.revoked_at`) |
| GET | `/auth/me` | Oturum sahibi + profil + turetilmis `layout` |
| POST | `/auth/password` | `{current, next}` sifre degistir |
| POST | `/auth/password/reset-request` | `{email}` — SMTP yoksa 202 doner, kayit acilir |
| POST | `/auth/password/reset` | `{token, next}` |
| GET | `/meta/taxonomy` | Pozisyonlar, duzenler, NACE sektorleri, vakit kademeleri |

**Cerez:** `isov_session`, `httpOnly`, `sameSite=Lax`, `secure` (production),
`path=/`. Deger = 32 baytlik opak token; DB'de yalnizca `sha256` ozeti durur.

**Sifre ozeti:** `node:crypto` scrypt, biçim `scrypt$N$r$p$salt$hash`.
Yeni bagimlilik EKLENMEZ.

**Hiz siniri:** `/auth/login` ve `/auth/register` icin IP anahtarli bellek-ici
sinirlayici (tek konteyner, yeni bagimlilik gerekmez). Ayrica
`users.failed_login_count` + `locked_until` ile e-posta bazli kalici kilit.

### KRITIK — `tenantKeyOf()` guvenlik duzeltmesi

Bugun `tenantKeyOf(req)` kurum anahtarini query/body/header'dan okuyor ve
**hic dogrulama yok**. Kullanicilar var oldugu anda `?tenant_key=baskafirma`
baska bir kurumun izleme listesini okumak demektir.

Zorunlu: `tenantKeyOf()` **oturumun kurumunu TERCIH ETMEK** zorunda.
Query/baslik bicimi yalnizca `NODE_ENV !== 'production'` **veya**
`role='admin'` iken kabul edilir. Aksi halde kullanici sistemi mevcut uclari
IYILESTIRMEZ, KOTULESTIRIR.

Ayrica `articles.js` `tenantKeyOf()`'u ATLIYOR (elle okuyor) — duzeltilmeli.

## Kisiselestirme

`GET /articles` yeni parametreler: `sort=kisisel`, `include_hidden=1`.
`sort=kisisel` oturum gerektirir.

```
final = 0.62 * global_normalized + 0.38 * personal
if (importance_band === 'KRITIK') { final = max(final, global); is_pinned = 1 }
ORDER BY is_pinned DESC, final_score DESC, published_at DESC, id DESC
```

`personal` bilesenleri ve agirliklari:

| Bilesen | Agirlik | Taban | Kaynak |
|---|---|---|---|
| `position_topic` | 0.30 | 50 | `lib/positions.js` POSITION_TOPIC_WEIGHTS |
| `sector_match` | 0.22 | 35 | `lib/sectors.js` computeSectorMatch |
| `semantic` | 0.20 | 50 | Qdrant SIRA tabanli (mutlak kosinus DEGIL) |
| `interest_tags` | 0.14 | 20 | user_profiles.interest_tag_slugs |
| `region` | 0.08 | 45 | region_focus |
| `source_affinity` | 0.06 | 50 | tenant_source_prefs + okuma gecmisi |

**Hicbir bilesenin tabani 0 DEGIL.** Sebep: 0 olan bir bilesen haberi tek
basina sifirlar ve bileseni fiilen filtreye cevirir. Bu sistem siralar,
filtrelemez.

**Semantik bilesen MUTLAK KOSINUSLE HESAPLANMAZ.** Olculen makale-makale
kosinus dagilimi sikisik (medyan 0,8585, p99 0,9175); mutlak degeri 0..100'e
acmak bileseni **sabit terime** cevirir — `computeKeyword`'un ilk surumunun
dustugu tuzagin aynisi (ortalama 93,4, sifir ayirt etme gucu). Yerine
`bandCutoffs()` felsefesi: aday kumesi icindeki SIRA.
`clamp(100 - 65 * (rank / N), 35, 100)`; listede yok veya Qdrant kapali -> 50.

**KALIBRASYON ZORUNLU, ATLANAMAZ:** her bilesenin 115 tekil haber
uzerindeki standart sapmasi olculecek. **Sapmasi 8 puanin altindaki bilesen
agirliklandirilmaz, ATILIR** ve agirligi `position_topic`'e aktarilir.
Sabit bir bileseni agirliklandirmak, onu gizli bir sabit terim yapmaktir.

**Filtre balonu korumasi ve ALARMI:** her kullanicinin ilk 10'u ile global
ilk 10'un kesisimi olculur; kullanicilar arasi **medyan ortusme 3/10'un
altina duserse alarm**. Bu, kisiselestirmenin "siralama"dan "sansure"
gectiginin erken uyarisidir.

**Profil vektoru KAYIT ISTEGININ ICINDE HESAPLANMAZ:** `embed()`'in ilk
cagrisi modeli yukluyor (`EMBEDDING_LOAD_TIMEOUT_MS=300000`). Kayit
`profile_vector_status='bekliyor'` yazip doner; arka plan isi doldurur.
Qdrant'ta **ikinci koleksiyon acilmaz** — `ensureCollection()` boyut
uyusmazliginda koleksiyonu silip yeniden yaratiyor, ikinci koleksiyon bu
riski ikiye katlar. Vektor `user_profiles.profile_vector`'da durur.

## Vakit butcesi -> yogunluk

`lib/positions.js` DENSITY. Sayilar okuma suresi aritmetiginden (Turkce
~200 kelime/dk), keyfi degil:

| Vakit | Haber | Bicim |
|---|---|---|
| 2 dk | 5 | tek cumle (<=150 karakter) |
| 5 dk | 12 | 3 madde (`key_points[0..2]`) |
| 15 dk | 30 | ilk 10 tam ozet + sonraki 20 uc madde |

15 dk kademeli, cunku 30 haber x tam ozet = ~23 dk; duz "30 tam ozet"
vakit butcesi hakkinda YALAN olurdu.

Metin uretimi YOK. `firstSentence()` / `leadSentence()` yardimcilari
`frontend/components/DigestCard.tsx`'ten `frontend/lib/summary.ts`'e
tasinir (tek ev, iki cagiran) ve backend'de `lib/summarize.js` ayni
mantigi tasir — `llm.js:83` `splitSentences()` ona devreder.

`articles.summary_short` / `summary_medium` / `summary_source` kolonlari
bugun heuristik doldurulur. Anahtar geldiginde bir is bunlari uretilmis
metinle ezer, `summary_source='llm'` olur; **okuma yolu degismez**
(COALESCE ile okur, bossa anlik yardimciya duser).

## Kullanici ucları

| Method | Yol | Aciklama |
|---|---|---|
| GET/PUT | `/me/profile` | pozisyon, sektorler, ilgi alanlari, vakit, persona |
| GET/PUT | `/me/newsletter` | bulten aboneligi ve zamanlama |
| GET | `/me/changes` | son ziyaretten beri degisiklikler |
| PUT | `/me/articles/:id/hide` | `{hidden, reason, note}` — veriyi SILMEZ |
| PUT | `/me/articles/:id/read` | okundu isareti |
| PUT | `/me/articles/:id/share` | `{channel}` — paylasim kaydi |

## Degisiklik takibi

`GET /changes` — `article_changes` tablosundan. Turler: `yeni`,
`kume-buyudu`, `band-yukseldi`, `dosya-gelismesi`, `ozet-guncellendi`.

`change_key` UNIQUE + `INSERT IGNORE` ile idempotent. `UNIQUE(article_id,
change_type, thread_id)` ISE YARAMAZ: MySQL'de NULL'lar birbirinden farkli
sayilir ve `thread_id IS NULL` satirlari cogalir.

**`band-yukseldi` TUZAGI:** bant yuzdelik tabanli ve `recency` her gece her
skoru degistiriyor; naif bir "skor degisti" olayi **her gece 131 haberin
TAMAMINDA** tetiklenir. Koruma: `importance_factors`'i **recency HARIC**
karsilastir, yalnizca YUKARI yonlu degisimi kaydet.

**`clusters` dosya takibi icin YENIDEN KULLANILAMAZ.** `semanticMerge`'un
dort kosulu da bir dosya kronolojisini engelliyor: kosinus >=0,935 (taslak
ile nihai tuzuk bu kadar benzemez), FARKLI KAYNAK zorunlu (dosyanin
asamalarini genelde ayni kaynak yayinlar), <=4 gun ara (dosya aylar surer),
sayisal uyum (asamalarin rakamlari farklidir). Gevsetmek tekillestirmeyi
bozar. Ayri `topic_threads` katmani; ama MAKINE yeniden kullanilir.

**Dosyaya katilma: 3'ten 2'si.** (i) kosinus >=0,88, (ii) yuksek agirlikli
capa etiket ortakligi (jenerik capalar KARA LISTEDE: resmi-gazete,
mevzuat-degisikligi, ihracat, sanayi-uretimi), (iii) mevzuat referans kodu
ortakligi (`lib/refCodes.js`). Onaysiz dosya (`is_confirmed=0`) kullaniciya
cekinceli gosterilir, siralamada +4'ten fazla etki etmez.

## Yonetim ucları (yalnizca `role='admin'`)

| Method | Yol | Aciklama |
|---|---|---|
| GET/PUT | `/admin/settings/:key` | `smtp`, `auth`, `personalization`, `digest`, `branding` |
| POST | `/admin/settings/smtp/test` | Test e-postasi gonderir |
| GET | `/admin/users` | Kullanici listesi |
| PATCH | `/admin/users/:id` | `{role, status}` |
| POST | `/admin/users/:id/reset-link` | SMTP bozukken tek kullanimlik baglanti |
| POST | `/admin/digest/send` | Elle bulten gonderimi |
| GET | `/admin/email-log` | Gonderim kaydi |

`is_secret=1` ayarlar API yanitinda **ASLA** donmez, yalnizca
`{tanimli: true|false}`. SMTP sifresi AES-256-GCM, anahtar
`process.env.SETTINGS_SECRET`. **`SETTINGS_SECRET` yoksa sifre kaydetmeyi
REDDET** ve admine soyle — sessizce duz metin yazmak en kotu secenek.

## Ozellik durumu

`frontend/lib/feature-status.ts` TEK dogruluk kaynagi. `/durum` sayfasi onu
render eder, arayuzdeki rozetler ayni diziden okur.
**Kural: "calisiyor" demek icin `nasil` alani doldurulmus olmali** — yani
nasil dogrulandigi yazili olmali. Dogrulanmamis sey calisiyor sayilmaz.

---

# EK (v3) — VARSAYILAN GORUNUM ve VAKIT BUTCESI KADEMELERI

Bu iki madde v1/v2 metnine EKTIR; yukaridaki bolumler yeniden yazilmadi.
Celiski halinde BU BOLUM gecerlidir.

## Varsayilan gorunum — `default_view` alani ve `isov_view` cerezi

Pozisyon -> varsayilan gorunum eslemesi **TEK YERDE**:
`backend/src/lib/positions.js` -> `POSITION_VIEW`.

```
'ust-yonetim'  -> 'gorsel'
digerleri (7)  -> 'kart'
profil YOK     -> 'panel'
```

`viewOf(position)` bu eslemenin tek okuma yolu ve `layoutOf()`in esidir.
Gecerli kume `VIEWS = ['panel','gazete','gorsel','kart']`, frontend
`components/ViewProvider.tsx` -> `VIEW_MODES` ile BIREBIR AYNI.

**DB'de `default_view` KOLONU YOK ve olmayacak.** Panel duzeninde
(`layout`) uygulanan ayni ilke: kolon olsaydi pozisyonu degisen
kullanicinin gorunumu ya elle guncellenmeyi beklerdi ya da iki kaynak
(kolon + pozisyon) birbirinden kayardi.

### `/auth/me` yaniti

`GET /auth/me` govdesine **`default_view` alani EKLENDI** (alan cikarilmadi,
imza bozulmadi). Deger `viewOf(profile?.position_code ?? null)`.

`layout` ile AYNI MANTIK DEGIL, bilincli fark: `layoutOf()` profil yokken
`normalizePosition()` uzerinden `'ozet'`e duser, `viewOf()` ise `'panel'`e.
Sebep **sapma-only** ilkesi: profil satiri OLMAYAN kullaniciya "ust yonetim
secti" varsayimi yapip `'gorsel'` acmak, "hic secmedi" ile "ust yonetim
secti" ayrimini kalici olarak yok ederdi. `onboarding_required` degismedi.

`GET/PUT /me/profile` yanitindaki `profile` nesnesi de ayni kaynaktan
`default_view` dondurur; profil satiri yokken (`exists === false`) deger
`'panel'`dir.

### `isov_view` cerezi — httpOnly DEGIL

```
isov_view = 'panel' | 'gazete' | 'gorsel' | 'kart'
path=/, sameSite=lax, secure (yalnizca production), maxAge = oturum TTL
httpOnly: FALSE
```

Yazildigi noktalar (`lib/session.js` -> `setViewCookie`):

| Uc | Yazilan deger |
|---|---|
| `POST /auth/login` | `viewOf(position)` (= yanitin `default_view` alani) |
| `POST /auth/register` | `'panel'` — profil satiri ACILMAZ, dolayisiyla dogal sonuc |
| `PUT /me/profile` | yeni pozisyona gore YENIDEN yazilir |
| `POST /auth/logout` | `clearViewCookie()` ile dusurulur |
| `POST /auth/password/reset` | `clearViewCookie()` — tum oturumlar iptal edildi |

**NEDEN httpOnly DEGIL:** bu cerez oturum tasimiyor, yalnizca bir mizanpaj
tercihi. Degerin sayfa HIDRASYONDAN ONCE — `<head>` icindeki satir ici
onyukleme betiginde (`ViewProvider.VIEW_BOOTSTRAP_SCRIPT`) —
`document.cookie`'den okunabilmesi gerekiyor ki `html[data-view]` ilk
boyamada dogru olsun. httpOnly olsaydi betik degeri GOREMEZ, varsayilan
gorunum ancak React baglandiktan sonra uygulanir ve gorunur bir **mizanpaj
sicramasi** olurdu (panel cizilir, sonra karta/gorsele atlar).

**TEHDIT MODELI:** cerezin kurcalanmasinin en kotu sonucu, kullanicinin
kendi tarayicisinda YANLIS MIZANPAJ gormesidir — bir **yetki artisi
DEGIL**. Hicbir uc bu cereze bakarak yetkilendirme yapmaz, hicbir sorgu onu
filtre olarak kullanmaz. Taninmayan deger hem backend'de hem frontend'de
`'panel'`e duser. Oturum tokeni `isov_session` **httpOnly KALIR**; iki
cerezin ayri tutulmasinin sebebi tam olarak bu: biri kimlik, oburu tercih.
`clearViewCookie()` secenekleri (path/sameSite/secure/httpOnly) yazma
anindakilerle BIREBIR ayni verir, aksi halde tarayici cerezi dusurmez.

**CEREZ KULLANICININ ACIK SECIMINI EZMEZ.** Frontend oncelik sirasi:

1. `localStorage['isov:view']` — kullanicinin ACIK secimi, HER ZAMAN kazanir
2. `isov_view` cerezi — pozisyondan gelen varsayilan
3. `'panel'`

Kullanici gorunumu gorunum anahtarindan kendisi degistirmeye devam eder;
`setView()` yalnizca kullanici anahtara bastiginda calistigi icin
localStorage'in VARLIGI "acik secim yapilmis" demektir.

## Vakit butcesi kademeleri: 2 / 5 / **10** dk

Yukaridaki "Vakit butcesi -> yogunluk" tablosunun **ucuncu satiri
(15 dk / 30 haber) GECERSIZDIR**; yerine:

| Vakit | Haber | Tam ozet | Bicim |
|---|---|---|---|
| 2 dk | 5 | 0 | tek cumle (<=150 karakter) |
| 5 dk | 12 | 0 | 3 madde (`key_points[0..2]`) |
| **10 dk** | **20** | **6** | ilk 6 tam ozet + TUM maddeler, sonraki 14 uc madde |

Tek kaynak `backend/src/lib/positions.js` -> `DENSITY` ve `TIME_BUDGETS`;
aynasi `frontend/lib/api-panel.ts`.

**ARITMETIK (Turkce akici okuma ~200 kelime/dk).** Iki olcek birlikte
verilir; kademe ikisinde de 10 dakikanin ALTINDA kalmak zorunda.

**(a) Sozlesme ozet boylari (ust sinir, uretilmis/LLM ozetler icin):**
tek cumle ~20 kelime = ~6 sn; 3 madde ~54 kelime = ~16 sn; tam ozet
(~62 kelime) + ~5 madde (~90 kelime) = ~152 kelime = ~46 sn; baslik
taramasi ~2 sn/kalem.

```
10 dk kademesi:  6 x 46 sn = 276 sn   (tam ozet)
                14 x 16 sn = 224 sn   (uc madde)
                20 x  2 sn =  40 sn   (baslik taramasi)
                -------------------
                     toplam = 540 sn = 9,0 dk
```

**(b) Bugunku korpusta OLCULEN** (`GET /me/digest?time_budget=10`
yanitindaki 20 kalemin kelimeleri sayildi): tam ozetli kalem ortalama
**119,0 kelime = 35,7 sn**, maddeli kalem ortalama **33,6 kelime = 10,1 sn**.

```
6 x 35,7 + 14 x 10,1 = 355 sn  (+ 40 sn tarama)
                     = 395 sn = 6,6 dk
```

**Karsilastirma — reddedilen iki secenek, ayni iki olcekte:**

| Secenek | (a) sozlesme boyu | (b) olculen |
|---|---|---|
| eski 15 dk (30 kalem, ilk 10 tam) | 780 sn = 13,0 dk | 618 sn = 10,3 dk |
| duz "20 haber tam ozet" | 960 sn = 16,0 dk | 754 sn = 12,6 dk |
| **10 dk (20 kalem, ilk 6 tam)** | **540 sn = 9,0 dk** | **395 sn = 6,6 dk** |

Reddedilen iki secenek her iki olcekte de 10 dakikayi ASIYOR — kademe adi
icerigi hakkinda YALAN soylerdi. Bu yuzden kademe KADEMELI kaliyor.

**GERIYE UYUMLULUK — 15 -> 10 ESLEMESI ZORUNLU.**
`user_profiles.time_budget_min` **TINYINT UNSIGNED** (ENUM DEGIL, DEFAULT 5),
yani 15 hala yazilabilir bir deger ve **sema gocu GEREKMIYOR**.
`normalizeTimeBudget()` (backend `lib/positions.js`, frontend
`lib/api-panel.ts` ve `lib/types-auth.ts`) `15 -> 10` esler; gercekten
taninmayan deger (0, 7, null, `'abc'`) -> **5**. 15'i "gecersiz" sayip 5'e
dusurmek, kullanicinin EN UZUN kademe secimini neredeyse en kisaya
cevirmek olurdu.

**Sabitlenmis haber serpistirmesi:** `interleavePinned` orani
(`DEFAULT_PIN_RATIO = 5`) **DEGISMEDI** — olculerek kalibre edildi. Kalem
sayisi degistigi icin o kademedeki sabitlenmis slot sayisi olculerek
6'dan 4'e dustu (`ceil(20/5) = 4`). CONTRACT sinirlari ("en az 1", "en cok
7") korunuyor.

# EK (v4) — TUR 4 PERSONA DUZELTMELERI (WP2)

## Ilgi alani yuvasi — `lib/personalRank.js` `pickInterestSlot()`

**Olculen hata (persona testi, 2026-09-25):** Deniz (dis-ticaret, 5 dk/12
kalem; ilgi: ihracat, tarife, anti-damping, navlun, tedarik-zinciri, STA,
cbam) icin CBAM (#82) kisisel sirada **19.**, ABD Tarife 338 (#87) **18.**,
ABD anti-damping (#92) **13.** Nilgun (ust-yonetim, 2 dk/5 kalem) icin CBAM
(#82) **7.** Kullanicinin kendi sectigi konu Genel akistan daha asagida.

**Teshis:** agirlik degil TEMSIL sorunu. Ilk 12'de ilgi eslesmesi zaten
coktu (Deniz 9/12) ama hepsi GENIS "ihracat" etiketinden (korpusta 30+
haber). `interest_tags` eslesme SAYISINA bakar; tek "ihracat" = tek "cbam"
= 55 puan. #92'nin kaybi sektor bileseninden (oluklu mukavva / C13 tekstil
-> 35), #82/#87'nin kaybi global skordan (g30 / g20). `interest_tags`
agirligini artirmak genis etiketi de buyuturdu.

**Kural:** her 4 slotun SONUNCUSU (0 tabanli 3, 7, 11, 15, 19) listede
HENUZ TEMSIL EDILMEMIS acik ilgi alanlarindan en coguyla eslesen habere
ayrilir; esitlikte toplam eslesme, sonra kisisel sira. DUSUK bant ve
sessize alinan etiket giremez. Aday yoksa slot normal siraya duser.
Sabitlenmis slotla cakismada (16. slot) **sabitlenmis kazanir**.
`DEFAULT_PIN_RATIO = 5` ve sabitlenmis slotlarin yeri **DEGISMEDI**.

API (ek alanlar, `sort=kisisel` ve `/me/digest` kalemlerinde):
`interest_slot: 0|1`, `matched_interests: string[]` (kullanicinin KENDI
sectigi etiketlerden eslesenler). `meta.interest_slot_ratio = 4`.

**Olcum (5 persona + 3 gercek profil, anlamsal bilesen bugun kapali):**

| Olcu | Once | ratio 5 | **ratio 4 (secilen)** |
|---|---|---|---|
| Deniz #82 CBAM / #87 tarife / #92 | 19 / 18 / 13 | 5 / 15 / 14 | **4 / 12 / 15** |
| Deniz ilgi alani kapsama (ilk 12) | 5/7 | 6/7 | **7/7** |
| Nilgun #82 CBAM (butce 5) | 7 | 5 | **4** |
| Global ilk-10 ortusme medyani (5 persona) | 6/10 | 5/10 | **6/10** (esik >= 3) |
| Global ortusme medyani (8 kullanici) | 7,5/10 | 6,5/10 | **6,5/10** |
| Ciftler arasi ilk-10 ortusme medyani (10 cift) | 5/10 (4-6) | 4/10 | **4/10 (3-5)** |
| Sabitlenmis slot 5/12 (her kullanici) | 1/3 | 1/3 | **1/3** |
| Sabitlenmis slot 20 | 5 kullanici 4, 3 kullanici 3 | ayni | **u31: 3 -> 4, digerleri ayni** |

Ciftler arasi ortusmenin 5'ten 4'e inmesi AYRISMANIN ARTTIGI yondedir
(yuvalar kullaniciya ozel). En dusuk global ortusme Emre 3/10 (once 4/10).
20'de 3 sabitlenmis gorulen profillerde KRITIK kuyrugu kisisel sira
tarafindan tuketiliyor (hepsi zaten listede); u31'de ilgi yuvasi bir KRITIK'i
kisisel siradan geri itti, o da 16. slotta sabitlenmis olarak geldi.

## Giris hiz siniri — kurumsal NAT

`/auth/login`: iki sinirlayici, **ikisi de yalnizca BASARISIZ denemeyi
sayar** (2xx/3xx, 429 ve 5xx iade edilir; sayac istek basinda rezerve
edilir, esanli istekler siniri asamaz):

| Sinirlayici | Anahtar | Sinir |
|---|---|---|
| `loginAccountRateLimit` | IP + normalize e-posta | 15 dk'da 10 basarisiz |
| `loginIpRateLimit` | IP | 15 dk'da 200 basarisiz |

Hesap kilidi (`authService`, 5 hatali -> 15 dk) DEGISMEDI.
Kayit: IP basina 15 dk'da 60 (basarili dahil; her basari bir hesap acar).
Sifre sifirlama istegi: IP+e-posta 15 dk'da 3, IP 15 dk'da 30. Token
tuketme: IP basina 15 dk'da 10 basarisiz. (Eskiden istek ve tuketme ayni
5'lik IP kovasini paylasiyordu.)

Olcum (sahte isleyici, ayni IP): 50 dogru giris once 10x200 + 40x429,
sonra 50x200. A hesabinin 10 hatasindan sonra B'nin dogru girisi once 429,
sonra 200. 250 farkli hesaba yanlis deneme: 200x401 + 50x429. Esanli 30
yanlis istek ayni hesaba: 10 isleyiciye ulasir.

## Degisiklikler — `from` / `to`

`GET /changes` ve `GET /me/changes` `from`/`to` okur, `detected_at`
uzerinde, `/articles` ile ayni kuralla: `YYYY-MM-DD` Europe/Istanbul gun
basi; gun bazli `to` gunun TAMAMINI kapsar (`< ertesi gun 00:00`); tam
zaman damgasi aynen. Gecersiz tarih veya `from > to` -> 400. Yanit ek
alani: `range: {from, to}` (ISO, `to` kapsayici son an).
`/me/changes`: acik aralik verilince varsayilan "son ziyaretten beri"
esigi UYGULANMAZ (`since: null`, `since_source: 'aralik'`); `since` acikca
verilirse kesisim.

Olcum (korpusta 235 degisiklik, hepsi 19 Eylul 15:41-15:57):
`from=2026-09-21&to=2026-09-25` -> 0 (once 233/235); `from=to=2026-09-19`
-> 235; `to=2026-09-18` -> 0; `from=2026-09-19T15:55+03:00&to=...15:58`
-> 115.
