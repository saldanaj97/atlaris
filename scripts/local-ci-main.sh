#!/usr/bin/env bash
# Local CI Main simulation script
# Mimics the main branch CI jobs: lint, type-check, build-staging-env, migration-dry-run, integration-tests, e2e-tests
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

print_header "Local CI Main Branch Simulation"
echo "This script mimics the main branch CI workflow:"
echo "  1. Lint"
echo "  2. Type Check"
echo "  3. Build (Staging Env)"
echo "  4. Migration Dry-Run"
echo "  5. Integration Tests (shard 1/2)"
echo "  6. Integration Tests (shard 2/2)"
echo "  7. E2E Tests (shard 1/2)"
echo "  8. E2E Tests (shard 2/2)"
echo ""

# Job 1: Lint
run_job "Lint" pnpm lint || true

# Job 2: Type Check
run_job "Type Check" pnpm type-check || true

# Job 3: Build (Staging Env)
run_job "Build (Staging Env)" pnpm build || true

# Job 4: Migration Dry-Run
run_migration_dry_run() {
  print_header "Setting up test database for migration dry-run"

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

  # Create ephemeral database for migration
  DB_NAME="local_ci_main_migrate_$(date +%s)"
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

  # Apply migrations
  export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54330/${DB_NAME}"
  echo "Applying migrations with Drizzle..."
  pnpm db:migrate:test-db || return 1

  # Cleanup
  echo "Dropping ephemeral database: $DB_NAME"
  docker exec atlaris-test-db psql -U postgres -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";" || true

  return 0
}

run_job "Migration Dry-Run" run_migration_dry_run || true

# Helper function to set up database for tests
setup_test_db() {
  local db_suffix="$1"

  # Start Docker database if not running
  if ! docker ps | grep -q atlaris-test-db; then
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
  fi

  # Create ephemeral database
  DB_NAME="local_ci_main_${db_suffix}_$(date +%s)"
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

  echo "$DB_NAME"
}

cleanup_test_db() {
  local db_name="$1"
  echo "Dropping ephemeral database: $db_name"
  docker exec atlaris-test-db psql -U postgres -c "DROP DATABASE IF EXISTS \"${db_name}\";" || true
}

# Jobs 5-6: Integration Tests (sharded)
run_integration_tests_shard() {
  local shard=$1
  local total=$2

  # Set up database for this shard
  if ! DB_NAME=$(setup_test_db "int_shard${shard}"); then
    print_error "Failed to set up database for integration tests shard ${shard}"
    return 1
  fi

  export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54330/${DB_NAME}"
  export NODE_ENV=test
  export ALLOW_DB_TRUNCATE=true
  export ENABLE_CURATION=false

  # Count test files
  FILES=$(find tests/integration -type f \( -name "*.test.ts" -o -name "*.spec.ts" -o -name "*.test.tsx" -o -name "*.spec.tsx" \) 2>/dev/null | wc -l || echo 0)

  if [ "$FILES" -eq 0 ]; then
    print_warning "No integration test files found; skipping shard ${shard}"
    cleanup_test_db "$DB_NAME"
    return 0
  fi

  if [ "$shard" -gt "$FILES" ]; then
    print_warning "Shard ${shard} exceeds file count ${FILES}; skipping this shard"
    cleanup_test_db "$DB_NAME"
    return 0
  fi

  # Run tests
  pnpm vitest run tests/integration \
    --shard "${shard}/${total}" \
    --reporter=default

  local exit_code=$?

  # Cleanup
  cleanup_test_db "$DB_NAME"

  return $exit_code
}

run_job "Integration Tests (shard 1/2)" run_integration_tests_shard 1 2 || true
run_job "Integration Tests (shard 2/2)" run_integration_tests_shard 2 2 || true

# Jobs 7-8: E2E Tests (sharded)
run_e2e_tests_shard() {
  local shard=$1
  local total=$2

  # Set up database for this shard
  if ! DB_NAME=$(setup_test_db "e2e_shard${shard}"); then
    print_error "Failed to set up database for E2E tests shard ${shard}"
    return 1
  fi

  export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54330/${DB_NAME}"
  export NODE_ENV=test
  export ALLOW_DB_TRUNCATE=true
  export ENABLE_CURATION=false

  # Count test files
  FILES=$(find tests/e2e -type f \( -name "*.test.ts" -o -name "*.spec.ts" -o -name "*.test.tsx" -o -name "*.spec.tsx" \) 2>/dev/null | wc -l || echo 0)

  if [ "$FILES" -eq 0 ]; then
    print_warning "No E2E test files found; skipping shard ${shard}"
    cleanup_test_db "$DB_NAME"
    return 0
  fi

  if [ "$shard" -gt "$FILES" ]; then
    print_warning "Shard ${shard} exceeds file count ${FILES}; skipping this shard"
    cleanup_test_db "$DB_NAME"
    return 0
  fi

  # Run tests
  pnpm vitest run tests/e2e \
    --shard "${shard}/${total}" \
    --reporter=default

  local exit_code=$?

  # Cleanup
  cleanup_test_db "$DB_NAME"

  return $exit_code
}

run_job "E2E Tests (shard 1/2)" run_e2e_tests_shard 1 2 || true
run_job "E2E Tests (shard 2/2)" run_e2e_tests_shard 2 2 || true

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
