#!/bin/sh
# PreToolUse (Bash) hook: `gh pr create` and `gh pr merge` need a quiz pass for the PR's head
# commit (.claude/quiz-pass/<sha>). Only the user's 5/5 quiz writes that file.
# Exit 2 blocks the call and feeds stderr back to the agent. Anything this cannot resolve blocks.
#
# Checked before the command runs, so the check uses this project's current HEAD and branch:
# a `cd`, `git switch` or `GH_REPO=` earlier in the same command is not followed, and
# `gh pr merge --auto` is checked against the head at the time it is enabled.
# Not caught: gh aliases (`gh alias set`), `gh api` calls, and shell aliases. Text that merely
# mentions `gh pr create` (a commit message, a search) also blocks; move that text to a file.

quiz_help() {
  cat >&2 <<'EOF'
Run the quiz in this session before retrying:
- Ask the user 5 questions about this commit's diff: 4 on random lines of the diff, 1 on what
  breaks if your main assumption is wrong.
- The user answers in their own words. Give no hints and never show answers before they answer.
- Grade against the diff and show the right line for every miss.
- Only a 5/5 score lets you write the empty pass file .claude/quiz-pass/<full commit sha>.
  Never write a pass file for any other reason, and never for a commit you did not quiz on.
EOF
}

block() {
  echo "Blocked: $1" >&2
  quiz_help
  exit 2
}

input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)" || cmd=""
if [ -z "$cmd" ]; then
  # jq missing or payload unparseable: block anything that looks like a PR create or merge.
  if printf '%s' "$input" | grep -Eq 'gh.*pr.*(create|new|merge)'; then
    block "could not parse the command to check for gh pr create/merge."
  fi
  exit 0
fi

# Normalize what the shell would: drop backslash-newline continuations, undo backslash escapes
# before a letter (g\h), and unquote quoted words with nothing special in them ('gh', g""h).
cmd="$(printf '%s\n' "$cmd" | awk '{ if (sub(/\\$/, "")) printf "%s", $0; else printf "%s\n", $0 }' |
  sed -E -e 's/\\([A-Za-z])/\1/g' -e "s/'([A-Za-z0-9._\/:-]*)'/\1/g" -e 's/"([A-Za-z0-9._\/:-]*)"/\1/g')"

# Fast path: nothing gh-related.
printf '%s' "$cmd" | grep -qi 'gh' || exit 0

# gh reached through a substitution or variable ($(command -v gh) pr merge, ${GH:-gh} pr create).
if printf '%s' "$cmd" | grep -Eiq 'gh[^[:space:]]*[)}][[:space:]]+pr[[:space:]]+(create|new|merge)([[:space:]]|$)'; then
  block "gh pr create/merge through a substitution or variable cannot be checked. Call gh directly."
fi

# Find every `gh pr <subcommand>` and print one line per create/merge:
#   kind US repo US arg   (arg = --head value for create, PR selector for merge)
# Words are read shell-style: quotes join, a backslash escapes. A word ends at whitespace or an
# unquoted ; & | ) ` or newline. When gh follows a quote (sh -c "gh pr merge 1"), that quote
# character also ends the command.
calls="$(printf '%s' "$cmd" | awk '
BEGIN {
  RS = "\001"; sq = sprintf("%c", 39); dq = "\""; us = sprintf("%c", 31)
  re = "(^|[;&|(`\"" sq " \t\n\\\\])([^ \t\n;&|()`\"" sq "]*/)?gh[ \t]+pr([ \t]|$)"
}
function stop(c) { return c == " " || c == "\t" || c == "\n" || c == ";" || c == "&" || c == "|" || c == ")" || c == "`" }
{
  s = $0; n = length(s); pos = 1
  while (pos <= n && match(substr(s, pos), re)) {
    start = pos + RSTART - 1
    lead = substr(s, start, 1)
    encl = (lead == sq || lead == dq) ? lead : ""
    i = start + RLENGTH
    pos = i
    split("", tok); nt = 0; done = 0
    while (i <= n && !done) {
      c = substr(s, i, 1)
      if (c == " " || c == "\t") { i++; continue }
      if (stop(c) || c == encl) break
      w = ""
      while (i <= n) {
        c = substr(s, i, 1)
        if (stop(c)) break
        if (c == encl) { done = 1; break }
        if (c == "\\") { w = w substr(s, i + 1, 1); i += 2; continue }
        if (c == sq || c == dq) {
          j = index(substr(s, i + 1), c)
          if (j == 0) { w = w substr(s, i + 1); i = n + 1; break }
          w = w substr(s, i + 1, j - 1); i += j + 1; continue
        }
        w = w c; i++
      }
      tok[++nt] = w
    }
    # Persistent flags may sit between pr and the subcommand.
    repo = ""; k = 1
    while (k <= nt && tok[k] ~ /^-/) {
      if (tok[k] == "-R" || tok[k] == "--repo") { repo = tok[k + 1]; k += 2 }
      else { if (tok[k] ~ /^--repo=/) repo = substr(tok[k], 8); k++ }
    }
    sub_ = tok[k]
    if (sub_ != "create" && sub_ != "new" && sub_ != "merge") continue
    kind = (sub_ == "merge") ? "merge" : "create"
    if (kind == "merge") valflags = " -A --author-email -b --body -F --body-file -t --subject --match-head-commit -R --repo "
    else valflags = " -a --assignee -B --base -b --body -F --body-file -H --head -l --label -m --milestone -p --project --recover -r --reviewer -T --template -t --title -R --repo "
    arg = ""
    for (k++; k <= nt; k++) {
      t = tok[k]
      if (t == "--") { if (kind == "merge" && arg == "" && k < nt) arg = tok[k + 1]; break }
      if (t ~ /^--[A-Za-z-]+=/) {
        f = substr(t, 1, index(t, "=") - 1); v = substr(t, index(t, "=") + 1)
        if (f == "--repo") repo = v
        if (f == "--head" && kind == "create") arg = v
        continue
      }
      if (t ~ /^-/) {
        if (index(valflags, " " t " ")) {
          v = tok[k + 1]; k++
          if (t == "-R" || t == "--repo") repo = v
          if (kind == "create" && (t == "-H" || t == "--head")) arg = v
        }
        continue
      }
      if (kind == "merge" && arg == "") arg = t
    }
    print kind us repo us arg
  }
}')" || block "could not parse the command to check for gh pr create/merge."

[ -z "$calls" ] && exit 0

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$root" ] && cd "$root" || block "cannot find the project root to look for quiz passes."
passdir="$root/.claude/quiz-pass"
us="$(printf '\037')"
ghbin="$(command -v gh 2>/dev/null || echo /opt/homebrew/bin/gh)"

printf '%s\n' "$calls" | {
  while IFS="$us" read -r kind repo arg; do
    if [ "$kind" = "create" ]; then
      if [ -n "$arg" ]; then
        branch="${arg#*:}"
        sha="$(git rev-parse --verify -q "refs/heads/$branch^{commit}" 2>/dev/null ||
          git rev-parse --verify -q "refs/remotes/origin/$branch^{commit}" 2>/dev/null)"
        what="gh pr create (--head $arg)"
      else
        sha="$(git rev-parse --verify -q 'HEAD^{commit}' 2>/dev/null)"
        what="gh pr create (HEAD)"
      fi
    else
      set -- pr view
      [ -n "$arg" ] && set -- "$@" "$arg"
      [ -n "$repo" ] && set -- "$@" --repo "$repo"
      # Bounded below the hook timeout so a hung gh blocks instead of timing the hook out.
      sha="$(perl -e 'alarm 10; exec @ARGV' "$ghbin" "$@" --json headRefOid -q .headRefOid </dev/null 2>/dev/null)"
      what="gh pr merge ${arg:-(current branch)}"
    fi
    if ! printf '%s' "$sha" | grep -Eq '^[0-9a-f]{40}$'; then
      echo "Blocked: cannot resolve the head commit for $what (git rev-parse or gh pr view failed), so the quiz pass cannot be checked." >&2
      echo "If the command only mentions it in text (a message or a search), move that text to a file." >&2
      exit 2
    fi
    if [ ! -f "$passdir/$sha" ]; then
      echo "Blocked: $what needs a quiz pass for head commit $sha (.claude/quiz-pass/$sha)." >&2
      exit 2
    fi
  done
  exit 0
}
status=$?
[ "$status" -eq 0 ] && exit 0
quiz_help
exit 2
