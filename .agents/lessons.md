# Lessons Learned

## 2026-03-17: PRD audits miss violations when done manually

**Context:** PRD #243 identified 9 `lib/ → features/` violations, but a full `grep` audit found 27 total imports across 17 files — 13 additional violations were missed.

**Rule:** When writing a PRD that addresses dependency violations or import restructuring, always run an automated search (e.g., `grep -r "from '@/features/" src/lib/`) to discover ALL violations. Don't rely on manual code reading alone.

**Impact:** Without the full audit, ESLint enforcement (#271) would have failed after completing all 9 original issues because 13 violations would still exist.

## 2026-04-05: Planning path drift from `prds/` / stale `.plans/` to canonical recap layout

**Context:** A planning task initially created a new workspace under `prds/` because older learnings and docs still referenced that path, while `AGENTS.md` had moved the canonical writable location to **`.agents/plans/`** (historically some docs said `.plans/`).

**Rule (updated 2026-06-16):** Before creating or updating planning artifacts, verify the canonical directory in live root **`AGENTS.md`**. Writable repo planning and handoffs live under **`.agents/recaps/MM-DD-YYYY/plans/`** and **`.agents/recaps/MM-DD-YYYY/handoffs/`** for the current local calendar day — not `prds/`, not legacy `.plans/`, not flat `.agents/plans/` or `.agents/handoffs/`. **`.cursor/plans/`** stays Cursor-native / read-only for attached exports.

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

## 2026-05-06: Smoke env isolation must own every inherited failure knob

**Context:** Auth smoke set `MOCK_AI_SCENARIO=success`, but inherited `MOCK_GENERATION_FAILURE_RATE` could still make the mock provider randomly fail during the broad launch-blocker flow.

**Rule:** When a smoke launcher claims deterministic local mocks, include all related env controls in the mode layer and clear or pin them there. Do not let parent-shell failure rates, delays, or auth flags leak into browser smoke.

**Impact:** This keeps smoke failures tied to app behavior instead of inherited local shell state.

## 2026-05-06: Billing-owned user fields need service-role writes

**Context:** Local billing checkout failed under smoke because customer provisioning tried to update `users.stripe_customer_id` through the authenticated request DB. Column privileges correctly block authenticated users from writing billing-owned fields.

**Rule:** Keep tenant-scoped reads under request auth/RLS, but write billing-owned user columns through the existing service-role boundary dependency. Do not add test-only bypasses for system-owned billing mutations.

**Impact:** This preserves the security boundary while allowing checkout and local billing smoke to exercise the real route path.

## 2026-08-31: Mock invalid_response is not validation

**Context:** JCS-59 retargeted generation integration specs off `runGenerationAttempt` onto `processGenerationAttempt`. The old validation helper returned empty modules (`ParserError` kind `validation`). Production `MOCK_AI_SCENARIO=invalid_response` streams invalid JSON (`ParserError` kind `invalid_json`), which `classifyFailure` maps to `provider_error`.

**Rule:** When using the production mock provider, treat `invalid_response` as retryable `provider_error`. Empty-module validation is a different parser path and is not a named `MOCK_AI_SCENARIO` value.

**Impact:** Lifecycle tests that expect `permanent_failure` / `validation` will fail if they only stub `invalid_response`.

## 2026-09-02: /orchestrate kickoff needs cloud-agent secrets, not local env

**Context:** The JCS-63 root planner (`bc-1f6f2e42-4d98-4b7b-940d-afc781a46a8b`) launched fine from a local shell with `CURSOR_API_KEY` set, then stalled inside the cloud VM. The VM had no `CURSOR_API_KEY`, no `SLACK_BOT_TOKEN`, and no `bun` on PATH, so it could not spawn a single child task. It finished after 135 s asking for the key.

**Rule:** Before `bun cli.ts kickoff`, confirm `CURSOR_API_KEY` (and `SLACK_BOT_TOKEN` if Slack is wanted) exist in Cursor Dashboard > Cloud Agents > Secrets. Local env only authenticates the dispatcher. Also, a bare model id in `plan.json` resolves to the server default variant; for `claude-fable-5-1` that is `thinking=true context=1m effort=high`. Pinning `context=300k` requires a `MODEL_CATALOG` entry on the machine running the loop.

**Impact:** Without the secret the whole tree is dead on arrival and the credits for the root planner are spent for nothing. Without a catalog entry the planner cannot honor a context-size rule by prompt text alone.

## 2026-09-02: /orchestrate model policy lives in plan.json task defs, not in the worker

**Context:** The first JCS-63 worker ran the whole feature on `fable-5-1-high` because the planner classified "page with copy" as a design task. The pstack rule puts `feature` on Grok and Fable on prose and judgment only.

**Rule:** Split by role before spawning. Prose and design judgment go to a Fable worker whose deliverable is its handoff (`pathsAllowed: []`, `(no branch)`); implementation goes to a Grok worker with `dependsOn` on the prose task so the script relays the copy verbatim. The script resolves `task.model` through `MODEL_CATALOG` at spawn, so the policy is enforced by the plan, not by prompt text.

**Impact:** Fable finished the copy in 5 min and Grok the page in 11 min. The mixed worker had produced no branch after 26 min.

## 2026-09-02: verify-atlaris on this Mac needs the OrbStack socket and real Clerk dev keys

**Context:** `control.ts launch` failed with `Could not find a working container runtime strategy` right after `orb start`, then marketing routes returned 500 `Publishable key not valid`. `/var/run/docker.sock` does not exist here; `.env.local` has no Clerk keys and `.env.agents` holds placeholders.

**Rule:** `export DOCKER_HOST=unix:///Users/juansaldana/.orbstack/run/docker.sock` before `launch`, `doctor`, and `cleanup`. For marketing pages, `clerk env pull --instance dev --file /tmp/<run>.env`, then `set -a; source /tmp/<run>.env; set +a` in the launch shell and delete the file afterward. Do not write the keys into repo env files.

**Impact:** Without the socket Testcontainers never starts Postgres; without the keys every `(marketing)` route 500s and the live pass is impossible.
