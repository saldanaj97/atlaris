#!/bin/sh
# PreToolUse (Bash) hook: `gh pr create` and `gh pr merge` need a quiz pass for the PR's head
# commit (.claude/quiz-pass/<sha>). Only the user's 5/5 quiz writes that file. The pass counts
# from any worktree of the repo. A PR whose every changed file is a test file or CI config needs
# no pass file (is_skippable below).
# Exit 2 blocks the call and feeds stderr back to the agent. Anything this cannot resolve blocks.
#
# The repo checked is the one the command runs in: the session's cwd, or the last `cd <path>`
# before gh in the same command. Its HEAD (or --head branch) and its .claude/quiz-pass/ are used.
# -R/--repo must name one of that repo's remotes; otherwise the call blocks (cd into it first).
# Checked before the command runs: a `git switch` or `GH_REPO=` earlier in the same command is
# not followed, and `gh pr merge --auto` is checked against the head at the time it is enabled.
# Not caught: gh aliases (`gh alias set`), `gh api` calls, and shell aliases. Text that merely
# mentions `gh pr create` (a commit message, a search) also blocks; move that text to a file.

quiz_help() {
  cat >&2 <<'EOF'
Run the quiz in this session before retrying, with the AskUserQuestion tool:
- Ask the user 5 questions about this commit's diff: 4 on random lines of the diff, 1 on what
  breaks if your main assumption is wrong.
- Ask questions 1-4 in one AskUserQuestion call, then question 5 in a second call. Every
  question gets the same two options: "I don't know (counts as a miss)" and "Stop the quiz
  (no pass this round)". Never put a candidate answer in an option, label, description or
  preview. The user answers in their own words through the free-text Other field.
- Give no hints and never show answers before the user answers.
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

# A pass file is keyed by the full commit sha, so it counts wherever it was written: in the
# checkout the command runs in, or in any other worktree of the same repo (the main checkout
# included). Without this, a pass written in one worktree is invisible from another.
have_pass() { # root sha
  [ -f "$1/.claude/quiz-pass/$2" ] && return 0
  _wts="$(git -C "$1" worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p')"
  while IFS= read -r _w; do
    [ -n "$_w" ] && [ -f "$_w/.claude/quiz-pass/$2" ] && return 0
  done <<EOF
$_wts
EOF
  return 1
}

# True when every file changed between $3 and its merge base with $2 is a test file, or CI config.
# Any failure (no merge base, git error, empty list) returns false, so the quiz is required.
is_skippable() { # root base-ref head-sha
  _mb="$(git -C "$1" merge-base "$3" "$2" 2>/dev/null)" || return 1
  [ -n "$_mb" ] || return 1
  _files="$(git -C "$1" diff --name-only --no-renames "$_mb" "$3" 2>/dev/null)" || return 1
  [ -n "$_files" ] || return 1
  _ok=0
  while IFS= read -r _p; do
    _b="${_p##*/}"
    case "$_b" in
      *.test.*|*.spec.*) continue ;;
    esac
    case "$_p" in
      tests/*|scripts/tests/*|*/__tests__/*|*/__mocks__/*|*/__snapshots__/*) continue ;;
      .github/*|.circleci/*|codecov.yml) continue ;;
    esac
    _ok=1
    break
  done <<EOF
$_files
EOF
  [ "$_ok" -eq 0 ]
}

# Find every `gh pr <subcommand>` and print one line per create/merge:
#   kind US repo US arg US dir US base   (arg = --head value for create, PR selector for merge;
#                                 dir = path of the last `cd` before this gh, if any;
#                                 base = --base value for create)
# Words are read shell-style: quotes join, a backslash escapes. A word ends at whitespace or an
# unquoted ; & | ) ` or newline. When gh follows a quote (sh -c "gh pr merge 1"), that quote
# character also ends the command.
calls="$(printf '%s' "$cmd" | awk '
BEGIN {
  RS = "\001"; sq = sprintf("%c", 39); dq = "\""; us = sprintf("%c", 31)
  re = "(^|[;&|(`\"" sq " \t\n\\\\])([^ \t\n;&|()`\"" sq "]*/)?gh[ \t]+pr([ \t]|$)"
  cdre = "(^|[;&|( \t\n])cd[ \t]+[^;&|) \t\n]+"
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
    # The last `cd <path>` before this gh sets the directory it runs in.
    pre = substr(s, 1, start); dir = ""
    while (match(pre, cdre)) {
      d = substr(pre, RSTART, RLENGTH); sub(/^[;&|( \t\n]?cd[ \t]+/, "", d)
      gsub(sq, "", d); gsub(dq, "", d); dir = d
      pre = substr(pre, RSTART + RLENGTH)
    }
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
    arg = ""; base = ""
    for (k++; k <= nt; k++) {
      t = tok[k]
      if (t == "--") { if (kind == "merge" && arg == "" && k < nt) arg = tok[k + 1]; break }
      if (t ~ /^--[A-Za-z-]+=/) {
        f = substr(t, 1, index(t, "=") - 1); v = substr(t, index(t, "=") + 1)
        if (f == "--repo") repo = v
        if (f == "--head" && kind == "create") arg = v
        if (f == "--base" && kind == "create") base = v
        continue
      }
      if (t ~ /^-/) {
        if (index(valflags, " " t " ")) {
          v = tok[k + 1]; k++
          if (t == "-R" || t == "--repo") repo = v
          if (kind == "create" && (t == "-H" || t == "--head")) arg = v
          if (kind == "create" && (t == "-B" || t == "--base")) base = v
        }
        continue
      }
      if (kind == "merge" && arg == "") arg = t
    }
    print kind us repo us arg us dir us base
  }
}')" || block "could not parse the command to check for gh pr create/merge."

[ -z "$calls" ] && exit 0

# Directory the Bash command starts in: the payload's cwd, else the project dir.
base="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)"
[ -n "$base" ] || base="${CLAUDE_PROJECT_DIR:-$(pwd)}"
us="$(printf '\037')"
ghbin="$(command -v gh 2>/dev/null || echo /opt/homebrew/bin/gh)"

# owner/name from a remote URL or a --repo value (o/r, host/o/r, https://host/o/r.git, git@host:o/r).
slug() { printf '%s' "$1" | sed -E -e 's#\.git$##' -e 's#/+$##' -e 's#^.*[:/]([^/:]+/[^/:]+)$#\1#' | tr 'A-Z' 'a-z'; }

printf '%s\n' "$calls" | {
  while IFS="$us" read -r kind repo arg dir pbase; do
    what="gh pr $kind${arg:+ $arg}${dir:+ (after cd $dir)}"
    # Resolve the repo the command runs in. A path the hook cannot follow (a variable) blocks.
    wd="$base"
    if [ -n "$dir" ]; then
      case "$dir" in
        "~") wd="$HOME" ;;
        "~/"*) wd="$HOME/${dir#\~/}" ;;
        /*) wd="$dir" ;;
        *) wd="$base/$dir" ;;
      esac
    fi
    root="$(git -C "$wd" rev-parse --show-toplevel 2>/dev/null)"
    if [ -z "$root" ]; then
      echo "Blocked: $what: cannot find the git repo it runs in ($wd), so the quiz pass cannot be checked." >&2
      exit 2
    fi
    if [ -n "$repo" ]; then
      want="$(slug "$repo")"
      if ! git -C "$root" remote -v 2>/dev/null | awk '{ print $2 }' | sort -u |
        while read -r url; do [ "$(slug "$url")" = "$want" ] && echo match; done | grep -q match; then
        echo "Blocked: $what targets --repo $repo, which is not a remote of $root. cd into a local clone of $repo first." >&2
        exit 2
      fi
    fi
    if [ "$kind" = "create" ]; then
      if [ -n "$arg" ]; then
        branch="${arg#*:}"
        sha="$(git -C "$root" rev-parse --verify -q "refs/heads/$branch^{commit}" 2>/dev/null ||
          git -C "$root" rev-parse --verify -q "refs/remotes/origin/$branch^{commit}" 2>/dev/null)"
      else
        sha="$(git -C "$root" rev-parse --verify -q 'HEAD^{commit}' 2>/dev/null)"
      fi
    else
      set -- pr view
      [ -n "$arg" ] && set -- "$@" "$arg"
      [ -n "$repo" ] && set -- "$@" --repo "$repo"
      # Bounded below the hook timeout so a hung gh blocks instead of timing the hook out.
      view="$(cd "$root" && perl -e 'alarm 10; exec @ARGV' "$ghbin" "$@" --json headRefOid,baseRefName -q '.headRefOid + " " + .baseRefName' </dev/null 2>/dev/null)"
      sha="${view%% *}"
      pbase="${view#* }"
      [ "$pbase" = "$view" ] && pbase=""
    fi
    passdir="$root/.claude/quiz-pass"
    if ! printf '%s' "$sha" | grep -Eq '^[0-9a-f]{40}$'; then
      echo "Blocked: cannot resolve the head commit for $what (git rev-parse or gh pr view failed), so the quiz pass cannot be checked." >&2
      echo "If the command only mentions it in text (a message or a search), move that text to a file." >&2
      exit 2
    fi
    if have_pass "$root" "$sha"; then continue; fi
    # PRs that only change test or CI-config files need no pass. Base: --base (create) or
    # baseRefName (merge), else develop.
    baseref="origin/${pbase:-develop}"
    if is_skippable "$root" "$baseref" "$sha"; then
      echo "Quiz skipped for $what: every file changed against $baseref is a test or CI-config file." >&2
      continue
    fi
    echo "Blocked: $what needs a quiz pass for head commit $sha ($passdir/$sha, or the same file in another worktree of this repo)." >&2
    exit 2
  done
  exit 0
}
status=$?
[ "$status" -eq 0 ] && exit 0
quiz_help
exit 2
