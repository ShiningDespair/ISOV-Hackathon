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

# --- /api location tanimi ----------------------------------------------
# /api/* isteklerini backend'e yonlendirir; boylece tarayici tarafi
# NEXT_PUBLIC_API_BASE_URL=/api tek origin uzerinden calisir. Oturum cerezi
# de ayni origin'de kaldigi icin SameSite=Lax sorun cikarmaz.
API_LOCATION=$(jq -n '[{
  path: "/api",
  forward_scheme: "http",
  forward_host: "isov-backend",
  forward_port: 5005,
  advanced_config: "proxy_set_header X-Forwarded-Proto $scheme;"
}]')

# --- Ayni domain zaten kayitli mi? -------------------------------------
EXISTING_JSON=$(curl -fsS "${AUTH[@]}" "$NPM_URL/api/nginx/proxy-hosts" \
  | jq -c --arg d "$DOMAIN" 'map(select(.domain_names | index($d))) | .[0] // empty')

if [[ -n "$EXISTING_JSON" ]]; then
  ID=$(jq -r '.id' <<<"$EXISTING_JSON")
  echo "→ Mevcut kayit guncelleniyor (id=$ID)"

  # ------------------------------------------------------------------
  # OKU-DEGISTIR-YAZ. Bu ONEMLI: NPM'in PUT'u govdeyi TAMAMEN DEGISTIRIR,
  # birlestirmez. Onceki surum sabit bir govde gonderiyordu ve icinde
  # certificate_id:0 / ssl_forced:false vardi; bu, mevcut Let's Encrypt
  # sertifikasinin BAGLANTISINI KOPARDI ve canli site HTTPS'te
  # "unrecognized name" hatasi vermeye basladi (HTTP calismaya devam
  # ettigi icin ilk bakista fark edilmiyor).
  #
  # Artik mevcut kayit okunur, YALNIZCA locations degistirilir, SSL ve
  # diger alanlar oldugu gibi korunur.
  # ------------------------------------------------------------------
  CERT=$(jq -r '.certificate_id // 0' <<<"$EXISTING_JSON")
  BODY=$(jq -c --argjson loc "$API_LOCATION" '
    {
      domain_names, forward_scheme, forward_host, forward_port,
      access_list_id, allow_websocket_upgrade, block_exploits,
      caching_enabled, advanced_config, meta,
      certificate_id, ssl_forced, http2_support, hsts_enabled, hsts_subdomains,
      locations: $loc
    }' <<<"$EXISTING_JSON")

  curl -fsS -X PUT "${AUTH[@]}" "$NPM_URL/api/nginx/proxy-hosts/$ID" -d "$BODY" \
    | jq -r '"  ✓ guncellendi: \(.domain_names[0]) → \(.forward_host):\(.forward_port)\n    /api → isov-backend:5005\n    sertifika_id: \(.certificate_id)  ssl_forced: \(.ssl_forced)"'

  if [[ "$CERT" == "0" ]]; then
    echo "  ⚠  Bu kayitta SSL sertifikasi TANIMLI DEGIL. HTTPS calismayacak;"
    echo "     NPM arayuzunden Let's Encrypt sertifikasi ekleyin."
  fi
else
  echo "→ Yeni proxy host olusturuluyor"
  BODY=$(jq -n --arg d "$DOMAIN" --arg h "$FORWARD_HOST" --argjson p "$FORWARD_PORT" \
    --argjson loc "$API_LOCATION" '
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
      locations: $loc
    }')
  curl -fsS -X POST "${AUTH[@]}" "$NPM_URL/api/nginx/proxy-hosts" -d "$BODY" \
    | jq -r '"  ✓ olusturuldu: \(.domain_names[0]) → \(.forward_host):\(.forward_port)"'
  echo "  ⓘ Yeni kayitta SSL yok. NPM arayuzunden Let's Encrypt sertifikasi ekleyin."
fi

echo
echo "Dogrulama:"
echo "  curl -s -o /dev/null -w '%{http_code}\\n' https://$DOMAIN/api/health   # 200 beklenir"
echo "  curl -s -o /dev/null -w '%{http_code}\\n' https://$DOMAIN/api/articles  # 401 beklenir (panel kapali)"
echo
echo "NOT: HTTPS'i de kontrol edin. HTTP calisip HTTPS'in bozulmasi ilk bakista"
echo "fark edilmez; 'unrecognized name' hatasi sertifika baglantisinin kopmasi demektir."
