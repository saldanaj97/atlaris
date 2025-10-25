#!/usr/bin/env bash
set -euo pipefail

# Start test container
echo "Starting test database..."
docker-compose -f docker-compose.test.yml up -d

# Wait for DB to be ready
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

# Apply migrations
echo "Applying migrations..."
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54330/atlaris_test"
pnpm db:push

# Run tests (accept test dir and additional vitest args)
TEST_DIR="${1:-tests/unit}"
shift || true  # Remove first arg, keep any remaining args for vitest
shift || true  # Also remove "--" separator if present
EXTRA_ARGS="${@}"  # Any additional vitest flags

echo "Running tests: $TEST_DIR"
if [ -n "$EXTRA_ARGS" ]; then
  echo "  with additional args: $EXTRA_ARGS"
fi

NODE_ENV=test ALLOW_DB_TRUNCATE=true pnpm vitest run $TEST_DIR $EXTRA_ARGS

# Cleanup
echo "Stopping test database..."
docker-compose -f docker-compose.test.yml down
