#!/usr/bin/env bash
# =====================================================================
# hackathon.dhsyazilim.com -> isov-frontend:3000  proxy kaydini
# Nginx Proxy Manager API'si uzerinden olusturur/gunceller.
#
# Kullanim:
#   NPM_EMAIL=... NPM_PASSWORD=... ./scripts/npm-proxy-setup.sh
#
# Not: Cloudflare DNS kaydi bu betigin kapsami disinda (kullanici halleder).
# =====================================================================
set -euo pipefail

NPM_URL="${NPM_URL:-http://127.0.0.1:81}"
DOMAIN="${DOMAIN:-hackathon.dhsyazilim.com}"
FORWARD_HOST="${FORWARD_HOST:-isov-frontend}"
FORWARD_PORT="${FORWARD_PORT:-3000}"

if [[ -z "${NPM_EMAIL:-}" || -z "${NPM_PASSWORD:-}" ]]; then
  echo "HATA: NPM_EMAIL ve NPM_PASSWORD ortam degiskenleri gerekli." >&2
  echo "Ornek: NPM_EMAIL=admin@example.com NPM_PASSWORD=... $0" >&2
  exit 1
fi

need() { command -v "$1" >/dev/null || { echo "HATA: $1 kurulu degil." >&2; exit 1; }; }
need curl; need jq

echo "→ NPM'e giris yapiliyor ($NPM_URL)"
TOKEN=$(curl -fsS -X POST "$NPM_URL/api/tokens" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg i "$NPM_EMAIL" --arg s "$NPM_PASSWORD" '{identity:$i,secret:$s}')" \
  | jq -r '.token')

[[ -n "$TOKEN" && "$TOKEN" != "null" ]] || { echo "HATA: token alinamadi (kimlik bilgileri?)" >&2; exit 1; }
echo "  token alindi"

AUTH=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')

# --- Proxy host govdesi -------------------------------------------------
# /api/* isteklerini backend'e yonlendiren ozel location da eklenir; boylece
# tarayici tarafi NEXT_PUBLIC_API_BASE_URL=/api tek origin uzerinden calisir.
BODY=$(jq -n \
  --arg d "$DOMAIN" --arg h "$FORWARD_HOST" --argjson p "$FORWARD_PORT" '
  {
    domain_names: [$d],
    forward_scheme: "http",
    forward_host: $h,
    forward_port: $p,
    access_list_id: 0,
    certificate_id: 0,
    ssl_forced: false,
    http2_support: true,
    block_exploits: true,
    caching_enabled: false,
    allow_websocket_upgrade: true,
    advanced_config: "",
    meta: { letsencrypt_agree: false, dns_challenge: false },
    locations: [
      {
        path: "/api",
        forward_scheme: "http",
        forward_host: "isov-backend",
        forward_port: 5005,
        advanced_config: "proxy_set_header X-Forwarded-Proto $scheme;"
      }
    ]
  }')

# --- Ayni domain zaten kayitli mi? -------------------------------------
EXISTING=$(curl -fsS "${AUTH[@]}" "$NPM_URL/api/nginx/proxy-hosts" \
  | jq -r --arg d "$DOMAIN" '.[] | select(.domain_names | index($d)) | .id' | head -1)

if [[ -n "$EXISTING" ]]; then
  echo "→ Mevcut kayit guncelleniyor (id=$EXISTING)"
  curl -fsS -X PUT "${AUTH[@]}" "$NPM_URL/api/nginx/proxy-hosts/$EXISTING" -d "$BODY" \
    | jq -r '"  ✓ guncellendi: \(.domain_names[0]) → \(.forward_host):\(.forward_port)"'
else
  echo "→ Yeni proxy host olusturuluyor"
  curl -fsS -X POST "${AUTH[@]}" "$NPM_URL/api/nginx/proxy-hosts" -d "$BODY" \
    | jq -r '"  ✓ olusturuldu: \(.domain_names[0]) → \(.forward_host):\(.forward_port)"'
fi

echo
echo "Tamam. Kalan adim: Cloudflare'de $DOMAIN A kaydi bu sunucuya yonlendirilmeli."
echo "SSL sertifikasi NPM arayuzunden (Let's Encrypt) veya Cloudflare Origin Cert ile eklenebilir."
