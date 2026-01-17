#!/bin/bash
set -e

# Configuration
BACKUP_DIR="/tmp/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
S3_BUCKET=${S3_BACKUP_BUCKET:-"chapters-studio-backups"}
DB_HOST=${DB_HOST:-"localhost"}
DB_USER=${DB_USERNAME:-"postgres"}
DB_NAME=${DB_DATABASE:-"chapters_erp"}
RETENTION_DAYS=30

mkdir -p $BACKUP_DIR

echo "[$(date)] Starting backup for $DB_NAME..."

# 1. Dump Database
FILENAME="${DB_NAME}_${TIMESTAMP}.sql.gz"
PGPASSWORD="${DB_PASSWORD}" pg_dump -h "$DB_HOST" -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_DIR/$FILENAME"

echo "[$(date)] Database dumped to $BACKUP_DIR/$FILENAME (${filesize})"

# 2. Upload to S3
echo "[$(date)] Uploading to s3://$S3_BUCKET/daily/$FILENAME..."
aws s3 cp "$BACKUP_DIR/$FILENAME" "s3://$S3_BUCKET/daily/$FILENAME"

# 3. Cleanup Local
rm "$BACKUP_DIR/$FILENAME"

# 4. Cleanup Old S3 Backups (Lifecycle policy is preferred, but this is a failsafe)
# aws s3 ls "s3://$S3_BUCKET/daily/" | while read -r line; do
#   createDate=`echo $line|awk {'print $1" "$2'}`
#   createDate=`date -d"$createDate" +%s`
#   olderThan=`date -d"-$RETENTION_DAYS days" +%s`
#   if [[ $createDate -lt $olderThan ]]; then 
#     fileName=`echo $line|awk {'print $4'}`
#     if [[ $fileName != "" ]]; then
#         aws s3 rm "s3://$S3_BUCKET/daily/$fileName"
#     fi
#   fi
# done

echo "[$(date)] Backup complete."
