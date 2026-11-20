---
name: delete-comment
description: Audit and delete code comments in a directory, categorize each (Tautology, Excuse, Stale, Decision Record), file issues, write ADRs, and ratchet the comment ban. Use when asked to clean up comments, shrink the comment baseline, or extend the ban to a new directory.
---

# delete-comment

Comments are banned in `src/` by the `atlaris-comments/no-comments` Oxlint rule (`scripts/lint/no-comments-plugin.mjs`). Comments that existed when the ban landed are listed in `scripts/lint/comment-baseline.json`. That file may only shrink. Lint directives (`oxlint-`, `eslint-`, `react-doctor-`, `@ts-`, `@vitest-`, `@jsx`, `@license`, `#__PURE__`, `/// <reference`) are always allowed.

Use this skill to (a) work the baseline down, or (b) repeat the whole process for another directory.

## The four categories

| Category | Test | Action |
| --- | --- | --- |
| Tautology | Repeats what the code, name or type already shows. "Props for X", `@param id - the id`, section banners. | Delete. |
| Excuse | Justifies a hack, a placeholder, a swallowed error, a test-only branch, or work deferred "until X". | Delete, and file a Linear issue (team DEV) for the real fix. Group related sites into one issue. |
| Stale | Describes behavior or code that no longer exists, or narrates history ("used to", "adapted from the retired page"). | Delete. |
| Decision Record | Explains why: a constraint, the failure it prevents, a rejected alternative, a security or cost reason. | Move the text into an ADR in `docs/adr/`, then delete. |

When unsure between Tautology and Decision Record, treat it as a Decision Record. Losing a rationale costs more than an extra ADR line. A comment that is the only content of an empty block (`catch {}`) explains why the block is empty; record it in the "Intentionally swallowed errors" ADR. If you cannot decide, leave it in the baseline and say so.

## Process

1. Branch from `develop` (`chore/...`, never `claude/...`). Use Node 24.
2. Inventory: `pnpm comments:inventory <out.json>`. It lists every non-directive comment as a logical comment (consecutive `//` lines are joined) with byte offsets, text, and a `hint` (`tautology?`, `decision?`, `review`). Hints are a starting point only. Read the comments.
3. Categorize every entry. Write the table (file, lines, category, action, text) somewhere reviewable, such as the project files folder. Post the counts to whoever asked before deleting.
4. Excuse: create the Linear issues first, so each comment's text is captured before it is deleted.
5. Decision Record: add the text to the matching ADR in `docs/adr/` (or create the next numbered one). Keep Status, Context, Decisions, Consequences. Update `docs/adr/README.md` and the tree in `docs/README.md`.
6. Delete: write a plan `{ "delete": [{ "file", "start", "end" }] }` from the inventory offsets for every Tautology, Stale, Excuse and Decision Record entry, then `pnpm comments:apply <plan.json>`. It removes whole comment lines, trailing comments and empty JSX `{/* */}` containers. Then run `pnpm exec oxfmt` on the changed files to collapse orphaned blank lines.
7. Shrink the baseline: `pnpm lint:comments:update`. It refuses to add entries. Never edit `comment-baseline.json` by hand to add a comment.
8. Verify: `pnpm lint`, `pnpm lint:comments`, `pnpm typecheck`, `pnpm test unit`. The diff must be comment-only, plus the ADRs, baseline and docs. Spot-check the diff for empty blocks, JSX, and lines that oxfmt reflowed.
9. Extending to a new directory: add it to `COMMENT_ROOT` handling in `scripts/lint/comments/shared.mjs` (and the rule's path check), run `node scripts/lint/comments/baseline.mjs --init` once to snapshot what remains, then delete as above.
10. Estimate lines shed by applying the all-comments plan on a scratch checkout and reading `git diff --shortstat`. Report comment-only lines, shared-line comments, and orphaned blank lines separately.

## Rules

- Comment-only diff. Do not change behavior, rename, or tidy unrelated code.
- No Claude attribution in commits or PR bodies. Commit as the repo owner. See `AGENTS.md`.
- A new non-obvious decision goes in an ADR, never in a comment. Lint will fail the comment.
