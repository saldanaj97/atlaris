#!/usr/bin/env bash
set -euo pipefail

HOOKS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_DIR="$(cd "$HOOKS_DIR" && git rev-parse --show-toplevel 2>/dev/null || pwd)"
LOCK_DIR="$HOOKS_DIR/.validation-lock"
LOG_DIR="$HOOKS_DIR/logs"

INPUT="$(cat || true)"
SESSION_REASON="$(printf '%s' "$INPUT" | node -e "let raw='';process.stdin.on('data',chunk=>raw+=chunk).on('end',()=>{try{const parsed=JSON.parse(raw);process.stdout.write(parsed.reason ?? '');}catch{}})")"

if [[ "$SESSION_REASON" != "complete" ]]; then
  exit 0
fi

mkdir -p "$LOG_DIR"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  exit 0
fi

cleanup() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

trap cleanup EXIT

cd "$PROJECT_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

mapfile -t CHANGED_FILES < <(
  {
    git diff --name-only HEAD 2>/dev/null
    git diff --cached --name-only HEAD 2>/dev/null
    git ls-files --others --exclude-standard 2>/dev/null
  } | awk 'NF' | sort -u
)

if [[ ${#CHANGED_FILES[@]} -eq 0 ]]; then
  exit 0
fi

RUN_HOOK_VALIDATION=false
RUN_LINT=false
RUN_TYPECHECK=false
RUN_UNIT=false
RUN_INTEGRATION=false
declare -a TARGETED_INTEGRATION_TESTS=()

for file in "${CHANGED_FILES[@]}"; do
  if [[ "$file" =~ ^\.github/hooks/ ]] || [[ "$file" == ".claude/settings.json" ]]; then
    RUN_HOOK_VALIDATION=true
  fi

  case "$file" in
    src/*|tests/*|package.json|pnpm-lock.yaml|tsconfig.json|eslint.config.mjs|vitest.config.ts|next.config.ts)
      RUN_LINT=true
      RUN_TYPECHECK=true
      ;;
  esac

  case "$file" in
    src/*|tests/unit/*|tests/fixtures/*|tests/mocks/*|tests/helpers/*|tests/setup.ts|tests/unit/setup.ts)
      RUN_UNIT=true
      ;;
  esac

  if [[ "$file" =~ ^tests/integration/.*\.(spec|test)\.tsx?$ ]]; then
    RUN_INTEGRATION=true
    TARGETED_INTEGRATION_TESTS+=("$file")
    continue
  fi

  case "$file" in
    src/*|tests/helpers/*|tests/setup/*|tests/setup.ts)
      RUN_INTEGRATION=true
      ;;
  esac
done

if [[ "$RUN_HOOK_VALIDATION" == false && "$RUN_LINT" == false && "$RUN_TYPECHECK" == false && "$RUN_UNIT" == false && "$RUN_INTEGRATION" == false ]]; then
  exit 0
fi

EXIT_CODE=0
shopt -s nullglob

print_success_summary() {
  local output_file="$1"
  local summary

  summary="$(grep -E 'Running:|Test Files|Tests|Duration|No errors|settings ok|passed|checked' "$output_file" || true)"

  if [[ -n "$summary" ]]; then
    printf '%s\n' "$summary"
  fi
}

print_failure_summary() {
  local output_file="$1"
  printf 'Last output lines:\n'
  tail -n 60 "$output_file"
}

run_step() {
  local label="$1"
  shift

  local output_file
  output_file="$(mktemp "$LOG_DIR/validation.XXXXXX.log")"

  printf '▶ %s\n' "$label"

  if "$@" >"$output_file" 2>&1; then
    printf '✓ %s\n' "$label"
    print_success_summary "$output_file"
  else
    EXIT_CODE=1
    printf '✖ %s\n' "$label"
    print_failure_summary "$output_file"
  fi
}

if [[ "$RUN_HOOK_VALIDATION" == true ]]; then
  run_step "Validating hook config JSON" node -e "const fs=require('node:fs'); const path=require('node:path'); const files=fs.readdirSync('.github/hooks').filter(file=>file.endsWith('.json')); for (const file of files) { JSON.parse(fs.readFileSync(path.join('.github/hooks', file), 'utf8')); } console.log('checked', files.join(', '));"

  HOOK_NODE_SCRIPTS=(.github/hooks/scripts/*.cjs)
  if [[ ${#HOOK_NODE_SCRIPTS[@]} -gt 0 ]]; then
    run_step "Checking hook Node scripts" node -e "const {execFileSync}=require('node:child_process'); const fs=require('node:fs'); const path=require('node:path'); for (const file of fs.readdirSync('.github/hooks/scripts')) { if (file.endsWith('.cjs')) execFileSync('node', ['--check', path.join('.github/hooks/scripts', file)], {stdio:'inherit'}); } console.log('checked node hook scripts');"
  fi

  HOOK_SHELL_SCRIPTS=(.github/hooks/scripts/*.sh)
  if [[ ${#HOOK_SHELL_SCRIPTS[@]} -gt 0 ]]; then
    run_step "Checking hook shell scripts" bash -c 'for file in .github/hooks/scripts/*.sh; do bash -n "$file"; done; printf "checked shell hook scripts\n"'
  fi
fi

if [[ "$RUN_LINT" == true ]]; then
  run_step "Running lint" pnpm lint
fi

if [[ "$RUN_TYPECHECK" == true ]]; then
  run_step "Running type-check" pnpm type-check
fi

if [[ "$RUN_UNIT" == true ]]; then
  run_step "Running changed unit tests" pnpm test:changed
fi

if [[ "$RUN_INTEGRATION" == true ]]; then
  if [[ ${#TARGETED_INTEGRATION_TESTS[@]} -gt 0 ]]; then
    for test_file in "${TARGETED_INTEGRATION_TESTS[@]}"; do
      run_step "Running targeted integration test: $test_file" ./scripts/test-integration.sh "$test_file"
    done
  else
    run_step "Running changed integration tests" ./scripts/test-integration.sh tests/integration --changed
  fi
fi

if [[ $EXIT_CODE -ne 0 ]]; then
  printf '⚠️ Validation finished with failures. Review the step summaries above.\n'
fi

exit $EXIT_CODE