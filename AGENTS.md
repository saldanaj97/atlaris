# Workflow Orchestration

## Overview

**Agent memory:** Recurring preferences and durable workspace facts live in `.agents/plans/lessons.md`. Read that file whenever you read or apply this file.

Repo-writable planning artifacts are local-only and belong under `.agents/plans/`. Use that directory for PRDs, plans, todos, trackers, and lessons learned. Do not create or update planning artifacts under legacy `prds/`, legacy `.plans/`, or Cursor-native `.cursor/plans/` unless the user explicitly asks for that path; `.cursor/plans/` is treated as a read-only export/import surface. Keep `.agents/plans/` updated with task progress, verification notes, and durable lessons when the work calls for it.

## Karpathy behavioral guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

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
- "Refactor X" → "Ensure tests pass before and after"

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

- Use TDD for new features and bug fixes when applicable
- Ensure tests cover relevant scenarios and edge cases
- Write clear, descriptive test cases that explain the intent of the test
- Regularly run tests after changes to maintain code quality and reliability (prefer explicit scoped commands like `pnpm test:unit:changed`, `pnpm test:integration:changed`, or a targeted spec file)
- Before considering any implementation complete, always run `pnpm test:changed` and `pnpm check:full` as the final validation baseline to catch regressions outside the immediately edited files.

# Core Principles

- Simplicity First: Make every change as simple as possible. Impact minimal code. Strive for elegant solutions, but balance with pragmatism. Don't over-engineer simple fixes.
- No Laziness: Find root causes. No temporary fixes. Senior developer standards.
- Minimal Impact: Only touch what's necessary. No side effects with new bugs.
- Self-Improvement: Learn from mistakes. Update lessons. Iterate until mastered.
- Verification: Prove correctness before marking done. Tests, diffs, logs, demos. Final validation must include `pnpm test:changed` and `pnpm check:full`.
- Autonomy: Take ownership. Fix bugs without hand-holding. Be proactive in finding and resolving issues when they arise.
- Testing: Always write tests for new features and bug fixes, if applicable. Ensure that your tests cover the relevant scenarios and edge cases to maintain code quality and reliability.

## Cursor Cloud specific instructions

This project is a Next.js 16 app ("Atlaris") backed by a local Supabase Postgres stack. The startup update script runs `pnpm install` only; everything below is service startup / non-obvious runtime context that the update script intentionally does not handle.

### Docker is required and must be started manually

Docker (installed as a system package) powers both the local Supabase stack and the Testcontainers-based integration/security tests. This VM does not run systemd as PID 1, so Docker does not auto-start. At the beginning of a session run:

```bash
sudo service docker start        # start the daemon
sudo chmod 666 /var/run/docker.sock   # allow docker without sudo in this shell
docker ps                        # verify
```

### Local database (Supabase) — start + seed

Standard commands live in `docs/development/local-database.md` and `package.json`. Typical flow after Docker is up:

```bash
pnpm db:dev:start   # supabase start (containers named supabase_*_atlaris)
pnpm db:dev:reset   # apply migrations + seed the local product-testing user
```

The seeded local user's `auth_user_id` is `00000000-0000-4000-8000-000000000001`, which must equal `DEV_AUTH_USER_ID` in `.env.local`. Only the DB and Studio services are enabled in `supabase/config.toml`; the Supabase API/auth/storage are off because the app talks to Postgres directly via Drizzle and uses `LOCAL_PRODUCT_TESTING` (auth bypass) locally.

### `.env.local` and injected secrets (important gotchas)

- Copy `.env.local.example` to `.env.local` (gitignored). For local dev use `LOCAL_PRODUCT_TESTING=true`, `POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`, `AI_PROVIDER=mock`, `STRIPE_LOCAL_MODE=true`.
- The Cloud Agent VM injects several secrets as real OS environment variables (see `CLOUD_AGENT_INJECTED_SECRET_NAMES`). OS env vars take precedence over `.env.local` in Next.js. In this environment those injected values already point at the local Supabase DB and mock AI, so `pnpm dev` works, but be aware of two side effects:
  - `FLAGS`/`FLAGS_SECRET` are injected, which activates the remote Vercel flags adapter and makes the `maintenance-mode` flag resolve to `true`, redirecting every route to `/maintenance`. To develop locally, run the dev server with those unset: `env -u FLAGS -u FLAGS_SECRET pnpm dev`.
  - `MOCK_GENERATION_FAILURE_RATE` is injected as `0.1`, so AI plan generation randomly fails ~10%. For deterministic manual testing, override per-run: `MOCK_GENERATION_FAILURE_RATE=0 pnpm dev`.

### Running the app + hello-world

```bash
env -u FLAGS -u FLAGS_SECRET MOCK_GENERATION_FAILURE_RATE=0 pnpm dev
```

Then open `http://localhost:3000` (redirects to `/dashboard`; auth is bypassed). Create a plan at `/plans/new`. Note: free tier is server-side limited to 2-week plans, so choose "Finish by: 2 weeks" for the happy path.

### Tests

Standard test commands are in `docs/development/commands.md`. Integration/security suites use Testcontainers, so Docker must be running. Note: running the full `pnpm test:unit` suite on this VM fails ~8 env-sensitive specs (`tests/unit/config/env.spec.ts`, `tests/unit/stripe/client.spec.ts`, `tests/unit/ai/providers/router.spec.ts`, `tests/unit/api/auth.spec.ts`) purely because injected secret env vars are present and those specs assert the vars are unset. They pass with the vars cleared (e.g. `env -u AI_PROVIDER -u AI_USE_MOCK -u STRIPE_SECRET_KEY -u STRIPE_LOCAL_MODE -u MOCK_GENERATION_FAILURE_RATE -u LOCAL_PRODUCT_TESTING ... pnpm test:unit`). This is an environment artifact, not a code regression.