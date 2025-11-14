#!/usr/bin/env bash
# Local CI PR simulation script
# Mimics the CI jobs: lint, type-check, build, unit-tests, and integration-light
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters for summary
TOTAL_JOBS=0
PASSED_JOBS=0
FAILED_JOBS=()

# Helper functions
print_header() {
  echo -e "\n${BLUE}===================================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}===================================================${NC}\n"
}

print_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
  echo -e "${RED}❌ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

run_job() {
  local job_name="$1"
  shift
  TOTAL_JOBS=$((TOTAL_JOBS + 1))

  print_header "Job $TOTAL_JOBS: $job_name"

  if "$@"; then
    print_success "$job_name passed"
    PASSED_JOBS=$((PASSED_JOBS + 1))
    return 0
  else
    print_error "$job_name failed"
    FAILED_JOBS+=("$job_name")
    return 1
  fi
}

cleanup() {
  print_header "Cleanup"
  echo "Stopping test database..."
  docker-compose -f docker-compose.test.yml down --volumes --remove-orphans 2>/dev/null || true
}

# Ensure cleanup on exit
trap cleanup EXIT

print_header "Local CI PR Simulation"
echo "This script mimics the CI PR workflow:"
echo "  1. Lint"
echo "  2. Type Check"
echo "  3. Build"
echo "  4. Unit Tests (sharded 1/2)"
echo "  5. Unit Tests (sharded 2/2)"
echo "  6. Integration Tests (light)"
echo ""

# Job 1: Lint
run_job "Lint" pnpm lint

# Job 2: Type Check
run_job "Type Check" pnpm type-check

# Job 3: Build
run_job "Build" pnpm build

# Job 4 & 5: Unit Tests (sharded)
setup_unit_test_db() {
  print_header "Setting up test database for unit tests"

  # Start Docker database
  echo "Starting test database..."
  docker-compose -f docker-compose.test.yml up -d

  # Wait for database to be ready
  echo "Waiting for database to be ready..."
  timeout=30
  counter=0
  until docker exec atlaris-test-db pg_isready -U postgres > /dev/null 2>&1; do
    sleep 1
    counter=$((counter + 1))
    if [ $counter -ge $timeout ]; then
      print_error "Database failed to start within ${timeout}s"
      return 1
    fi
  done

  # Create ephemeral database
  DB_NAME="local_ci_pr_unit_$(date +%s)"
  echo "Creating ephemeral database: $DB_NAME"
  docker exec atlaris-test-db psql -U postgres -c "CREATE DATABASE \"${DB_NAME}\";" || return 1

  # Bootstrap extensions and roles
  docker exec atlaris-test-db psql -U postgres -d "$DB_NAME" <<'SQL' || return 1
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOINHERIT NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql
AS $$ SELECT COALESCE(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb) $$;
SQL

  # Apply schema
  export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54330/${DB_NAME}"
  echo "Applying schema with Drizzle..."
  pnpm db:push:test-db || return 1

  echo "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54330/${DB_NAME}"
  echo "$DB_NAME"
}

run_unit_tests_shard() {
  local shard=$1
  local total=$2

  export NODE_ENV=test
  export SKIP_DB_TEST_SETUP=true
  export ALLOW_DB_TRUNCATE=true

  pnpm vitest run --project unit tests/unit \
    --shard "${shard}/${total}" \
    --reporter=default
}

# Set up database once for unit tests
if DB_INFO=$(setup_unit_test_db); then
  DB_NAME=$(echo "$DB_INFO" | tail -n 1)
  export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54330/${DB_NAME}"

  run_job "Unit Tests (shard 1/2)" run_unit_tests_shard 1 2
  run_job "Unit Tests (shard 2/2)" run_unit_tests_shard 2 2

  # Cleanup unit test database
  echo "Dropping ephemeral database: $DB_NAME"
  docker exec atlaris-test-db psql -U postgres -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";" || true
else
  print_error "Failed to set up unit test database"
  FAILED_JOBS+=("Unit Tests Setup")
fi

# Job 6: Integration Tests (light subset)
run_integration_light() {
  print_header "Setting up test database for integration tests"

  # Create ephemeral database
  DB_NAME="local_ci_pr_int_$(date +%s)"
  echo "Creating ephemeral database: $DB_NAME"
  docker exec atlaris-test-db psql -U postgres -c "CREATE DATABASE \"${DB_NAME}\";" || return 1

  # Bootstrap extensions and roles
  docker exec atlaris-test-db psql -U postgres -d "$DB_NAME" <<'SQL' || return 1
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOINHERIT NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql
AS $$ SELECT COALESCE(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb) $$;
SQL

  # Apply schema
  export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54330/${DB_NAME}"
  echo "Applying schema with Drizzle..."
  pnpm db:push:test-db || return 1

  export NODE_ENV=test
  export ALLOW_DB_TRUNCATE=true
  unset SKIP_DB_TEST_SETUP  # Ensure DB setup hooks run for integration tests

  # Discover all light integration tests (mirrors CI behavior)
  # CI uses: find tests/integration -type f -path '*/light/*' \( -name "*.test.ts" -o -name "*.spec.ts" -o -name "*.test.tsx" -o -name "*.spec.tsx" \)
  mapfile -t LIGHT_FILES < <(find tests/integration -type f -path '*/light/*' \( -name "*.test.ts" -o -name "*.spec.ts" -o -name "*.test.tsx" -o -name "*.spec.tsx" \))

  if [ "${#LIGHT_FILES[@]}" -eq 0 ]; then
    echo "No light integration tests found; skipping."
    # Cleanup
    echo "Dropping ephemeral database: $DB_NAME"
    docker exec atlaris-test-db psql -U postgres -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";" || true
    return 0
  fi

  echo "Running ${#LIGHT_FILES[@]} light integration test files..."
  if ! pnpm vitest run --project integration "${LIGHT_FILES[@]}" --reporter=default; then
    # Cleanup
    echo "Dropping ephemeral database: $DB_NAME"
    docker exec atlaris-test-db psql -U postgres -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";" || true
    return 1
  fi

  # Cleanup
  echo "Dropping ephemeral database: $DB_NAME"
  docker exec atlaris-test-db psql -U postgres -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";" || true

  return 0
}

run_job "Integration Tests (light)" run_integration_light

# Summary
print_header "Summary"
echo "Total jobs: $TOTAL_JOBS"
echo "Passed: $PASSED_JOBS"
echo "Failed: $((TOTAL_JOBS - PASSED_JOBS))"

if [ ${#FAILED_JOBS[@]} -eq 0 ]; then
  print_success "All jobs passed! ✨"
  exit 0
else
  print_error "Failed jobs:"
  for job in "${FAILED_JOBS[@]}"; do
    echo "  - $job"
  done
  exit 1
fi
