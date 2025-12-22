#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Unit Test Runner
# Usage: ./scripts/test-unit.sh [test-path] [--changed] [--watch] [extra-args]
# =============================================================================

TEST_DIR="${1:-tests/unit}"
shift || true

# Parse arguments
WATCH_MODE=false
CHANGED_MODE=false
EXTRA_ARGS=()

for arg in "$@"; do
  case $arg in
    --watch|-w)
      WATCH_MODE=true
      ;;
    --changed|-c)
      CHANGED_MODE=true
      ;;
    --help|-h)
      echo "Usage: $0 [test-path] [OPTIONS]"
      echo ""
      echo "Arguments:"
      echo "  test-path           Path to test file or directory (default: tests/unit)"
      echo ""
      echo "Options:"
      echo "  --changed, -c       Run only tests related to uncommitted changes"
      echo "  --watch, -w         Run in watch mode"
      echo "  --help, -h          Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0                              # Run all unit tests"
      echo "  $0 --changed                    # Run tests related to changes"
      echo "  $0 --watch                      # Run in watch mode"
      echo "  $0 tests/unit/services          # Run tests in specific directory"
      echo "  $0 tests/unit/my.test.ts        # Run specific test file"
      exit 0
      ;;
    *)
      EXTRA_ARGS+=("$arg")
      ;;
  esac
done

# Build vitest command
CMD="NODE_ENV=test SKIP_DB_TEST_SETUP=true pnpm vitest"

if [ "$WATCH_MODE" = true ]; then
  CMD="$CMD --project unit"
else
  CMD="$CMD run --project unit"
fi

if [ "$CHANGED_MODE" = true ]; then
  CMD="$CMD --changed"
fi

CMD="$CMD $TEST_DIR"

if [ ${#EXTRA_ARGS[@]} -gt 0 ]; then
  CMD="$CMD ${EXTRA_ARGS[*]}"
fi

echo "Running: $CMD"
eval "$CMD"
