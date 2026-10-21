# Workflow Orchestration

## Agent Context

Before implementing or reviewing code, read ENGINEERING_RULES.md at the repository root and follow its applicable guidance.

## Toolchain

- **Lint:** Oxlint, not ESLint. `pnpm lint`; one file: `pnpm exec oxlint <files> --max-warnings=0`. Includes `@shadcn/lint`; see `docs/development/shadcn-lint.md`.
- **Format:** oxfmt, not Prettier. `pnpm exec oxfmt <files>` (`--check` to verify).
- **Typecheck:** `pnpm typecheck` (runs `next typegen`, `tsrs`, then `pnpm check:type:workers` for `workers/jobs`; ignores dev-server types in `.next/dev`).
- **Tests:** `pnpm test unit <paths...>`, `pnpm test integration <paths...>`, or `pnpm test security`; more in `tests/AGENTS.md`.
- **Dev server:** `pnpm dev` (Portless, Webpack; secrets injected by 1Password `op run`). `--ui` runs UI-only Turbopack, `--db` starts Supabase first, `doctor` runs read-only diagnostics. In a linked worktree the URL is `https://<branch>.atlaris.localhost`; `portless get atlaris` prints it.
- **UI checks:** `pnpm exec tsx scripts/dev/tw-classes.ts <classes>` prints the CSS Tailwind generates; `pnpm exec tsx scripts/dev/screenshot.ts <routes>` screenshots the running dev server at several widths in both themes.
- **Paths:** `cn` is `@/lib/utils` (`src/lib/utils/index.ts`).
- **Next.js docs:** read them only when changing Next.js APIs or conventions (routing, data fetching, caching, config). Find a guide by name with `rg --files node_modules/next/dist/docs | rg <topic>`; folders are numbered (`01-app/01-getting-started`, `02-guides`, `03-api-reference`).

## Project documentation (`docs/`)

**Docs index:** `[docs/README.md](docs/README.md)` is the directory of every folder and file under `docs/`. Use it to find and open relevant project docs for the current request — architecture, API contracts, database, development, security, styles, testing, CI/CD, and third-party service notes under `docs/third-party-services/` (Clerk CLI, Portless, etc.).

Before implementing or answering from guesswork when the topic is already documented:

1. Skim `[docs/README.md](docs/README.md)` for matching sections/files.
2. Read only the docs that apply to the request (do not load the whole tree by default).
3. Prefer those docs over inventing setup, contracts, or runbook steps that already exist.

**Keep the index current:** Whenever you add, remove, rename, or move a file or folder under `docs/` (including any subfolder), update `[docs/README.md](docs/README.md)` in the same change — section table entry, description, and the text tree at the bottom. Do not leave the index stale.

## Behavioral guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

**Design context:** Before introducing UI or changing shared components, tokens, responsive behavior, visual states, interface patterns, marketing copy or brand usage, read `DESIGN.md`, then only the chapters of `docs/styles/design-system.md` that its "Find the right chapter" table names. The latter is the canonical intended design specification; current code and tests govern product behavior. Shared foundations and JCS-65 implementation slices are adopted; JCS-65 and JCS-97 were closed on 2026-10-14 without a separate integrated visual-acceptance pass.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- Infer routine reversible choices from the request, prior authorization, and repository evidence. State material assumptions briefly.
- Ask through the available question tool only when missing information materially changes the outcome or authorization is required. Continue independent authorized work while waiting.
- If a simpler approach exists, say so. Push back when warranted.
- Pause only the work that depends on an unresolved decision. Complete the authorized preparation before asking for approval, and do not ask again for permission already given.
- Explicit user instructions override skill defaults, subject to system and developer instructions. A skill does not expand task scope; identify the exact instruction if it would block authorized work.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Verify the affected behavior with the smallest relevant check"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Testing

- `.cursor/rules/selective-verification.mdc` is the single source for verification timing, scope, and stopping criteria. Skills and tool-specific rules defer to it rather than introducing file-count thresholds.
- Use the existing test framework and meaningful regression cases for changed behavior. TDD applies when it helps establish the bug or new contract; avoid tests that mirror implementation or introduce a separate harness.
- Report the checks actually run and their outcomes. A skipped check is not a pass.

## Branches and releases

- Open every PR against `develop`, including each slice of a multi-PR project. Pass `--base develop` to `gh pr create` explicitly; tool defaults target `main`. Never create or target a long-lived track branch (short-lived stacked PRs are fine); put unfinished user-facing behavior behind a fail-closed flag in `src/flags.ts`.
- Open a `develop` → `main` promotion PR only when asked. Promotions are batched (at most daily, or per milestone) and merged with a merge commit, never squash or rebase, so no `main` → `develop` merge-back is needed. Details: `docs/ci/branching-strategy.md`.

## PR review comments

- After reviewing a PR review comment, reply to its thread and resolve it, whether you applied a fix or not. The reply names the fixing commit, or explains why no change was needed.
- Do not leave reviewed threads unanswered or unresolved.
- Push before you reply "fixed". The named commit must be on the remote PR head (`gh pr view --json headRefOid`), not only in your checkout.
- Reply to each thread once. When a bot repeats a finding you already answered, link the earlier reply instead of posting it again.

## Review-correction rules

These cover recurring review findings from the 2025-10 → 2026-10 PR retrospective that `ENGINEERING_RULES.md` and `supabase/AGENTS.md` do not already address.

- **Concurrent writes:** Claim webhooks, jobs and workflow steps with an atomic conditional write (insert on conflict, or compare-and-set), never check-then-act. Never hold a DB transaction or row lock across a network call.
- **Unknown outcomes:** When an email, charge or provider call times out with an unknown result, record it as unknown. Don't mark it sent or failed.
- **Migrations:** Never edit a migration that may already be applied anywhere; add a new version.
- **Errors:** Don't swallow errors with `.catch(() => undefined)`, except best-effort cleanup such as cancelling a stream. Keep "auth unavailable" separate from "signed out", and "missing config" separate from "invalid input". In batch work, one item's failure must not abort the rest.
- **Network calls:** Give every server-side fetch a timeout (`AbortSignal.timeout`, as in `src/lib/jobs-worker/client.ts`). Every polling loop needs an exit condition for success, failure and warning states.
- **Dates:** Format server-rendered dates with an explicit locale and time zone, or render them client-only. Don't compute date bounds from browser-local time during SSR.
- **Truthful UI:** Don't ship placeholder numbers, promises or capabilities the product doesn't deliver. Every button and link must do something real.
- **Semantic markup:** Use `aria-label` only on interactive or landmark elements. Use `<dl>` with `dt`/`dd`. Mark decorative icons `aria-hidden`. Skeletons must match the layout they replace.
- **Reuse:** Before defining a type, component, constant or option list, search for an existing one and import it.

## Cloud agent database

- In cloud agents (Codex and Cursor Cloud), run `pnpm db agent up` before database work. `pnpm db agent status` is the diagnosis command; `pnpm db agent preflight` checks the host first.
- The default backend is the native Supabase stack (`supabase start --runtime native`, this checkout's default stack, loopback only). `up` writes its dynamic `DB_URL` to `.env.local`; `reset` runs `supabase db reset` on that stack only. The first start downloads ~483 MB from GitHub, so it needs outbound access to github.com.
- As root, set `SUPABASE_NATIVE_POSTGRES_USER` to an existing non-root OS user; the native runtime will not run Postgres as root.
- The legacy PostgreSQL 17 path stays available with `ATLARIS_AGENT_DB=postgres` as a legacy switch. There is no automatic fallback.
- Never provide a hosted URL. See `docs/development/local-database.md` for the environment boundaries and command contracts.

# Core Principles

- Simplicity First: Make every change as simple as possible. Impact minimal code. Strive for elegant solutions, but balance with pragmatism. Don't over-engineer simple fixes.
- No Laziness: Find root causes. No temporary fixes. Senior developer standards.
- Minimal Impact: Only touch what's necessary. No side effects with new bugs.
- Self-Improvement: Learn from mistakes. Iterate until mastered.
- Verification: Prove correctness when it matters — diffs, targeted tests, logs, demos. Full-suite runs follow `.cursor/rules/selective-verification.mdc`, not every small change.
- Autonomy: Take ownership. Fix bugs without hand-holding. Be proactive in finding and resolving issues when they arise.
- Testing: Apply the central selective-verification policy and relevant engineering rules for behavioral coverage.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
