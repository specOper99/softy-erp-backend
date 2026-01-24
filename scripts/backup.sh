#!/bin/bash
# Database Backup Script for softY ERP
# This script creates a compressed PostgreSQL backup and optionally uploads to MinIO

set -e

# Configuration
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_FILENAME="softy_${TIMESTAMP}.sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILENAME}"

# Database config (from .env or defaults)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5434}"
DB_NAME="${DB_DATABASE:-softy}"
DB_USER="${DB_USERNAME:-softy}"
export PGPASSWORD="${DB_PASSWORD:-softy_secret}"

# MinIO config (optional)
MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://localhost:9000}"
MINIO_BUCKET="${MINIO_BUCKET:-softy}"
MINIO_BACKUP_PREFIX="backups"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "=== softY Database Backup ==="
echo "Timestamp: $TIMESTAMP"
echo "Database: $DB_NAME@$DB_HOST:$DB_PORT"

# Create backup
echo "Creating backup..."
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --no-owner --no-acl --clean --if-exists | gzip > "$BACKUP_PATH"

BACKUP_SIZE=$(du -h "$BACKUP_PATH" | cut -f1)
echo "Backup created: $BACKUP_PATH ($BACKUP_SIZE)"

# Upload to MinIO if mc (MinIO client) is available
if command -v mc &> /dev/null && [ "$UPLOAD_TO_MINIO" = "true" ]; then
    echo "Uploading to MinIO..."
    mc cp "$BACKUP_PATH" "myminio/${MINIO_BUCKET}/${MINIO_BACKUP_PREFIX}/${BACKUP_FILENAME}"
    echo "Uploaded to MinIO: ${MINIO_BUCKET}/${MINIO_BACKUP_PREFIX}/${BACKUP_FILENAME}"
fi

# Cleanup old local backups (keep last 7)
echo "Cleaning up old backups (keeping last 7)..."
ls -t "${BACKUP_DIR}"/softy_*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm -f

echo "=== Backup complete ==="
