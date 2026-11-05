#!/bin/sh
# PreToolUse (Bash) hook: this session may not run git push or bypass hooks with --no-verify.
# The user pushes by hand. Exit 2 blocks the call and feeds stderr back to the agent.

input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)"
# jq missing or payload unparseable: scan the raw payload instead of failing open.
[ -z "$cmd" ] && cmd="$input"
[ -z "$cmd" ] && exit 0

if printf '%s' "$cmd" | grep -Eq -- '--no-verify'; then
  echo "Blocked: --no-verify skips the hooks. Fix the failing hook instead." >&2
  exit 2
fi

if printf '%s' "$cmd" | grep -Eq '(^|[;&|(`"[:space:]])git([[:space:]]+(-[^[:space:]]+|-C[[:space:]]+[^[:space:]]+))*[[:space:]]+push([[:space:]]|$)'; then
  echo "Blocked: this session cannot run git push. Tell the user the branch is ready and let them push." >&2
  exit 2
fi

exit 0
