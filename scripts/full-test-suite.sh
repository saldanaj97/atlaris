#!/usr/bin/env bash
set -euo pipefail

WITH_E2E=false
if [[ "${1:-}" == "--with-e2e" ]]; then
  WITH_E2E=true
  shift
fi

echo "Starting test database for suite..."
docker-compose -f docker-compose.test.yml up -d

echo "Waiting for database to be ready..."
timeout=30
counter=0
until docker exec atlaris-test-db pg_isready -U postgres > /dev/null 2>&1; do
  sleep 1
  counter=$((counter + 1))
  if [ $counter -ge $timeout ]; then
    echo "Database failed to start"
    docker-compose -f docker-compose.test.yml down
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

# Run unit tests in background (no DB needed)
echo "Running unit tests..."
NODE_ENV=test pnpm vitest run tests/unit & U_PID=$!

# Run integration tests in background
echo "Running integration tests..."
export ALLOW_DB_TRUNCATE=true
NODE_ENV=test pnpm vitest run tests/integration & I_PID=$!

# Wait for unit and integration
wait $U_PID; U_EXIT=$?
wait $I_PID; I_EXIT=$?

if [ $U_EXIT -ne 0 ] || [ $I_EXIT -ne 0 ]; then
  echo "Unit or integration tests failed"
  docker-compose -f docker-compose.test.yml down
  exit 1
fi

if [ "$WITH_E2E" = true ]; then
  echo "Running e2e tests..."
  export ALLOW_DB_TRUNCATE=true
  NODE_ENV=test pnpm vitest run tests/e2e
  E2E_EXIT=$?
  if [ $E2E_EXIT -ne 0 ]; then
    echo "E2E tests failed"
    docker-compose -f docker-compose.test.yml down
    exit 1
  fi
fi

echo "Stopping test database..."
docker-compose -f docker-compose.test.yml down
