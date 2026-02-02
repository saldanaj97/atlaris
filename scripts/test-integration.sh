#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Integration Test Runner - Runs tests that require a database
# Usage: ./scripts/test-integration.sh [test-path] [extra-args]
# =============================================================================

TEST_DIR="${1:-tests/integration}"
shift || true
EXTRA_ARGS="$*"

# Track if we started Docker (for cleanup)
DB_STARTED=false

# Cleanup function - runs on exit or interrupt
cleanup() {
  if [ "$DB_STARTED" = true ]; then
    echo "Stopping test database..."
    docker-compose -f docker-compose.test.yml down 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "Starting test database..."
docker-compose -f docker-compose.test.yml up -d
DB_STARTED=true

echo "Waiting for database to be ready..."
timeout=30; counter=0
until docker exec atlaris-test-db pg_isready -U postgres > /dev/null 2>&1; do
  sleep 1; counter=$((counter + 1))
  if [ $counter -ge $timeout ]; then
    echo "Database failed to start"
    exit 1
  fi
done

# Bootstrap extensions and roles expected by RLS policies
echo "Bootstrapping extensions and roles..."
docker exec atlaris-test-db psql -U postgres -d atlaris_test <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOINHERIT NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql
AS $$ SELECT COALESCE(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb) $$;
SQL

echo "Applying migrations..."
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54330/atlaris_test"
pnpm db:push

echo "Granting RLS bypass to postgres user..."
docker exec atlaris-test-db psql -U postgres -d atlaris_test -c "ALTER ROLE postgres BYPASSRLS;"

echo "Running tests: $TEST_DIR"
# Determine project based on directory
PROJECT="integration"
if [[ "$TEST_DIR" == tests/e2e* ]]; then
  PROJECT="e2e"
elif [[ "$TEST_DIR" == tests/security* ]]; then
  PROJECT="security"
elif [[ "$TEST_DIR" == tests/integration* ]]; then
  PROJECT="integration"
fi
NODE_ENV=test ALLOW_DB_TRUNCATE=true pnpm vitest --config vitest.config.ts run --project "$PROJECT" "$TEST_DIR" $EXTRA_ARGS

# Cleanup handled by trap
