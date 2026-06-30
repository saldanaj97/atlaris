#!/usr/bin/env bash
set -euo pipefail

WORKTREE_ROOT=$(git rev-parse --show-toplevel)
GIT_COMMON_DIR=$(git rev-parse --path-format=absolute --git-common-dir)
MAIN_ROOT=$(dirname "$GIT_COMMON_DIR")

link_from_main() {
  local relative_path=$1
  local source="$MAIN_ROOT/$relative_path"
  local destination="$WORKTREE_ROOT/$relative_path"

  if [[ ! -e "$source" && ! -L "$source" ]]; then
    return
  fi

  mkdir -p "$(dirname "$destination")"
  ln -sfn "$source" "$destination"
}

link_from_main ".env.local"
link_from_main ".vercel"

pnpm install --frozen-lockfile
