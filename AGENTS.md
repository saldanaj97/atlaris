# Workflow Orchestration

## Agent Context

Before implementing or reviewing code, read ENGINEERING_RULES.md at the repository root and follow its applicable guidance.

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

**Design context:** Before introducing UI or changing shared components, tokens, responsive behavior, visual states, interface patterns, marketing copy or brand usage, read `DESIGN.md` then the relevant sections of `docs/styles/design-system.md`. The latter is the canonical intended design specification; current code and tests govern product behavior. Shared foundations are adopted; page and component migration continues. `style-guide.md` is a compatibility pointer, not current design guidance.


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



## Cursor Cloud database

- In Cursor Cloud Agents, run `pnpm db:agent:up` before database work and `pnpm db:agent:status` for diagnosis.
- The agent database is PostgreSQL 17 on task-local loopback only. Never provide it a hosted URL or run `pnpm db:agent:reset` against staging or production.
- Keep the ordinary local OrbStack/Supabase workflow unchanged. See `docs/development/local-database.md` for the environment boundaries and command contracts.



# Core Principles

- Simplicity First: Make every change as simple as possible. Impact minimal code. Strive for elegant solutions, but balance with pragmatism. Don't over-engineer simple fixes.
- No Laziness: Find root causes. No temporary fixes. Senior developer standards.
- Minimal Impact: Only touch what's necessary. No side effects with new bugs.
- Self-Improvement: Learn from mistakes. Update lessons. Iterate until mastered.
- Verification: Prove correctness when it matters — diffs, targeted tests, logs, demos. Full-suite runs follow `.cursor/rules/selective-verification.mdc`, not every small change.
- Autonomy: Take ownership. Fix bugs without hand-holding. Be proactive in finding and resolving issues when they arise.
- Testing: Apply the central selective-verification policy and relevant engineering rules for behavioral coverage.



# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
