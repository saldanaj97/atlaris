#!/bin/sh
# PreToolUse (Bash) hook: this session may not run git push or bypass hooks with --no-verify.
# The user pushes by hand. Exit 2 blocks the call and feeds stderr back to the agent.

input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)"
if [ -n "$cmd" ]; then
  # Join backslash-newline continuations, then mark every remaining newline with the control
  # character US (0x1f). The awk pass below turns a marker into `;` (a command separator) outside
  # quotes and into a space inside quotes or $(...), so a flag on the same command still matches
  # across a multi-line message or heredoc, while `git commit -m x` newline `head -n 5` stays two
  # commands.
  cmd="$(printf '%s' "$cmd" | awk '{ if (sub(/\\$/, "")) printf "%s ", $0; else printf "%s%c", $0, 31 }')"
else
  # jq missing or payload unparseable: scan the raw payload instead of failing open. Newlines
  # are the two characters \n here, and a continuation is backslash plus \n (four characters).
  # JSON-escaped quotes (\") become plain quotes and escaped backslashes (\\) become one, so
  # quoted values and \git parse like the jq path.
  raw="$input"
  # Keep only the command string when the payload has one: drop everything up to
  # "command":" and everything from the first unescaped quote on, so the JSON's own quotes do
  # not confuse the quote tracking below.
  if printf '%s' "$raw" | grep -Eq '"command"[[:space:]]*:[[:space:]]*"'; then
    raw="$(printf '%s' "$raw" | sed -E -e 's/^.*"command"[[:space:]]*:[[:space:]]*"//' -e 's/^(([^"\\]|\\.)*)".*$/\1/')"
  fi
  us="$(printf '\037')"
  cmd="$(printf '%s' "$raw" | sed -e 's/\\\\\\n/ /g' -e "s/\\\\n/$us/g" -e 's/\\"/"/g' -e 's/\\\\/\\/g')"
fi
[ -z "$cmd" ] && exit 0

# Drop commit-message arguments that cannot execute anything so words inside a message do not
# trigger the checks. Quotes are tracked left to right, so only a real opening quote that
# directly follows a standalone -m / -am / --message flag is stripped, and only when the string
# is single-quoted or double-quoted without $, a backtick or a backslash. A closing quote is never
# mistaken for an opening one, and flags like -cm (bash -c) are not treated as message flags.
# Anything this cannot parse stays in the scan, so it errs toward blocking.
scan="$(printf '%s' "$cmd" | awk '
BEGIN { sq = sprintf("%c", 39); dq = "\""; us = sprintf("%c", 31) }
{
  s = $0; n = length(s); out = ""; i = 1; depth = 0; bt = 0
  while (i <= n) {
    c = substr(s, i, 1)
    if (c == "\\") { out = out substr(s, i, 2); i += 2; continue }
    # A newline marker outside quotes separates commands; inside $(...) or backticks it stays a
    # space so a heredoc message does not cut the command in two.
    if (c == us) { out = out ((depth > 0 || bt) ? " " : ";"); i++; continue }
    if (c == "$" && substr(s, i + 1, 1) == "(") { depth++; out = out "$("; i += 2; continue }
    if (c == ")" && depth > 0) depth--
    if (c == "`") bt = !bt
    if (c == sq || c == dq) {
      # $'...' is ANSI-C quoting: a backslash escapes the next character, even a single quote.
      ansi = (c == sq && i > 1 && substr(s, i - 1, 1) == "$")
      j = i + 1; closed = 0
      while (j <= n) {
        d = substr(s, j, 1)
        if ((c == dq || ansi) && d == "\\") { j += 2; continue }
        # Inside "...", a $(...) is its own shell context: skip to its matching ) so quotes in a
        # heredoc message ("$(cat <<'EOF' ... say "hi ... EOF )") do not end the string early.
        if (c == dq && d == "$" && substr(s, j + 1, 1) == "(") {
          pd = 1; j += 2
          while (j <= n && pd > 0) { e = substr(s, j, 1); if (e == "(") pd++; else if (e == ")") pd--; j++ }
          continue
        }
        if (d == c) { closed = 1; break }
        j++
      }
      if (!closed) { out = out substr(s, i); i = n + 1; continue }
      body = substr(s, i + 1, j - i - 1)
      if (out ~ /(^|[ \t])(-[asSvq]*m|--message)[ \t=]*$/ && (c == sq || body !~ /[$`\\]/)) out = out c "X" c
      else if (body ~ /^[A-Za-z0-9._=\/-]*$/) {
        # A quoted word with nothing special in it is the same word to the shell: git 'push',
        # commit '--no-verify', pu'sh', g''it, $'push'. Emit it unquoted.
        if (c == sq && substr(out, length(out), 1) == "$") out = substr(out, 1, length(out) - 1)
        out = out body
      }
      else out = out substr(s, i, j - i + 1)
      i = j + 1; continue
    }
    out = out c; i++
  }
  gsub(us, " ", out)
  print out
}')"
[ -z "$scan" ] && scan="$(printf '%s' "$cmd" | tr '\037' ';')"

# Undo backslash escapes before a letter (\git, g\it, gi\t, pu\sh); the awk pass above already
# unquoted simple quoted words. `scan` strips every such escape. `scan_b` keeps \n, \r and \t
# as written, because a string fed to another shell (printf 'x\ngit push' | sh, sh -c $'x\ngit
# push') turns \n into a real command separator that the `lead` pattern recognizes. Both are
# checked. Aliases and variables are not normalized.
scan_b="$(printf '%s' "$scan" | sed -E -e 's/\\([A-Za-mo-qsu-z])/\1/g')"
scan="$(printf '%s' "$scan" | sed -E -e 's/\\([A-Za-z])/\1/g')"

# A git command (optionally path-qualified) at the start of a command, after a shell operator,
# inside a quoted shell string or subshell (sh -c "git push", $(git push)), or after a
# JSON-escaped newline (\n) when the raw payload is scanned without jq.
lead='(^|\\[nrt]|[;&|(`"'"'"'[:space:]])([^[:space:];&|()`"'"'"']*/)?git'

# Quoted strings are opaque: one quoted string, whatever it contains (spaces, ; & |), is a single
# token, and a value may mix bare text with quoted parts (-c user.name="A B"). `gap` is the text
# between a git command and a later flag, and `val` is the value of a git global option. A
# separator inside a quoted message must not end the gap, and a quoted value with a space
# (git -C "/a b" push) must not split. A $(...) or backtick substitution is also one token, so a
# `;` inside a heredoc message ahead of a flag cannot end the gap. Redirections that contain &
# (2>&1, >&2, &>) are not command separators, so `gap` steps over them.
gap='([^;&|"'"'"'\\]|\\.|[<>]&[0-9-]*|&>>?|[$]\(([^()]|\([^()]*\))*\)|`[^`]*`|"([^"\\$]|\\.|[$]\(([^()]|\([^()]*\))*\)|[$])*"|[$]'"'"'([^'"'"'\\]|\\.)*'"'"'|'"'"'[^'"'"']*'"'"')*'
val='(("([^"\\$]|\\.|[$]\(([^()]|\([^()]*\))*\)|[$])*"|[$]'"'"'([^'"'"'\\]|\\.)*'"'"'|'"'"'[^'"'"']*'"'"'|[$]\(([^()]|\([^()]*\))*\)|`[^`]*`|\\.|[^[:space:]"'"'"'`\\])+)'

# What may directly follow a matched word: whitespace, end of input, or a shell delimiter.
end='([[:space:]]|$|["'"'"';&|)`<>}\\])'

# --no-verify as an argument of a git command, including the abbreviations git accepts
# (--no-veri, --no-verif). Does not match `rg -- --no-verify` or `git log --grep=--no-verify`.
no_verify="$lead"'[[:space:]]('"$gap"'[[:space:]])?--no-veri(f(y)?)?'"$end"

# Only git global options between `git` and the subcommand.
git_opts='([[:space:]]+(-[cC][[:space:]]+'"$val"'|--(git-dir|work-tree|namespace|exec-path|config-env|attr-source)[[:space:]]+'"$val"'|--?[A-Za-z][A-Za-z-]*(='"$val"')?))*'

# `git commit -n` is the short form of --no-verify, alone or inside a flag cluster (-an, -nm).
# Only flags that take no value may come before the n: in -uno or -mnote the n belongs to a value.
# Scoped to commit: `git push -n` is --dry-run and `git log -n 5` is a count.
no_verify_short="$lead$git_opts"'[[:space:]]+commit[[:space:]](('"$gap"')[[:space:]])?-[aeiopqsvz]*n[A-Za-z]*'"$end"

# git + only git global options + push. Does not match `git log --grep push`.
# Shell aliases and variable indirection are not caught.
git_push="$lead$git_opts"'[[:space:]]+push'"$end"

hit() { printf '%s' "$scan" | grep -Eq -- "$1" || printf '%s' "$scan_b" | grep -Eq -- "$1"; }

if hit "$no_verify" || hit "$no_verify_short"; then
  echo "Blocked: --no-verify skips the hooks. Fix the failing hook instead." >&2
  exit 2
fi

if hit "$git_push"; then
  echo "Blocked: this session cannot run git push. Tell the user the branch is ready and let them push." >&2
  exit 2
fi

exit 0
