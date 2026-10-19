#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Restauration de la base Dora depuis une archive créée par backup-db.sh.
#
# Usage : ./scripts/restore-db.sh <archive.sqlite3.gz>
#   1. vérifie l'empreinte SHA-256 (fichier .sha256 si présent) ;
#   2. demande une confirmation explicite (aucune restauration silencieuse) ;
#   3. arrête l'application n'est PAS fait ici — l'opérateur doit d'abord
#      arrêter le service (systemctl stop dora) pour garantir la cohérence ;
#   4. remplace le fichier de base puis vérifie l'intégrité SQLite.
#
# Procédure complète : docs/DEPLOIEMENT-VPS.md §Restauration (à tester
# régulièrement — une restauration non répétée n'est pas fiable).
# ---------------------------------------------------------------------------

set -euo pipefail

ARCHIVE="${1:-}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "Usage : $0 <dora-db-HORODATAGE.sqlite3.gz>" >&2
  exit 1
fi

# Vérification de l'empreinte.
if [ -f "$ARCHIVE.sha256" ]; then
  EXPECTED="$(awk '{print $1}' "$ARCHIVE.sha256")"
  ACTUAL="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
  if [ "$EXPECTED" != "$ACTUAL" ]; then
    echo "✗ Empreinte SHA-256 invalide : archive corrompue. Restauration annulée." >&2
    exit 1
  fi
  echo "✓ Empreinte vérifiée."
else
  echo "⚠ Aucun fichier .sha256 trouvé à côté de l'archive — vérification impossible."
fi

echo "Cette opération remplacera la base de production actuelle."
read -r -p "Tapez « RESTAURER » pour confirmer : " CONFIRM
if [ "$CONFIRM" != "RESTAURER" ]; then
  echo "Annulé."
  exit 1
fi

# Cible.
DB_FILE=""
for candidate in "$PROJECT_DIR/db/custom.db" "$PROJECT_DIR/prisma/custom.db"; do
  if [ -f "$candidate" ]; then
    DB_FILE="$candidate"
    break
  fi
done
if [ -z "$DB_FILE" ]; then
  echo "✗ Base cible introuvable." >&2
  exit 1
fi

gunzip -c "$ARCHIVE" > "$DB_FILE.restored"

# Intégrité SQLite avant remplacement.
if command -v sqlite3 >/dev/null 2>&1; then
  RESULT="$(sqlite3 "$DB_FILE.restored" "PRAGMA integrity_check;")"
  if [ "$RESULT" != "ok" ]; then
    echo "✗ Intégrité SQLite invalide ($RESULT). Restauration annulée." >&2
    rm -f "$DB_FILE.restored"
    exit 1
  fi
fi

mv "$DB_FILE" "$DB_FILE.pre-restore-$(date +%Y%m%d-%H%M%S)"
mv "$DB_FILE.restored" "$DB_FILE"

echo "✓ Base restaurée : $DB_FILE"
echo "  1. redémarrez le service : systemctl start dora"
echo "  2. vérifiez : curl -fsS https://VOTRE-DOMAINE/api/health"
echo "  3. contrôlez le contenu attendu (profils publiés, journal d'audit)."
