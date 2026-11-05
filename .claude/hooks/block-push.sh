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

# git (optionally path-qualified) + only git global options + push. Matches inside quoted
# shell strings and subshells (sh -c "git push", $(git push)) and after a JSON-escaped newline
# (\n) when the raw payload is scanned without jq; does not match commit messages
# or `git log --grep push`. Shell aliases and variable indirection are not caught.
git_push='(^|\\[nrt]|[;&|(`"'"'"'[:space:]])([^[:space:];&|()`"'"'"']*/)?git([[:space:]]+(-[cC][[:space:]]+[^[:space:]]+|--(git-dir|work-tree|namespace|exec-path)[[:space:]]+[^[:space:]]+|--?[A-Za-z][A-Za-z-]*(=[^[:space:]]+)?))*[[:space:]]+push([[:space:]]|$|["'"'"';&|)\\])'
if printf '%s' "$cmd" | grep -Eq -- "$git_push"; then
  echo "Blocked: this session cannot run git push. Tell the user the branch is ready and let them push." >&2
  exit 2
fi

exit 0
