#!/usr/bin/env bash
set +x
set -euo pipefail

usage() { printf 'Usage: pnpm dev [--ui | --db | doctor]\n' >&2; }
if [[ $# -gt 1 ]]; then usage; exit 2; fi
mode=${1:-}
case "$mode" in
  ''|--ui|--db) ;;
  doctor) exec bash "$(dirname "$0")/doctor.sh" ;;
  *) usage; exit 2 ;;
esac

source "$(dirname "$0")/config.sh"
check_toolchain
check_portless
resolve_op

if [[ "$mode" == --db ]]; then
  /usr/bin/env -u OP_SERVICE_ACCOUNT_TOKEN "$DEV_ROOT/node_modules/.bin/tsx" "$DEV_ROOT/scripts/db/cli.ts" start
fi

bundler=--webpack
if [[ "$mode" == --ui ]]; then
  bundler=--turbopack
  printf 'UI-only mode: Turbopack does not run local Workflow SDK callbacks.\n'
fi

# op owns injection and masks child output. Only its child loses the service
# account credential; Portless and Next never need that authentication token.
exec "$OP_EXECUTABLE" run --environment "$OP_ENVIRONMENT_ID" -- \
  /usr/bin/env -u OP_SERVICE_ACCOUNT_TOKEN -u OP_CONNECT_HOST -u OP_CONNECT_TOKEN \
  bash -c '
    if [[ "${PORTLESS:-}" == 0 ]]; then
      printf "FAIL PORTLESS=0 in the injected environment is unsupported. Remove it from the 1Password Environment.\n" >&2
      exit 1
    fi
    # Next normalizes loopback rewrite URLs to localhost. Match that hostname,
    # and prefer IPv4 so the server still binds to the Portless loopback upstream.
    export NODE_OPTIONS="${NODE_OPTIONS:-} --dns-result-order=ipv4first"
    exec "$@"
  ' bash "$PORTLESS_EXECUTABLE" run "$DEV_ROOT/node_modules/.bin/next" dev "$bundler" --hostname localhost
