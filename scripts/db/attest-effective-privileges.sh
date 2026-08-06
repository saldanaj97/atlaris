#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if (( $# > 1 )); then
  printf 'Usage: %s [expand|contract].\n' "$0" >&2
  exit 1
fi

if (( $# == 0 )); then
  ATTESTATION_PHASE='contract'
else
  ATTESTATION_PHASE="$1"
fi
readonly ATTESTATION_PHASE

case "$ATTESTATION_PHASE" in
  expand|contract)
    ;;
  *)
    printf 'Attestation phase must be expand or contract.\n' >&2
    exit 1
    ;;
esac

ATTESTATION_SQL_FILE="$(mktemp)"
readonly ATTESTATION_SQL_FILE
trap 'rm -f -- "$ATTESTATION_SQL_FILE"' EXIT

{
  printf "SELECT set_config('app.atlaris_migration_phase', '%s', false);\n" \
    "$ATTESTATION_PHASE"
  cat "$SCRIPT_DIR/attest-effective-privileges.sql"
} >"$ATTESTATION_SQL_FILE"

supabase db query --linked --file "$ATTESTATION_SQL_FILE"
