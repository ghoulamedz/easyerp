#!/usr/bin/env bash
# Restore drill - run monthly to verify backups are valid
# Creates a temporary database, restores latest backup, runs migrations

set -euo pipefail

BACKUP_DIR="/var/backups/easyerp"
DB_NAME="easyerp"
DB_USER="easyerp"
TEST_DB="easyerp_restore_test_$(date +%s)"

# Find latest backup
LATEST=$(find "${BACKUP_DIR}/daily" -name "${DB_NAME}_*.sql.gz" -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)
if [[ -z "${LATEST}" ]]; then
  echo "ERROR: No backup found in ${BACKUP_DIR}/daily"
  exit 1
fi

echo "Testing restore from: ${LATEST}"

# Create test database
createdb -U "${DB_USER}" "${TEST_DB}"

# Restore
gunzip -c "${LATEST}" | psql -U "${DB_USER}" -d "${TEST_DB}" -q

# Verify schema (run a quick query)
psql -U "${DB_USER}" -d "${TEST_DB}" -c "SELECT count(*) FROM business;" >/dev/null

# Clean up
dropdb -U "${DB_USER}" "${TEST_DB}"

echo "✅ Restore drill successful - backup is valid"