#!/usr/bin/env bash
set -euo pipefail

WORKTREE_ROOT=$(git rev-parse --show-toplevel)
GIT_COMMON_DIR=$(git rev-parse --path-format=absolute --git-common-dir)
MAIN_ROOT=$(dirname "$GIT_COMMON_DIR")

link_from_main() {
  local relative_path=$1
  local source="$MAIN_ROOT/$relative_path"
  local destination="$WORKTREE_ROOT/$relative_path"
  local exclude_file

  if [[ ! -e "$source" && ! -L "$source" ]]; then
    return
  fi

  if [[ "$source" == "$destination" ]]; then
    return
  fi

  while IFS= read -r -d '' tracked_path; do
    git update-index --skip-worktree "$tracked_path"
  done < <(git ls-files -z -- "$relative_path")

  exclude_file=$(git rev-parse --git-path info/exclude)
  mkdir -p "$(dirname "$exclude_file")"
  if ! grep -qxF "/$relative_path" "$exclude_file" 2>/dev/null; then
    printf "/%s\n" "$relative_path" >> "$exclude_file"
  fi

  mkdir -p "$(dirname "$destination")"
  rm -rf "$destination"
  ln -s "$source" "$destination"
}

link_from_main ".env.local"
link_from_main ".vercel"
link_from_main ".agents"
link_from_main ".cursor"
link_from_main ".daily-recap"
link_from_main "screenshots"

pnpm install --frozen-lockfile
