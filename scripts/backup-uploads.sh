#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Sauvegarde des médias privés de Dora (uploads-private/) (§17/§26.7).
#
# Usage : ./scripts/backup-uploads.sh [répertoire_cible]
#   - archive tar.gz horodatée des fichiers privés (EXIF déjà retirés à
#     l'upload, stockés hors du dossier public) ;
#   - empreinte SHA-256 + rotation locale (BACKUP_KEEP_DAYS, défaut 30).
#
# Rapatriement chiffré hors VPS requis — voir docs/DEPLOIEMENT-VPS.md.
# ---------------------------------------------------------------------------

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$PROJECT_DIR/uploads-private"
TARGET_DIR="${1:-$PROJECT_DIR/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"

if [ ! -d "$SRC_DIR" ]; then
  echo "✗ $SRC_DIR introuvable (aucun média téléversé ?)." >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$TARGET_DIR/dora-uploads-$STAMP.tar.gz"

tar -czf "$OUT" -C "$(dirname "$SRC_DIR")" "$(basename "$SRC_DIR")"
sha256sum "$OUT" | awk '{print $1"  "$2}' > "$OUT.sha256"

find "$TARGET_DIR" -name "dora-uploads-*.tar.gz" -type f -mtime +"$KEEP_DAYS" -delete
find "$TARGET_DIR" -name "dora-uploads-*.tar.gz.sha256" -type f -mtime +"$KEEP_DAYS" -delete

echo "✓ Archive médias créée : $OUT"
echo "  Empreinte : $(cat "$OUT.sha256")"
