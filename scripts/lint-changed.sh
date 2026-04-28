#!/usr/bin/env sh
set -e

# Runs Oxlint against code files changed from the branch-appropriate base:
#   feature/* (anything except main, develop) -> develop
#   develop                                  -> main
#   main                                     -> main
#   detached HEAD / unknown                  -> develop

branch=$(git branch --show-current 2>/dev/null || true)

case "$branch" in
  main)
    since=main
    ;;
  develop)
    since=main
    ;;
  '')
    since=develop
    ;;
  *)
    since=develop
    ;;
esac

changed_files=$(git diff --name-only --diff-filter=ACMR "$since"...HEAD --)

if [ -z "$changed_files" ]; then
  echo "No changed files since $since."
  exit 0
fi

code_files=$(printf '%s\n' "$changed_files" | grep -E '^(src|tests|scripts)/.*\.(ts|tsx|js|jsx|cjs|mjs|cts|mts)$' || true)
if [ -n "$code_files" ]; then
  printf '%s\n' "$code_files" | xargs pnpm exec oxlint --max-warnings=0 --no-error-on-unmatched-pattern
fi
