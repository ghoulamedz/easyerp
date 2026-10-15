#!/usr/bin/env bash
# Backup script for easyERP production database
# Runs before every deployment, keeps 7 daily + 4 weekly + 12 monthly

set -euo pipefail

BACKUP_DIR="/var/backups/easyerp"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
DB_NAME="easyerp"
DB_USER="easyerp"

mkdir -p "${BACKUP_DIR}/daily"
mkdir -p "${BACKUP_DIR}/weekly"
mkdir -p "${BACKUP_DIR}/monthly"

# Daily backup (compressed, custom format for parallel restore)
pg_dump -U "${DB_USER}" -d "${DB_NAME}" --no-owner --no-privileges -Fc | \
  gzip > "${BACKUP_DIR}/daily/${DB_NAME}_${DATE}.dump.gz"

# Keep 7 daily
find "${BACKUP_DIR}/daily" -name "${DB_NAME}_*.dump.gz" -mtime +7 -delete

# Weekly backup (on Sundays)
if [[ $(date +%u) -eq 7 ]]; then
  cp "${BACKUP_DIR}/daily/${DB_NAME}_${DATE}.dump.gz" "${BACKUP_DIR}/weekly/${DB_NAME}_week_$(date +%V)_${DATE}.dump.gz"
  find "${BACKUP_DIR}/weekly" -name "${DB_NAME}_week_*.dump.gz" -mtime +28 -delete
fi

# Monthly backup (1st of month)
if [[ $(date +%d) -eq 01 ]]; then
  cp "${BACKUP_DIR}/daily/${DB_NAME}_${DATE}.dump.gz" "${BACKUP_DIR}/monthly/${DB_NAME}_month_$(date +%m)_${DATE}.dump.gz"
  find "${BACKUP_DIR}/monthly" -name "${DB_NAME}_month_*.dump.gz" -mtime +365 -delete
fi

echo "Backup completed: ${BACKUP_DIR}/daily/${DB_NAME}_${DATE}.dump.gz"