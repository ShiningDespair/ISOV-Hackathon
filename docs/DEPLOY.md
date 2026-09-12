# Yayına Alma

## 1. Ortam dosyası

```bash
cd /srv/projects/hackathon
cp .env.example .env
```

`ANTHROPIC_API_KEY` **opsiyonel**. Boş bırakılırsa özetleme deterministik
heuristikle çalışır; sistem anahtarsız da ayağa kalkar. Seed verisi zaten
özetlenmiş geldiği için demo bu anahtara ihtiyaç duymaz — anahtar yalnızca
canlı toplama (`POST /api/collect/run`) için gerekir.

## 2. Ayağa kaldırma

```bash
docker compose up -d --build
```

Sıra: `db` (healthcheck) → `qdrant` → `backend` → `frontend`.
İlk açılışta MySQL init scriptleri (`backend/db/init/*.sql`) bir kez çalışır:
şema + 98 etiketlik ağırlıklı sözlük.

## 3. Veriyi yükleme

```bash
node scripts/normalize-seed.mjs          # serbest değerleri ENUM'a eşle
node scripts/validate-seed.mjs           # sözleşmeye uygunluk (hata varsa çıkış 1)
docker compose exec backend npm run seed # yükle + tekilleştir + skorla
```

Seeder **idempotent**: iki kez çalıştırmak veriyi bozmaz, mevcut `url_hash`
kayıtlarını atlar.

Sıfırdan başlamak için:
```bash
docker compose down -v && docker compose up -d --build
```

## 4. Sağlık kontrolü

```bash
curl -s localhost:5005/api/health | jq
curl -s 'localhost:5005/api/articles?limit=3' | jq '.total, .data[0].title'
curl -s localhost:5005/api/stats/overview | jq
```

Gizli metriğin sızmadığını doğrula — ilk komut `null` dönmeli:
```bash
curl -s 'localhost:5005/api/articles?limit=1'          | jq '.data[0].importance_score'
curl -s 'localhost:5005/api/articles?limit=1&reveal=1' | jq '.data[0].importance_score'
```

## 5. Proxy kaydı

```bash
NPM_EMAIL='...' NPM_PASSWORD='...' ./scripts/npm-proxy-setup.sh
```

Betik `hackathon.dhsyazilim.com` için proxy host'u oluşturur veya günceller:

| Yol | Hedef |
|---|---|
| `/` | `isov-frontend:3000` |
| `/api` | `isov-backend:5005` |

`backend` ve `frontend` servisleri `proxy_default` ağına da bağlı olduğu için
NPM onlara konteyner adıyla erişir — port açmaya gerek yok. Host portları
(`3005`, `5005`) yalnızca `127.0.0.1`'e bağlıdır, dışarı kapalıdır.

Elle eklemek isterseniz NPM arayüzünde:
*Hosts → Proxy Hosts → Add* → Domain `hackathon.dhsyazilim.com`,
Forward `isov-frontend` : `3000`, *Custom locations* sekmesinde `/api` →
`isov-backend` : `5005`. Websockets açık.

## 6. DNS ve SSL

Cloudflare'de `hackathon.dhsyazilim.com` A kaydı sunucuya yönlendirilir.
SSL iki yoldan biriyle:
- **Cloudflare proxy (turuncu bulut) açık** → Flexible/Full, NPM'de sertifika
  gerekmez.
- **Kapalı** → NPM'de Let's Encrypt sertifikası isteyin (DNS'in yayılmış olması gerekir).

## Sorun giderme

| Belirti | Bakılacak yer |
|---|---|
| Panel "Veri kaynağına ulaşılamadı" diyor | `docker compose logs backend`, `API_BASE_URL` değeri |
| Seeder "seed dosyası yok" diyor | `./seed` mount'u: `docker compose exec backend ls /app/seed` |
| Şema yüklenmemiş | Init scriptleri yalnız boş volume'de çalışır → `docker compose down -v` |
| 502 Bad Gateway | Konteynerler `proxy_default` ağında mı: `docker network inspect proxy_default` |
| Türkçe karakterler bozuk | DB `utf8mb4`, bağlantı `charset: utf8mb4` |
