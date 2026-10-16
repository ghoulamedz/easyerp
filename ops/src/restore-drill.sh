#!/usr/bin/env bash
# Restore drill - run monthly to verify backups are valid
# Creates a temporary database, restores the latest backup with pg_restore,
# checks the Business table came back, then drops the scratch database.
#
# Same layout as backup.sh: one root (/home/easyerp/backups), uncompressed
# custom-format (-Fc) dumps. The dump is passed to pg_restore as a file
# argument (not stdin) so a missing file fails instead of restoring nothing.
# The trap guarantees the scratch database is dropped even when the drill
# fails half-way.

set -euo pipefail

BACKUP_DIR="/home/easyerp/backups"
DB_NAME="easyerp"
DB_USER="easyerp"
TEST_DB="easyerp_restore_test_$(date +%s)"

cleanup() {
  dropdb -U "${DB_USER}" --if-exists "${TEST_DB}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Find latest backup (daily rotation holds the freshest dumps)
LATEST=$(find "${BACKUP_DIR}/daily" -name "${DB_NAME}_*.dump" -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)
if [[ -z "${LATEST}" ]]; then
  echo "ERROR: No backup found in ${BACKUP_DIR}/daily"
  exit 1
fi

echo "Testing restore from: ${LATEST}"

# A scratch database. Never the live one, and dropped first so a drill that
# died half-way cannot make the next one fail for the wrong reason.
dropdb -U "${DB_USER}" --if-exists "${TEST_DB}" >/dev/null 2>&1 || true
createdb -U "${DB_USER}" "${TEST_DB}"

# Restore from the dump file (custom format needs pg_restore, not psql)
pg_restore -U "${DB_USER}" -d "${TEST_DB}" --no-owner --no-privileges "${LATEST}"

# Verify schema (run a quick query)
psql -U "${DB_USER}" -d "${TEST_DB}" -c "SELECT count(*) FROM business;" >/dev/null

echo "✅ Restore drill successful - backup is valid"
