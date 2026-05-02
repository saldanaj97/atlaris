# Lessons Learned

## 2026-03-17: PRD audits miss violations when done manually

**Context:** PRD #243 identified 9 `lib/ → features/` violations, but a full `grep` audit found 27 total imports across 17 files — 13 additional violations were missed.

**Rule:** When writing a PRD that addresses dependency violations or import restructuring, always run an automated search (e.g., `grep -r "from '@/features/" src/lib/`) to discover ALL violations. Don't rely on manual code reading alone.

**Impact:** Without the full audit, ESLint enforcement (#271) would have failed after completing all 9 original issues because 13 violations would still exist.

## 2026-04-05: Planning path drift from `prds/` / stale `.plans/` to canonical `.agents/plans/`

**Context:** A planning task initially created a new workspace under `prds/` because older learnings and docs still referenced that path, while `AGENTS.md` had moved the canonical writable location to **`.agents/plans/`** (historically some docs said `.plans/`).

**Rule:** Before creating or updating planning artifacts, verify the canonical directory in live root **`AGENTS.md`**. Writable repo planning lives under **`.agents/plans/`** — not `prds/`, not legacy `.plans/`. **`.cursor/plans/`** stays Cursor-native / read-only for attached exports.

**Impact:** Following stale path references creates duplicate planning trees, confuses future updates, and undermines the workflow the repo is explicitly trying to standardize.

## 2026-04-05: Verify active surface area before planning around it

**Context:** The authenticated-request-scope research initially treated dead or internal-only helpers as active public primitives, and `docs/agent-context/learnings.md` preserved a server-component rule for `getCurrentUserRecordSafe()` even though the function had 0 callers and had already caused a regression when chosen over `withServerComponentContext()`.

**Rule:** Before turning helper-selection rules into planning assumptions or durable learnings, verify external call sites and classify exports as active, internal-only, escape hatch, or dead code.

**Impact:** This keeps planning artifacts focused on the real migration surface and prevents stale docs from preserving already-rejected usage patterns.

## 2026-04-07: Respect explicit env-file boundaries during infra migrations

**Context:** During the native dev Postgres migration, the user explicitly allowed updates to `.env.example` but said not to touch `.env.local`. The repo still needed env guidance aligned with the real variable names.

**Rule:** When a user sets boundaries around environment files, treat `.env.local` as user-owned unless they explicitly ask for edits. Update shared references like `.env.example` and report exact `.env.local` changes separately at the end.

**Impact:** This preserves local secrets and machine-specific settings while still delivering a complete migration path.

## 2026-04-14: Use `vi.stubEnv()` once env access is typed readonly

**Context:** After the env refactor typed process env access through a readonly `EnvSource`, `tests/unit/ai/provider-factory.spec.ts` still assigned directly to `process.env.NODE_ENV`, which broke `pnpm check:type` with TS2540 even though the runtime tests themselves passed.

**Rule:** In Vitest specs that need to change `NODE_ENV`, `VITEST_WORKER_ID`, or similar env flags, use `vi.stubEnv()` plus `vi.unstubAllEnvs()` instead of direct assignment to `process.env`.

**Impact:** This keeps env-sensitive tests aligned with the repo's existing test helpers and avoids read-only env typing regressions that block CI at type-check time.

## 2026-04-15: Honor explicit surface exclusions during review triage

**Context:** A CodeRabbit triage plan initially included several PDF-related findings because they were technically valid, but the user clarified that all PDF functionality should be ignored since that surface will be removed later.

**Rule:** When the user explicitly excludes a product surface from current work, remove that surface from plans and todos entirely even if some findings would otherwise merit fixes. Record the exclusion, but do not turn it into separate removal planning unless requested.

**Impact:** This keeps the plan aligned with the user's real priorities and avoids spending review effort on code that is about to be deleted.

## 2026-04-15: Keep new test imports Biome-sorted

**Context:** Two new unit specs passed locally but failed `check:full` because their imports were not sorted to Biome's expected order.

**Rule:** When adding or editing Vitest specs, keep imports organized up front or run the formatter before the final baseline so the new files do not create avoidable lint churn.

**Impact:** This avoids a second validation pass for trivial import-order fixes and keeps the final check focused on real regressions.

## 2026-04-20: Shared schema refactors must preserve call-site transforms

**Context:** While consolidating learning-plan schemas after PDF removal, a refactor briefly replaced the onboarding `notes` field with the raw string schema and broke downstream tests that relied on the existing optional-nullable normalization.

**Rule:** When extracting or re-exporting shared Zod fragments, verify whether existing call sites depend on wrapper behavior like `.optional()`, `.nullable()`, or `.transform()`. Keep a dedicated exported schema for normalized consumer-facing fields instead of swapping in the raw base fragment.

**Impact:** This prevents "cleanup" refactors from silently changing form payload semantics and turning a local type simplification into a cross-surface regression.

## 2026-04-20: Concurrent Vitest runs need isolated Testcontainers state

**Context:** Integration failures across `user-preferences`, billing subscriptions, and DB query specs were ultimately caused by two overlapping `pnpm vitest run` processes sharing one fixed `.testcontainers-env.json` path. One run could overwrite the other run's container metadata, so workers started pointing at the wrong ephemeral Postgres instance and tests saw missing rows, FK violations, fallback models, and truncate deadlocks.

**Rule:** When Testcontainers-backed test runs can overlap, never store runtime DB metadata in a single shared file path. Scope the runtime-state file per Vitest process and have worker setup read the per-run path from env.

**Impact:** This preserves worker-to-database isolation across concurrent local runs and prevents infra races from masquerading as fixture or application regressions.

## 2026-04-20: Vitest hoisted mocks and boundary return types need to match the actual call shape

**Context:** The request-boundary spec initially used a normal top-level mock handle inside a hoisted `vi.mock()` factory, and the boundary route method was typed too generically for a `PlainHandler`. Both passed local intuition but failed under Vitest hoisting and `tsgo --noEmit`.

**Rule:** In Vitest, create shared mock handles with `vi.hoisted()` before `vi.mock()` factories, and keep route-style boundary APIs constrained to `Response`-returning callbacks so the public handler type stays honest.

**Impact:** This avoids mock-hoist crashes and typecheck failures that only appear once the module graph is loaded the same way Vitest and `tsgo` see it.
