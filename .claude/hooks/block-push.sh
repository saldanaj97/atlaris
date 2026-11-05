#!/bin/sh
# PreToolUse (Bash) hook: this session may not run git push or bypass hooks with --no-verify.
# The user pushes by hand. Exit 2 blocks the call and feeds stderr back to the agent.

input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)"
# jq missing or payload unparseable: scan the raw payload instead of failing open.
[ -z "$cmd" ] && cmd="$input"
[ -z "$cmd" ] && exit 0

# Drop commit-message arguments that cannot execute anything (single-quoted, or double-quoted
# without $ or a backtick) so words inside a message do not trigger the checks. Anything this
# cannot parse (multi-line or escaped messages, the raw no-jq payload) stays in the scan and
# errs toward blocking.
scan="$(printf '%s' "$cmd" | sed -E "s/(-[A-Za-z]*m|--message)[[:space:]=]*'[^']*'/\1 X/g; s/(-[A-Za-z]*m|--message)[[:space:]=]*\"[^\"\$\`]*\"/\1 X/g")"

# A git command (optionally path-qualified) at the start of a command, after a shell operator,
# inside a quoted shell string or subshell (sh -c "git push", $(git push)), or after a
# JSON-escaped newline (\n) when the raw payload is scanned without jq.
lead='(^|\\[nrt]|[;&|(`"'"'"'[:space:]])([^[:space:];&|()`"'"'"']*/)?git'

# --no-verify as an argument of a git command. Does not match `rg -- --no-verify` or
# `git log --grep=--no-verify`.
no_verify="$lead"'[[:space:]]([^;&|]*[[:space:]])?--no-verify([[:space:]]|$|["'"'"';&|)\\])'

# git + only git global options + push. Does not match `git log --grep push`.
# Shell aliases and variable indirection are not caught.
git_push="$lead"'([[:space:]]+(-[cC][[:space:]]+[^[:space:]]+|--(git-dir|work-tree|namespace|exec-path)[[:space:]]+[^[:space:]]+|--?[A-Za-z][A-Za-z-]*(=[^[:space:]]+)?))*[[:space:]]+push([[:space:]]|$|["'"'"';&|)\\])'

if printf '%s' "$scan" | grep -Eq -- "$no_verify"; then
  echo "Blocked: --no-verify skips the hooks. Fix the failing hook instead." >&2
  exit 2
fi

if printf '%s' "$scan" | grep -Eq -- "$git_push"; then
  echo "Blocked: this session cannot run git push. Tell the user the branch is ready and let them push." >&2
  exit 2
fi

exit 0
