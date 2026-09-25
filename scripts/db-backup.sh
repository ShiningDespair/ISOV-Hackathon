#!/usr/bin/env bash
# ---------------------------------------------------------------------
# Veritabani yedegi al / geri yukle.
#
# Neden gerekli: sistemde artik kullanici hesabi, sifre ozeti ve oturum
# kaydi var. Seed verisi yeniden uretilebilir, kullanici verisi URETILEMEZ.
#
# Yedek dosyasi sifre ozetleri icerdigi icin depoya GIRMEZ (.gitignore).
#
# Kullanim:
#   scripts/db-backup.sh                      # yedek al
#   scripts/db-backup.sh restore <dosya.gz>   # geri yukle (ONAY ISTER)
# ---------------------------------------------------------------------
set -euo pipefail

KOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$KOK"

# shellcheck disable=SC1091
set -a; . ./.env; set +a

YEDEK_DIZIN="$KOK/backups"
mkdir -p "$YEDEK_DIZIN"

al() {
  local dosya="$YEDEK_DIZIN/isov-$(date +%Y%m%d-%H%M).sql.gz"
  docker compose exec -T db mysqldump \
    -u root -p"$DB_ROOT_PASSWORD" \
    --single-transaction --routines --triggers \
    --default-character-set=utf8mb4 \
    "$DB_NAME" 2>/dev/null | gzip > "$dosya"

  # Bos ya da yarim yedek sessizce kabul edilmez: tablo sayisini dogrula.
  local tablo
  tablo="$(zcat "$dosya" | grep -c 'CREATE TABLE' || true)"
  if [ "$tablo" -lt 20 ]; then
    echo "HATA: yedekte yalnizca $tablo tablo var, beklenen en az 20. Dosya silindi." >&2
    rm -f "$dosya"
    exit 1
  fi

  echo "Yedek alindi: $dosya"
  echo "  tablo: $tablo   boyut: $(du -h "$dosya" | cut -f1)"

  # Son 14 yedegi tut, oncesini sil.
  ls -1t "$YEDEK_DIZIN"/isov-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
}

geri_yukle() {
  local dosya="${1:?geri yuklenecek dosya verilmedi}"
  [ -f "$dosya" ] || { echo "HATA: dosya yok: $dosya" >&2; exit 1; }

  echo "DIKKAT: '$DB_NAME' veritabaninin MEVCUT icerigi bu yedekle DEGISTIRILECEK."
  echo "Dosya: $dosya"
  read -r -p "Devam etmek icin 'evet' yazin: " onay
  [ "$onay" = "evet" ] || { echo "Iptal edildi."; exit 1; }

  zcat "$dosya" | docker compose exec -T db mysql \
    -u root -p"$DB_ROOT_PASSWORD" --default-character-set=utf8mb4 "$DB_NAME" 2>/dev/null
  echo "Geri yuklendi."
}

case "${1:-al}" in
  al|"")   al ;;
  restore) shift; geri_yukle "$@" ;;
  *)       echo "Kullanim: $0 [al|restore <dosya.gz>]" >&2; exit 1 ;;
esac
