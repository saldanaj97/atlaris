#!/usr/bin/env bash
set -euo pipefail

TEST_DIR="${1:-tests/unit}"
shift || true
EXTRA_ARGS="$*"

if [[ "$TEST_DIR" == tests/unit* ]]; then
  echo "Running unit tests without DB..."
  NODE_ENV=test pnpm vitest --config vitest.unit.config.ts run "$TEST_DIR" $EXTRA_ARGS
  exit $?
fi

echo "Starting test database..."
docker-compose -f docker-compose.test.yml up -d

echo "Waiting for database to be ready..."
timeout=30; counter=0
until docker exec atlaris-test-db pg_isready -U postgres > /dev/null 2>&1; do
  sleep 1; counter=$((counter + 1))
  if [ $counter -ge $timeout ]; then
    echo "Database failed to start"
    docker-compose -f docker-compose.test.yml down
    exit 1
  fi
done

echo "Applying migrations..."
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54330/atlaris_test"
pnpm db:push

echo "Running tests: $TEST_DIR"
NODE_ENV=test ALLOW_DB_TRUNCATE=true pnpm vitest --config vitest.integration.config.ts run "$TEST_DIR" $EXTRA_ARGS

echo "Stopping test database..."
docker-compose -f docker-compose.test.yml down
