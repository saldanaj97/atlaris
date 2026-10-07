#!/usr/bin/env bash
# Installed outside the repository by scripts/dev/install-local-op.sh.
# Exports the keychain-backed service-account token for this `op` invocation only.
set +x
set -euo pipefail

OP_REAL_EXECUTABLE='__OP_REAL_EXECUTABLE__'
KEYCHAIN_SERVICE='atlaris.op-service-account'
KEYCHAIN_ACCOUNT='atlaris'

if [[ ! -x "$OP_REAL_EXECUTABLE" ]]; then
  printf 'FAIL 1Password CLI is missing at %s. Re-run scripts/dev/install-local-op.sh.\n' "$OP_REAL_EXECUTABLE" >&2
  exit 1
fi

if ! token=$(security find-generic-password -s "$KEYCHAIN_SERVICE" -a "$KEYCHAIN_ACCOUNT" -w 2>/dev/null) ||
  [[ -z "$token" ]]; then
  printf 'FAIL could not read the Atlaris 1Password service-account token from the keychain (service %s).\n' "$KEYCHAIN_SERVICE" >&2
  exit 1
fi

unset OP_CONNECT_HOST OP_CONNECT_TOKEN
export OP_SERVICE_ACCOUNT_TOKEN="$token"
exec "$OP_REAL_EXECUTABLE" "$@"
