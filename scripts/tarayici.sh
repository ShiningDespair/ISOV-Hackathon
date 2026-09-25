#!/usr/bin/env bash
# ---------------------------------------------------------------------
# Gercek tarayici senaryosu kostur (bkz. scripts/tarayici.mjs).
#
#   scripts/tarayici.sh <senaryo.json> <cikti-dizini>
#
# Betik ve senaryo backend konteynerine kopyalanir (Chromium orada), kosturulur,
# ekran goruntuleri <cikti-dizini>'ne alinir, JSON rapor stdout'a basilir.
# Ayni anda birden cok kisi kosturabilsin diye her kosu kendi alt dizinini
# kullanir.
# ---------------------------------------------------------------------
set -euo pipefail
KOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SENARYO="${1:?senaryo.json verilmedi}"
CIKTI="${2:?cikti dizini verilmedi}"
mkdir -p "$CIKTI"

KOSU="kosu-$$-$RANDOM"
cd "$KOK"
docker compose exec -T backend mkdir -p "/tmp/$KOSU" >/dev/null
docker compose cp scripts/tarayici.mjs "backend:/app/.tarayici-$KOSU.mjs"
docker compose cp "$SENARYO" "backend:/tmp/$KOSU/senaryo.json"

# Cikti dizinini kosuya ozel yap: betik /tmp/tarayici'ye yaziyor, sed ile yonlendir.
docker compose exec -T backend sed -i "s#const OUT = '/tmp/tarayici';#const OUT = '/tmp/$KOSU/png';#" "/app/.tarayici-$KOSU.mjs"

set +e
docker compose exec -T -w /app backend node "/app/.tarayici-$KOSU.mjs" "/tmp/$KOSU/senaryo.json"
KOD=$?
set -e

docker compose cp "backend:/tmp/$KOSU/png/." "$CIKTI/" 2>/dev/null || true
docker compose exec -T backend rm -rf "/tmp/$KOSU" "/app/.tarayici-$KOSU.mjs" >/dev/null 2>&1 || true
exit $KOD
