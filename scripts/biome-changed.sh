#!/usr/bin/env sh
set -e

# Runs Biome with --changed and a branch-appropriate --since:
#   feature/* (anything except main, develop) → --since=develop
#   develop                                  → --since=main
#   main                                     → --since=main (same as vcs.defaultBranch)
# Detached HEAD / unknown                    → --since=develop
#
# Usage: ./scripts/biome-changed.sh <biome-subcommand> [args...]
# Examples:
#   ./scripts/biome-changed.sh check
#   ./scripts/biome-changed.sh check --write
#   ./scripts/biome-changed.sh format --write

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

exec pnpm exec biome "$@" --changed --since="$since"
