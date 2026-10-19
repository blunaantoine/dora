#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Sauvegarde de la base SQLite de Dora (§26.7 — sauvegardes restaurables).
#
# Usage : ./scripts/backup-db.sh [répertoire_cible]
#   - copie cohérente de la base (API .backup de SQLite, compatible WAL) ;
#   - horodatage + rotation locale (BACKUP_KEEP_DAYS, défaut 14) ;
#   - empreinte SHA-256 écrite à côté de l'archive (vérification à la
#     restauration) ;
#   - ne copie PAS les médias privés : voir scripts/backup-uploads.sh.
#
# Planification recommandée (VPS LWS, crontab de l'utilisateur applicatif) :
#   30 3 * * * /srv/valorisation/app/scripts/backup-db.sh /srv/valorisation/backups
# Puis rapatriement CHIFFRÉ (age/rclone) hors du VPS — voir
# docs/DEPLOIEMENT-VPS.md §Sauvegardes. Une sauvegarde non testée n'est pas
# une sauvegarde : la restauration doit être répétée régulièrement.
# ---------------------------------------------------------------------------

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-$PROJECT_DIR/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

DB_FILE=""
for candidate in "$PROJECT_DIR/db/custom.db" "$PROJECT_DIR/prisma/custom.db"; do
  if [ -f "$candidate" ]; then
    DB_FILE="$candidate"
    break
  fi
done
if [ -z "$DB_FILE" ]; then
  echo "✗ Base introuvable (db/custom.db ou prisma/custom.db)." >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$TARGET_DIR/dora-db-$STAMP.sqlite3"
TMP="$OUT.tmp"

# Copie cohérente via l'API .backup (gère le mode WAL proprement).
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_FILE" ".backup '$TMP'"
else
  # Repli : python3 (présent sur la plupart des VPS).
  python3 - "$DB_FILE" "$TMP" <<'PY'
import sqlite3, sys
src, dst = sys.argv[1], sys.argv[2]
with sqlite3.connect(src) as s, sqlite3.connect(dst) as d:
    s.backup(d)
PY
fi

mv "$TMP" "$OUT"
gzip -f "$OUT"

SHA_FILE="$OUT.gz.sha256"
sha256sum "$OUT.gz" | awk '{print $1"  "$2}' > "$SHA_FILE"

# Rotation locale.
find "$TARGET_DIR" -name "dora-db-*.sqlite3.gz" -type f -mtime +"$KEEP_DAYS" -delete
find "$TARGET_DIR" -name "dora-db-*.sqlite3.gz.sha256" -type f -mtime +"$KEEP_DAYS" -delete

echo "✓ Sauvegarde créée : $OUT.gz"
echo "  Empreinte : $(cat "$SHA_FILE")"
echo "  Conservation locale : $KEEP_DAYS jours."
echo "  Rappel : rapatriez l'archive CHIFFRÉE hors du VPS et testez la restauration."
