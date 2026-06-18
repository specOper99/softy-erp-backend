#!/bin/bash
# Database Restore Script for softY ERP
# Restores a compressed PostgreSQL backup created by backup.sh
#
# Usage:
#   ./scripts/restore.sh <backup-file.sql.gz>
#   ./scripts/restore.sh --from-minio <filename>   # requires mc alias "myminio"
#
# WARNING: This overwrites data in the target database.

set -euo pipefail

BACKUP_FILE=""
FROM_MINIO=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-minio)
      FROM_MINIO="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 <backup-file.sql.gz>"
      echo "       $0 --from-minio <filename-in-minio>"
      exit 0
      ;;
    *)
      BACKUP_FILE="$1"
      shift
      ;;
  esac
done

# Database config (from .env or defaults — same as backup.sh)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5434}"
DB_NAME="${DB_DATABASE:-softy}"
DB_USER="${DB_USERNAME:-softy}"
export PGPASSWORD="${DB_PASSWORD:-softy_secret}"

MINIO_BUCKET="${MINIO_BUCKET:-softy}"
MINIO_BACKUP_PREFIX="backups"
RESTORE_DIR="${RESTORE_DIR:-./backups}"

if [ -n "$FROM_MINIO" ]; then
  if ! command -v mc &> /dev/null; then
    echo "ERROR: MinIO client (mc) required for --from-minio" >&2
    exit 1
  fi
  mkdir -p "$RESTORE_DIR"
  BACKUP_FILE="${RESTORE_DIR}/${FROM_MINIO}"
  echo "Downloading from MinIO: ${MINIO_BUCKET}/${MINIO_BACKUP_PREFIX}/${FROM_MINIO}"
  mc cp "myminio/${MINIO_BUCKET}/${MINIO_BACKUP_PREFIX}/${FROM_MINIO}" "$BACKUP_FILE"
fi

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found." >&2
  echo "Usage: $0 <backup-file.sql.gz>" >&2
  exit 1
fi

echo "=== softY Database Restore ==="
echo "Target: $DB_NAME@$DB_HOST:$DB_PORT"
echo "Source: $BACKUP_FILE"
echo ""
echo "WARNING: This will DROP and recreate objects in the target database."
read -r -p "Type the database name to confirm: " CONFIRM
if [ "$CONFIRM" != "$DB_NAME" ]; then
  echo "Aborted."
  exit 1
fi

echo "Restoring..."
gunzip -c "$BACKUP_FILE" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1

echo "=== Restore complete ==="
echo "Verify: psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c 'SELECT COUNT(*) FROM migrations;'"
