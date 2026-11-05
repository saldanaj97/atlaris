#!/bin/sh
# Stop hook: block finishing while the working tree has changes and no fresh evidence report.
# Report path: .claude/evidence/<branch with / replaced by ->.md
# Fresh = exists, non-empty, and newer than every changed file outside .claude/.
# Exit 2 blocks the stop and feeds stderr back to the agent.

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$root" ] && cd "$root" || exit 0

changed="$(git status --porcelain --untracked-files=all 2>/dev/null | sed 's/^...//' | sed 's/.* -> //' | grep -v '^\.claude/' || true)"
[ -z "$changed" ] && exit 0

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null | tr '/' '-')"
report=".claude/evidence/${branch}.md"

if [ ! -s "$report" ]; then
  echo "Evidence report missing: $report. Write the exact commands you ran and their raw output there, then finish." >&2
  exit 2
fi

echo "$changed" | while IFS= read -r f; do
  [ -e "$f" ] && [ "$f" -nt "$report" ] && { echo "$f"; break; }
done | grep -q . && {
  echo "Evidence report $report is older than your latest change. Rerun the check from the brief and update the report, then finish." >&2
  exit 2
}

exit 0
