#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Full Test Suite - Runs all tests with proper setup and cleanup
# Usage: ./scripts/full-test-suite.sh [--with-e2e] [--skip-lint] [--skip-typecheck]
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()  { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }
log_step()  { echo -e "\n${BLUE}==>${NC} $1"; }

# Track results
declare -a PASSED_SUITES=()
declare -a FAILED_SUITES=()
DB_STARTED=false

# Cleanup function - runs on exit or interrupt
cleanup() {
  if [ "$DB_STARTED" = true ]; then
    echo ""
    log_step "Cleaning up..."
    docker-compose -f docker-compose.test.yml down --volumes --remove-orphans 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Parse arguments
WITH_E2E=false
SKIP_LINT=false
SKIP_TYPECHECK=false

for arg in "$@"; do
  case $arg in
    --with-e2e) WITH_E2E=true ;;
    --skip-lint) SKIP_LINT=true ;;
    --skip-typecheck) SKIP_TYPECHECK=true ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --with-e2e        Include E2E tests (slow)"
      echo "  --skip-lint       Skip linting step"
      echo "  --skip-typecheck  Skip TypeScript type checking"
      echo "  --help, -h        Show this help message"
      exit 0
      ;;
    *)
      log_error "Unknown argument: $arg"
      exit 1
      ;;
  esac
done

echo ""
echo "========================================"
echo "       FULL TEST SUITE"
echo "========================================"
echo ""

# =============================================================================
# Step 1: Static Analysis (no DB needed, run first for fast feedback)
# =============================================================================

if [ "$SKIP_LINT" = false ]; then
  log_step "Running linter..."
  if pnpm lint; then
    PASSED_SUITES+=("lint")
    log_info "Linting passed"
  else
    FAILED_SUITES+=("lint")
    log_error "Linting failed"
  fi
else
  log_warn "Skipping lint (--skip-lint)"
fi

if [ "$SKIP_TYPECHECK" = false ]; then
  log_step "Running type check..."
  if pnpm type-check; then
    PASSED_SUITES+=("type-check")
    log_info "Type check passed"
  else
    FAILED_SUITES+=("type-check")
    log_error "Type check failed"
  fi
else
  log_warn "Skipping type check (--skip-typecheck)"
fi

# =============================================================================
# Step 2: Unit Tests (no DB needed, run in parallel with DB startup)
# =============================================================================

log_step "Starting unit tests and database in parallel..."

# Start unit tests in background (no DB required)
(
  NODE_ENV=test SKIP_DB_TEST_SETUP=true pnpm vitest run tests/unit
) & U_PID=$!

# Start database while unit tests run
docker-compose -f docker-compose.test.yml up -d
DB_STARTED=true

# Wait for database to be ready
log_info "Waiting for database..."
timeout=30
counter=0
until docker exec atlaris-test-db pg_isready -U postgres > /dev/null 2>&1; do
  sleep 1
  counter=$((counter + 1))
  if [ $counter -ge $timeout ]; then
    log_error "Database failed to start within ${timeout}s"
    exit 1
  fi
done
log_info "Database ready"

# Bootstrap extensions and roles expected by RLS policies
log_info "Bootstrapping extensions and roles..."
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

# Apply schema
log_info "Applying schema..."
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54330/atlaris_test"
pnpm db:push > /dev/null

# Grant RLS bypass
docker exec atlaris-test-db psql -U postgres -d atlaris_test -c "ALTER ROLE postgres BYPASSRLS;" > /dev/null

# Wait for unit tests to complete
wait $U_PID && U_EXIT=0 || U_EXIT=$?
if [ $U_EXIT -eq 0 ]; then
  PASSED_SUITES+=("unit")
  log_info "Unit tests passed"
else
  FAILED_SUITES+=("unit")
  log_error "Unit tests failed"
fi

# =============================================================================
# Step 3: Integration Tests
# =============================================================================

log_step "Running integration tests..."
export ALLOW_DB_TRUNCATE=true
if NODE_ENV=test pnpm vitest run tests/integration; then
  PASSED_SUITES+=("integration")
  log_info "Integration tests passed"
else
  FAILED_SUITES+=("integration")
  log_error "Integration tests failed"
fi

# =============================================================================
# Step 4: RLS Security Tests
# =============================================================================

# log_step "Running RLS security tests..."
# if NODE_ENV=test pnpm vitest run tests/security; then
#   PASSED_SUITES+=("security/rls")
#   log_info "RLS security tests passed"
# else
#   FAILED_SUITES+=("security/rls")
#   log_error "RLS security tests failed"
# fi

# =============================================================================
# Step 5: E2E Tests (optional)
# =============================================================================

if [ "$WITH_E2E" = true ]; then
  log_step "Running E2E tests..."
  if NODE_ENV=test pnpm vitest run tests/e2e; then
    PASSED_SUITES+=("e2e")
    log_info "E2E tests passed"
  else
    FAILED_SUITES+=("e2e")
    log_error "E2E tests failed"
  fi
else
  log_warn "Skipping E2E tests (use --with-e2e to include)"
fi

# =============================================================================
# Summary
# =============================================================================

echo ""
echo "========================================"
echo "       TEST SUITE SUMMARY"
echo "========================================"
echo ""

if [ ${#PASSED_SUITES[@]} -gt 0 ]; then
  echo -e "${GREEN}Passed:${NC} ${PASSED_SUITES[*]}"
fi

if [ ${#FAILED_SUITES[@]} -gt 0 ]; then
  echo -e "${RED}Failed:${NC} ${FAILED_SUITES[*]}"
  echo ""
  exit 1
else
  echo ""
  log_info "All test suites passed!"
  exit 0
fi
