#!/usr/bin/env bash
# Shared local configuration and checks for start.sh and doctor.sh.
# Never trace credential-bearing commands, even when invoked with bash -x.
set +x

DEV_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$DEV_ROOT"
if [[ -f "$DEV_ROOT/.dev-env.local.sh" ]]; then
  source "$DEV_ROOT/.dev-env.local.sh"
fi
unset OP_CONNECT_HOST OP_CONNECT_TOKEN

dev_error() { printf 'FAIL %s\n' "$*" >&2; }

check_toolchain() {
  local version
  version=$(node --version 2>/dev/null) && [[ "$version" == v24.* ]] || {
    dev_error 'Node 24 is required (>=24 <25). Install Node 24, then pnpm install.'
    return 1
  }
  version=$(pnpm --version 2>/dev/null) && [[ "$version" == 11.* ]] || {
    dev_error 'pnpm 11 is required (>=11 <12). Install pnpm 11.9.0.'
    return 1
  }
  local binary
  for binary in next tsx; do
    if [[ ! -x "$DEV_ROOT/node_modules/.bin/$binary" ]]; then
      dev_error "Missing project dependencies ($binary). Run: pnpm install --frozen-lockfile"
      return 1
    fi
  done
}

check_portless() {
  if [[ "${PORTLESS:-}" == 0 ]]; then
    dev_error 'PORTLESS=0 is unsupported. Unset PORTLESS; pnpm dev requires Portless.'
    return 1
  fi
  PORTLESS_EXECUTABLE=$(type -P portless) || {
    dev_error 'Portless is required. Run: npm install -g portless; export PATH="$(npm prefix -g)/bin:$PATH"'
    return 1
  }
  if ! node -e 'const fs = require("node:fs"); try { if (JSON.parse(fs.readFileSync("portless.json", "utf8")).name !== "atlaris") process.exit(1); } catch { process.exit(1); }'; then
    dev_error 'portless.json must exist with name "atlaris".'
    return 1
  fi
}

# Reject project-controlled paths, including symlinks into node_modules or either
# checkout. An explicitly configured wrapper must be an absolute, external path.
trusted_op_path() {
  [[ "$1" == /* && -f "$1" && -x "$1" ]] || return 1
  node - "$1" "$DEV_ROOT" "$(git rev-parse --path-format=absolute --git-common-dir)" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const [candidate, root, common] = process.argv.slice(2);
try {
  const roots = [path.resolve(root), fs.realpathSync(root), path.dirname(path.resolve(common)), path.dirname(fs.realpathSync(common))];
  for (const value of [path.resolve(candidate), fs.realpathSync(candidate)]) {
    if (value.split(path.sep).includes('node_modules') || roots.some(root => value === root || value.startsWith(root + path.sep))) process.exit(1);
  }
} catch { process.exit(1); }
NODE
}

resolve_op() {
  local directory candidate
  if [[ -n "${OP_EXECUTABLE:-}" ]]; then
    if ! trusted_op_path "$OP_EXECUTABLE"; then
      dev_error 'OP_EXECUTABLE must be an executable absolute path outside the repository and node_modules.'
      return 1
    fi
  else
    local -a directories
    IFS=: read -r -a directories <<< "$PATH"
    for directory in "${directories[@]}"; do
      candidate="$directory/op"
      if trusted_op_path "$candidate"; then
        OP_EXECUTABLE="$candidate"
        break
      fi
    done
    if [[ -z "${OP_EXECUTABLE:-}" ]]; then
      dev_error '1Password CLI not found outside project paths. Install op or set OP_EXECUTABLE to your trusted wrapper.'
      return 1
    fi
  fi
  if [[ -z "${OP_ENVIRONMENT_ID:-}" ]]; then
    dev_error 'Set OP_ENVIRONMENT_ID in .dev-env.local.sh or your shell (see .dev-env.example.sh).'
    return 1
  fi
}
