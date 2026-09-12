# İSO · İSOV — Dış Kaynak İzleme ve Özet Botu

İstanbul Sanayi Odası, İstanbul Sanayi Odası Vakfı ve üye kurum/kuruluşlar için
açık kaynakları tarayan, haberleri **tekilleştiren**, **özetleyen**, **etiketleyen**
ve **gizli bir önem metriğine göre önceliklendiren** izleme platformu.

## Ne yapar

1. **Toplar** — mevzuat siteleri (Resmî Gazete, mevzuat.gov.tr), kurum duyuruları
   (KOSGEB, TÜBİTAK, bakanlıklar, Eximbank), açık veri portalları (TÜİK, TCMB),
   uluslararası kaynaklar (AB Resmî Gazetesi, WTO, IMF, OECD, IEA, USTR) ve
   sanayi/ekonomi basını.
2. **Tekilleştirir** — aynı olayı anlatan haberler tek bir *kümede* toplanır.
   URL normalizasyonu → içerik hash'i → 64-bit simhash Hamming mesafesi →
   başlık Jaccard benzerliği. Kümenin en yetkili kaynağı *temsilci* olur,
   diğerleri "bu haberi doğrulayan N kaynak" olarak görünür.
3. **Özetler ve etiketler** — her haber için Türkçe özet, anahtar maddeler,
   varlıklar (kurum/kişi/sektör), kategori ve duygu. LLM anahtarı yoksa
   deterministik heuristik ile çalışmaya devam eder.
4. **Önceliklendirir** — gizli önem skoru (aşağıda).
5. **Bölgelendirir** — `KÜRESEL · TÜRKİYE · AMERİKA · AVRUPA · ASYA · DİĞER`
6. **Raporlar** — dönemsel bülten (günlük/haftalık) + yönetici özeti.

## Gizli önem metriği

`articles.importance_score` — 0..100 arası `DECIMAL(5,2)`. **Panelde ham değer
gösterilmez**; API yalnızca `?reveal=1` ile döndürür. Kullanıcı yalnızca bandı görür.

| Bileşen | Ağırlık | Ne ölçer |
|---|---|---|
| `authority` | 0.25 | Kaynağın yetkisi (Resmî Gazete 100 ↔ sektörel blog 40) |
| `impact` | 0.25 | Üye sanayiciye doğrudan maliyet/yükümlülük etkisi |
| `keyword` | 0.20 | Tetikleyici etiketlerin ağırlık toplamı |
| `recency` | 0.15 | Tazelik — 7 günde sönümlenir |
| `corroboration` | 0.10 | Kaç bağımsız kaynak doğrulamış (küme büyüklüğü) |
| `reach` | 0.05 | Kaynağın erişim ölçeği |

Bileşenlerin ham hâli `importance_factors` JSON kolonunda saklanır — skor her
zaman **açıklanabilir**. Bant, `importance_band` generated column'u ile üretilir:
`KRİTİK ≥80 · YÜKSEK ≥60 · ORTA ≥35 · DÜŞÜK <35`.

## Mimari

```
                   ┌──────────────────────┐
  açık kaynaklar → │  toplayıcılar        │
                   └──────────┬───────────┘
                              ↓
        ┌─────────────────────────────────────────┐
        │  tekilleştirme  (url → hash → simhash)  │
        │  özetleme + etiketleme  (Claude / heur) │
        │  önem skorlama  (6 bileşenli)           │
        └──────────────────┬──────────────────────┘
                           ↓
              MySQL 8  ◄──►  Qdrant (semantik katman)
                           ↓
                  Express.js REST API  :5005
                           ↓
                   Next.js 15 panel    :3000
                           ↓
            Nginx Proxy Manager → hackathon.dhsyazilim.com
```

## Teknoloji

Next.js 15 (App Router, TS, Tailwind v4) · Express.js · MySQL 8 · Qdrant ·
Docker Compose · Nginx Proxy Manager

## Arayüz

New York Times tipografi ve mizanpaj prensipleri: serif manşetler, sans-serif
kicker'lar, ince kural çizgileri, minimal renk. İki görünüm arasında geçiş yapan
bir switch var:

- **Panel** — filtreli, okunabilir, modern liste görünümü
- **Gazete** — basılı gazete mizanpajı: çok kolonlu akan metin, damla harf,
  sütun ayraçları, yazdırılabilir (`@media print`)

## Kurulum

```bash
cp .env.example .env      # gerekirse ANTHROPIC_API_KEY ekleyin (opsiyonel)
docker compose up -d --build
docker compose exec backend npm run seed
```

Panel: http://localhost:3005 · API: http://localhost:5005/api/health

| Servis | Host portu |
|---|---|
| frontend | 3005 |
| backend | 5005 |
| mysql | 3312 |
| qdrant | 6335 |

## Veri stratejisi (demo)

Sunum için ilk veri seti paralel toplama ajanlarıyla **5–12 Eylül 2026**
penceresinden derlendi. Toplayıcılara kasıtlı örtüşme verildi — aynı büyük
olay hem Türk basınından hem uluslararası kaynaklardan toplandı — böylece
tekilleştirme motoru demoda gerçek kümeler üretiyor, boş çalışmıyor.

Seed dosyaları `seed/*.json` altında, format `docs/CONTRACT.md`'de tanımlı.

## Dokümantasyon

- [`docs/CONTRACT.md`](docs/CONTRACT.md) — API sözleşmesi, seed formatı, port haritası
