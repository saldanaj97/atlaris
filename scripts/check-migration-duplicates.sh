#!/usr/bin/env bash
set -euo pipefail

# Checks for duplicate CREATE TYPE and CREATE TABLE definitions across SQL migration files.
# Fails with a clear message if duplicates are found.

MIG_DIR="src/lib/db/migrations"

if ! command -v rg >/dev/null 2>&1; then
  echo "ripgrep (rg) is required for this check. Please install rg." >&2
  exit 2
fi

dup_report() {
  local kind=$1 pattern=$2
  local items
  # shellcheck disable=SC2002
  items=$(rg --no-filename --pcre2 "$pattern" "$MIG_DIR"/*.sql | \
    sed -E 's/.*"([^"]+)"[^\"]*$/\1/' | \
    sort | uniq -c | awk '$1 > 1 {print $0}') || true

  if [[ -n "${items}" ]]; then
    echo "Duplicate $kind detected in migrations:" >&2
    echo "$items" >&2
    return 1
  fi
  return 0
}

failed=0

# Detect duplicate CREATE TABLE
dup_report "tables" 'CREATE\s+TABLE\s+"[^\"]+"' || failed=1

if [[ $failed -ne 0 ]]; then
  cat >&2 <<'EOF'
To prevent flaky CI and conflicting migrations, avoid defining the same TYPE or TABLE
in more than one migration. Add idempotent guards (DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$)
for CREATE TYPE, and ensure later migrations do not recreate objects defined earlier.
EOF
  exit 1
fi

echo "Migration duplicates check: OK"
