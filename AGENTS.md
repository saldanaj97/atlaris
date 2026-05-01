# Workflow Orchestration

## Overview

**Agent memory:** Recurring preferences and durable workspace facts live in [`docs/agent-context/learnings.md`](docs/agent-context/learnings.md). Read that file whenever you read or apply this file.

We will primarily be utilizing the `.agents/plans/` directory to organize prds, plans, todos, and lessons learned. This structure allows for clear documentation and easy access to relevant information throughout the development process. Make sure to keep this directory updated with your work and insights as you progress through your tasks as this will be crucial for tracking your progress and learning from your experiences.

## 1. Plan Mode Default

- Enter plan mode or invoke planning agent for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

## 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents with cheaper/lightweight models
- For complex problems, throw more compute at it via subagents and ONLY use the same model as the parent
- One task per subagent for focused execution

## 3. Self-Improvement Loop

- After ANY corrections whether from our agent or the user: update `.agents/plans/lessons.md` with the pattern
- Write rules and lessons for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

## 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes -- don't over-engineer
- Challenge your own work before presenting it

## 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests -- then resolve them
- Zero context switching required from the user
- Go fix failing Cl tests without being told how

## 7. Testing

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

### Services overview

**Atlaris** is a single Next.js 16 app (Turbopack) with PostgreSQL 17, mock AI, and local Stripe mode. See `README.md` and `docs/development/commands.md` for all standard commands.

### Starting services

1. **PostgreSQL 17** on port **54331** — `pg_ctlcluster 17 main start` (already configured; data dir `/var/lib/postgresql/17/main`).
2. **Docker daemon** — `dockerd &>/var/log/dockerd.log &` (needed for integration/security tests via Testcontainers).
3. **Next.js dev server** — `pnpm dev` (Turbopack, port 3000).

### Environment

`.env.local` is not committed. Cloud setup creates it dynamically from source constants in `src/lib/config/local-product-testing.ts`. Key flags:

- `LOCAL_PRODUCT_TESTING=true` + `DEV_AUTH_USER_ID` = seeded local user (bypasses Neon Auth)
- `STRIPE_LOCAL_MODE=true` = in-process Stripe mock
- `AI_PROVIDER=mock` = mock AI generation
- `ENABLE_SENTRY=false` = no Sentry telemetry

### Gotchas

- The `pnpm db:dev:*` scripts assume macOS Homebrew. On Linux Cloud VMs, use `pg_ctlcluster 17 main start/stop` directly and the bootstrap script `pnpm db:dev:bootstrap` (which works cross-platform).
- `pnpm check:type` uses `tsgo` (from `@typescript/native-preview`), not `tsc`. Keep that devDep installed.
- Integration/security tests need Docker running. Unit tests do not.
- `pnpm.onlyBuiltDependencies` in `package.json` must include `esbuild`, `@sentry/cli`, `sharp`, etc. for native binaries to build during `pnpm install`.
- The `env.spec.ts` unit tests may show failures when `AI_PROVIDER` or other env vars are set in `.env.local`; this is expected — those tests validate default parsing behavior and use `vi.stubEnv` internally.
