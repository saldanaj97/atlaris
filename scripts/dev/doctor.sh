#!/usr/bin/env bash
set +x
set -uo pipefail
source "$(dirname "$0")/config.sh"

status=0
if check_toolchain; then
  printf 'OK   Node %s\nOK   pnpm %s\nOK   project dependencies\n' "$(node --version)" "$(pnpm --version)"
else
  status=1
fi

if check_portless; then
  printf 'OK   Portless %s and project name atlaris\n' "$("$PORTLESS_EXECUTABLE" --version)"
  "$PORTLESS_EXECUTABLE" doctor
  portless_status=$?
  if [[ $portless_status -eq 0 ]]; then
    printf 'OK   Portless diagnostics (see any warnings above)\n'
  else
    status=$portless_status
    dev_error "Portless doctor exited $portless_status. Follow its remediation above; for missing CA trust, run: portless trust"
  fi
else
  status=1
fi

if resolve_op; then
  if "$OP_EXECUTABLE" whoami >/dev/null 2>&1; then
    printf 'OK   1Password authentication\n'
    if "$OP_EXECUTABLE" run --environment "$OP_ENVIRONMENT_ID" -- \
      /usr/bin/env -u OP_SERVICE_ACCOUNT_TOKEN -u OP_CONNECT_HOST -u OP_CONNECT_TOKEN \
      /bin/sh -c 'test "${PORTLESS:-}" != 0' >/dev/null 2>&1; then
      printf 'OK   1Password Environment access\n'
    else
      dev_error '1Password Environment access failed. Verify OP_ENVIRONMENT_ID, Environment permissions, and that PORTLESS=0 is not configured there.'
      status=1
    fi
  else
    dev_error '1Password authentication failed. Sign in with op signin / the desktop app, or repair your OP_EXECUTABLE service-account wrapper.'
    status=1
  fi
else
  status=1
fi

if [[ -x "$DEV_ROOT/node_modules/.bin/supabase" ]]; then
  printf 'OK   repository Supabase CLI\n'
else
  printf 'WARN Supabase CLI missing (needed for pnpm dev --db). Run: pnpm install --frozen-lockfile\n'
fi
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  printf 'OK   container runtime reachable (local DB and DB-backed tests)\n'
  if [[ -x "$DEV_ROOT/node_modules/.bin/supabase" ]] && "$DEV_ROOT/node_modules/.bin/supabase" status >/dev/null 2>&1; then
    printf 'OK   Supabase local stack running\n'
  else
    printf 'WARN Supabase local stack is stopped or unavailable. For DB work, run: pnpm db start\n'
  fi
else
  printf 'WARN container runtime unavailable. Start OrbStack/Docker for pnpm dev --db or DB-backed tests.\n'
fi
exit "$status"
