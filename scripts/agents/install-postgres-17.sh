#!/usr/bin/env bash
set -Eeuo pipefail

readonly LOG_PREFIX='[agent-postgres-install]'
readonly POSTGRES_BIN='/usr/lib/postgresql/17/bin/postgres'

log() {
  printf '%s %s\n' "$LOG_PREFIX" "$*"
}

fail() {
  printf '%s ERROR: %s\n' "$LOG_PREFIX" "$*" >&2
  exit 1
}

run_as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1 && sudo -n true; then
    sudo -n "$@"
  else
    fail 'Passwordless sudo is required to install PostgreSQL 17.'
  fi
}

[[ -r /etc/os-release ]] || fail 'Automatic installation requires Ubuntu.'
# shellcheck disable=SC1091
source /etc/os-release
[[ "${ID:-}" == 'ubuntu' ]] || fail 'Automatic installation supports Ubuntu only.'
[[ -n "${VERSION_CODENAME:-}" ]] || fail 'Ubuntu VERSION_CODENAME is missing.'

if [[ -x "$POSTGRES_BIN" ]] && "$POSTGRES_BIN" --version | grep -qE ' 17\.'; then
  log "PostgreSQL already installed: $($POSTGRES_BIN --version)"
  exit 0
fi

command -v apt-get >/dev/null 2>&1 || fail 'apt-get is required.'

log 'Installing PostgreSQL 17 prerequisites...'
run_as_root apt-get update
run_as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates \
  curl

if ! apt-cache show postgresql-17 >/dev/null 2>&1; then
  PGP_ARCH="$(dpkg --print-architecture)"
  readonly PGP_ARCH
  log "Adding the official PostgreSQL Apt repository for Ubuntu ${VERSION_CODENAME} (${PGP_ARCH})..."
  run_as_root install -d -m 0755 /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc |
    run_as_root tee /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc >/dev/null
  printf '%s\n' \
    'Types: deb' \
    'URIs: https://apt.postgresql.org/pub/repos/apt' \
    "Suites: ${VERSION_CODENAME}-pgdg" \
    "Architectures: ${PGP_ARCH}" \
    'Components: main' \
    'Signed-By: /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc' |
    run_as_root tee /etc/apt/sources.list.d/pgdg.sources >/dev/null
  run_as_root apt-get update
fi

log 'Installing PostgreSQL 17 server and client...'
run_as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y \
  postgresql-17 \
  postgresql-client-17

[[ -x "$POSTGRES_BIN" ]] || fail 'PostgreSQL installation completed without the postgres binary.'
"$POSTGRES_BIN" --version | grep -qE ' 17\.' || fail 'Installed PostgreSQL is not version 17.'

for binary in initdb pg_ctl pg_isready psql; do
  [[ -x "/usr/lib/postgresql/17/bin/$binary" ]] || fail "Missing PostgreSQL 17 binary: $binary"
done

log "Installed $($POSTGRES_BIN --version)."
