#!/usr/bin/env bash
set -euo pipefail

remediation_cli="${1:?missing remediation CLI path}"
output="${2:?missing audit output path}"

for attempt in 1 2 3; do
  rm -f "$output" "$output.stderr" "$output.status"
  set +e
  timeout 60s pnpm audit --prod --audit-level=high --json > "$output" 2> "$output.stderr"
  command_status=$?
  set -e
  if [ ! -s "$output" ] || [ "$command_status" -eq 124 ] || [ "$command_status" -eq 137 ] || { [ "$command_status" -ne 0 ] && [ "$command_status" -ne 1 ]; }; then
    if [ "$attempt" -lt 3 ]; then sleep "$attempt"; fi
    continue
  fi
  set +e
  node "$remediation_cli" audit-status --file "$output" > "$output.status"
  parser_status=$?
  set -e
  if [ "$command_status" -eq 0 ] && [ "$parser_status" -eq 0 ]; then
    echo clean > "$output.result"
    exit 0
  fi
  if [ "$command_status" -eq 1 ] && [ "$parser_status" -eq 1 ]; then
    echo vulnerable > "$output.result"
    exit 0
  fi
  if [ "$attempt" -lt 3 ]; then sleep "$attempt"; fi
done

echo registry-error > "$output.result"
exit 1
