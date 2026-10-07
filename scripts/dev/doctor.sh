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
if [[ -x "$DEV_ROOT/node_modules/.bin/supabase" ]]; then
  stack_json=$("$DEV_ROOT/node_modules/.bin/supabase" status --output-format json 2>/dev/null) || stack_json=''
  stack_summary=$(printf '%s' "$stack_json" | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => (input += chunk));
    process.stdin.on("end", () => {
      try {
        const s = JSON.parse(input);
        const port = s.endpoints?.["database.sql"]?.port ?? "unknown";
        console.log(`${s.runtime ?? "unknown"} ${s.readiness ?? "unknown"} ${port}`);
      } catch { process.exit(1); }
    });
  ' 2>/dev/null) || stack_summary=''
  if [[ -n "$stack_summary" ]]; then
    read -r stack_runtime stack_readiness stack_port <<< "$stack_summary"
    if [[ "$stack_readiness" == ready ]]; then
      printf 'OK   Supabase %s stack %s (database port %s)\n' "$stack_runtime" "$stack_readiness" "$stack_port"
    else
      printf 'WARN Supabase %s stack %s. For DB work, run: pnpm db start\n' "$stack_runtime" "$stack_readiness"
    fi
  else
    printf 'WARN Supabase local stack is stopped or unavailable. For DB work, run: pnpm db start\n'
  fi
fi
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  printf 'INFO container runtime reachable (only needed for --runtime docker)\n'
else
  printf 'INFO container runtime not running (not needed for the native stack)\n'
fi
exit "$status"
