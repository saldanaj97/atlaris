#!/usr/bin/env bash
set -e

ROOT="/Users/juansaldana/Dev/Projects/atlaris"

ln -sf "$ROOT/.env.local" .env.local
pnpm install