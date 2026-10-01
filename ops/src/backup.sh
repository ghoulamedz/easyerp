#!/usr/bin/env bash
#
# `pnpm --filter @easyerp/ops backup [client-id]`
#
# A logical dump per Business, taken on the host, kept beside the deployment, and
# pruned to the manifest's retention count. Custom format, so `pg_restore` can
# read it and nothing else can guess at it.
#
# This is a *backup*, not a *verified restore*. The restore drill is what proves
# the dump can be loaded back; run it, do not assume it.

set -euo pipefail

MANIFEST="${EASYERP_CLIENTS:-$(dirname "$0")/../clients.yaml}"
BACKUP_ROOT="${EASYERP_BACKUP_ROOT:-/opt/easyerp/backups}"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

client_ids() {
  # Deliberately dumb: a YAML-aware parser already lives in the TypeScript ops
  # package, and duplicating it in bash would be a second thing to keep correct.
  awk '/^[[:space:]]*-[[:space:]]+id:[[:space:]]*/ { gsub(/["'"'"']/, "", $3); print $3 }' "$MANIFEST"
}

backup_keep() {
  local id="$1"
  awk -v id="$id" '
    /^[[:space:]]*-[[:space:]]+id:/ { in_client = ($3 == id) }
    in_client && /backups_keep:/ { print $2; exit }
  ' "$MANIFEST"
}

backup_one() {
  local id="$1"
  local keep
  keep="$(backup_keep "$id")"
  keep="${keep:-30}"

  local host_project="easyerp_${id}"
  local dir="${BACKUP_ROOT}/${id}"
  local stamp target

  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  target="${dir}/${host_project}-${stamp}.dump"

  mkdir -p "$dir"
  chmod 700 "$dir"

  log "${id}: dumping ${host_project}"
  docker compose --project-name "$host_project" \
    exec -T postgres pg_dump -U easyerp -Fc --no-owner --no-privileges \
    > "${target}.partial"

  # A dump that pg_dump itself failed to write must never look like a good one.
  if [ ! -s "${target}.partial" ]; then
    rm -f "${target}.partial"
    log "${id}: FAILED — empty dump"
    return 1
  fi
  mv "${target}.partial" "$target"
  chmod 600 "$target"

  # fsync the file before it is counted as a backup anyone should rely on.
  sync

  log "${id}: wrote $(basename "$target") ($(du -h "$target" | cut -f1))"

  # Retention: newest N dumps per client, deleted oldest first.
  local stale
  stale="$(ls -1t "${dir}"/*.dump 2>/dev/null | tail -n "+$((keep + 1))" || true)"
  if [ -n "$stale" ]; then
    while IFS= read -r old; do
      log "${id}: pruning $(basename "$old")"
      rm -f "$old"
    done <<< "$stale"
  fi

  log "${id}: backup complete"
}

main() {
  local target="${1:-}"
  local ids
  if [ ! -f "$MANIFEST" ]; then
    log "no manifest at ${MANIFEST}"
    exit 1
  fi

  if [ -n "$target" ]; then
    ids="$target"
  else
    ids="$(client_ids)"
  fi

  [ -n "$ids" ] || { log "no clients in manifest"; exit 1; }

  local failed=0
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    backup_one "$id" || failed=$((failed + 1))
  done <<< "$ids"

  if [ "$failed" -gt 0 ]; then
    log "${failed} backup(s) FAILED"
    exit 1
  fi
  log "all backups complete"
}

main "$@"
