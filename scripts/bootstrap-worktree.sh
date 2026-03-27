#!/usr/bin/env bash
set -e

# Resolve main repo root dynamically
GIT_COMMON_DIR=$(git rev-parse --git-common-dir)
ROOT=$(cd "$GIT_COMMON_DIR/.." && pwd)

ln -sf "$ROOT/.env.local" .env.local
pnpm install
