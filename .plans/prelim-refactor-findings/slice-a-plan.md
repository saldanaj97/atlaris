# Slice A Implementation Plan — Mechanical, high-ROI simplifications

## Step A.0 — Confirm scope / acceptance criteria

**Primary source of truth:** `.plans/prelim-refactor-findings/prelim-plan.md` and `.plans/prelim-refactor-findings/prelim-research.md`

**Slice scope confirmed**

1. Split `src/lib/config/env.ts` by domain behind a compatibility barrel.
2. Consolidate unknown-error normalization behind one canonical helper.
3. Extract a shared completion-metrics helper for plan read models.
4. Unify relative-time formatting without silently changing surface-specific copy.

**Acceptance criteria**

- **AC-A1 — Env split lands first and stays compatible.** `src/lib/config/env.ts` becomes a stable barrel/re-export surface while domain logic moves into facet modules under `src/lib/config/env/`. Existing `@/lib/config/env` importers keep working during Slice A.
- **AC-A2 — Unknown-error normalization has one authority.** A single normalization core owns `unknown -> message/name/error-like` behavior; existing helpers (`coerceUnknownToMessage`, attempt-error helpers, stream fallback shaping, logging helpers) become wrappers/projections instead of parallel implementations.
- **AC-A3 — Completion metrics are computed once.** `src/features/plans/read-models/detail.ts` and `src/features/plans/read-models/summary.ts` both consume one shared pure helper and preserve current DTO fields/semantics.
- **AC-A4 — Relative-time formatting is shared but behavior is intentional.** Plan-list compact strings, dashboard activity verbose strings, and dashboard future event strings all come from one shared formatter API with explicit options rather than hand-rolled logic.
- **AC-A5 — Slice order stays aligned with prelim plan.** Implementation order within the slice follows the prelim recommendation: env split → error normalization → completion metrics → relative-time unification.

**Non-goals / guardrails**

- Do **not** broaden this into Slice B/C boundary work.
- Do **not** change plan-status semantics beyond extracting shared helpers.
- Do **not** do a repo-wide importer migration away from `@/lib/config/env` in this slice; keep churn low.
- Treat `src/app/plans/[id]/helpers.ts` as adjacent but out of scope unless implementation proves it can reuse the new metrics helper with zero semantic drift.

## Steps A.1-A.5 — Implementation sequence

### Step A.1 — Lock current behavior with focused tests before moving code

1. Extend/adjust targeted unit coverage to freeze the current behaviors this slice must preserve:
   - env getters and parsing behavior in `tests/unit/config/env.spec.ts`
   - thrown-value/message coercion behavior in `tests/unit/api/coerce-unknown-to-message.spec.ts`
   - summary/status behavior in `tests/unit/plans/summary-boundaries.spec.ts` and `tests/unit/api/plan-status.spec.ts`
   - stream helper usage coverage in `tests/unit/app/api/v1/plans/stream/helpers-usage.spec.ts`
2. Add new focused specs for the extracted helpers:
   - `tests/unit/errors/normalize-unknown.spec.ts`
   - `tests/unit/plans/completion-metrics.spec.ts`
   - `tests/unit/utils/relative-time.spec.ts`
3. Make the new tests table-driven where possible so future slices can reuse them as a compatibility harness.

**Why first:** Slice A is intentionally “mechanical”; behavior-lock tests are what keep the refactor low risk.

### Step A.2 — Split `env.ts` by domain behind a compatibility barrel

**Goal:** reduce the blast radius of `src/lib/config/env.ts` without breaking its public import surface.

1. Create `src/lib/config/env/` facet modules, keeping shared parsing/runtime helpers in a common base module.
2. Recommended first-pass file layout:
   - `src/lib/config/env/shared.ts` — `EnvValidationError`, normalize helpers, runtime/cache helpers, `optionalEnv`, `requireEnv`, `parseEnvNumber`, `toBoolean`, server-only accessors.
   - `src/lib/config/env/app.ts` — `appEnv`
   - `src/lib/config/env/database.ts` — `databaseEnv`
   - `src/lib/config/env/auth.ts` — `neonAuthEnv`, `googleOAuthEnv`, `oauthEncryptionEnv`, `devAuthEnv`
   - `src/lib/config/env/billing.ts` — `stripeEnv`
   - `src/lib/config/env/ai.ts` — `aiEnv`, `aiTimeoutEnv`, `openRouterEnv`, `attemptsEnv`, `ATTEMPT_CAP`
   - `src/lib/config/env/security.ts` — `avScannerEnv`
   - `src/lib/config/env/local-testing.ts` — `localProductTestingEnv`
   - `src/lib/config/env/queue.ts` — `regenerationQueueEnv`
   - `src/lib/config/env/observability.ts` — `loggingEnv`, `observabilityEnv`
   - `src/lib/config/env/testing.ts` — `setDevAuthUserIdForTests`, `clearDevAuthUserIdForTests`
3. Reduce `src/lib/config/env.ts` to a compatibility barrel that re-exports the public API in the same names/order.
4. Keep any env invariants that span domains (for example production-only guards) in shared/auth-local-testing modules rather than duplicating them.
5. Do **not** migrate all 38 current importers to facet modules in this slice; only change direct imports where needed to avoid circularity or simplify tests.

**Implementation notes**

- `src/lib/config/env.ts` currently has 38 direct importers across `src/` and `tests/`; compatibility-first is required.
- Move the dev-auth test helpers out of the runtime module last, after the barrel is already re-exporting them.
- Preserve existing runtime semantics around caching in production vs mutable env access in non-production.

### Step A.3 — Consolidate unknown-error normalization

**Goal:** make one helper the source of truth for `unknown` thrown values while preserving the call-site-specific shapes consumers need.

1. Introduce a canonical helper, preferably `src/lib/errors/normalize-unknown.ts`.
2. The core should return a normalized structure rich enough to support wrappers, e.g. message, optional name, optional stack, optional cause, abort detection, and an `isErrorInstance`/`kind` discriminator if useful.
3. Rebase these modules on that core instead of keeping parallel logic:
   - `src/lib/api/coerce-unknown-to-message.ts`
   - `src/lib/api/error-normalization.ts`
   - `src/lib/errors.ts`
   - `src/app/api/v1/plans/stream/helpers.ts` (`toFallbackErrorLike()` replacement)
4. Preserve existing adapters rather than forcing one raw type everywhere:
   - message-only projection for API/user-facing strings
   - `Error` coercion for retry-generation paths
   - loggable details projection for logging
   - `ErrorLike` projection for stream fallback handling
5. Keep stream-helper changes narrowly scoped so Slice D can still reorganize `stream/helpers.ts` later without rebasing semantic changes.

**Implementation notes**

- Do not bury route-specific fallback response behavior in the shared helper; only share normalization.
- Preserve abort handling currently exposed from `src/lib/errors.ts`.
- `coerceUnknownToMessage()` should remain callable for existing consumers, even if it becomes a thin wrapper.

### Step A.4 — Extract shared completion metrics for plan read models

**Goal:** eliminate duplicated completion aggregation while keeping summary/detail outputs unchanged.

1. Add `src/features/plans/read-models/completion-metrics.ts` as the canonical pure helper destination.
2. Shape the helper around the data the two current callers already have, rather than around UI DTOs. Prefer pure inputs such as:
   - tasks grouped by plan/module
   - progress lookup by task id
   - optionally pre-aggregated module metric rows for lightweight summaries
3. Refactor `src/features/plans/read-models/detail.ts` to call the helper for:
   - `totalTasks`
   - `completedTasks`
   - `totalMinutes`
   - `completedMinutes`
   - `completedModules`
4. Refactor `src/features/plans/read-models/summary.ts` to use the same helper (or a shared reducer from the same module) for both `buildPlanSummaries()` and `buildLightweightPlanSummaries()`.
5. Keep status derivation where it currently lives; Slice A extracts metrics, not canonical status ownership.

**Implementation notes**

- Coordinate with Slice C on the permanent helper location: the current recommendation is `src/features/plans/read-models/completion-metrics.ts` so Slice C can import it directly.
- Avoid changing `src/lib/db/queries/plans.ts` contracts in this slice.
- Only pull in `src/app/plans/[id]/helpers.ts` if the extracted helper can be reused without coupling read-model logic to client-only status override behavior.

### Step A.5 — Unify relative-time formatting via shared utility

**Goal:** replace duplicated formatting logic with one formatter API that supports existing surface semantics by configuration.

1. Add `src/lib/date/relative-time.ts` as the shared low-level utility.
2. Design the public API around explicit options instead of implicit semantics. The helper should support at least:
   - compact past (`5m ago`, `2h ago`, `3w ago`)
   - verbose past (`5 minutes ago`, `2 hours ago`, `3 weeks ago`)
   - compact/brief future for scheduled events (`In 5m`, `In 2h`, `Tomorrow at 3:00 PM` or equivalent locked by tests)
   - null/invalid date fallbacks (`Recently` for plan surfaces)
   - caller-supplied reference date for deterministic tests
3. Rebase:
   - `src/app/plans/components/plan-utils.ts`
   - `src/app/dashboard/components/activity-utils.ts`
4. Keep wrapper function names (`getRelativeTime`, `formatTimeAgo`) if that reduces consumer churn; the shared utility should sit underneath them.
5. Verify that plan cards keep compact wording while dashboard activity keeps verbose wording and scheduled events keep future-oriented wording.

**Implementation notes**

- This helper is shared formatting only; it should not absorb plan-status logic from `plan-utils.ts`.
- Use tests to freeze wording before simplifying any branches.

## Validation Steps

### Focused unit validation during implementation

Run these after the relevant step lands:

```bash
pnpm exec tsx scripts/tests/run.ts unit tests/unit/config/env.spec.ts
pnpm exec tsx scripts/tests/run.ts unit tests/unit/api/coerce-unknown-to-message.spec.ts
pnpm exec tsx scripts/tests/run.ts unit tests/unit/api/plan-status.spec.ts
pnpm exec tsx scripts/tests/run.ts unit tests/unit/plans/summary-boundaries.spec.ts
pnpm exec tsx scripts/tests/run.ts unit tests/unit/app/api/v1/plans/stream/helpers-usage.spec.ts
pnpm exec tsx scripts/tests/run.ts unit tests/unit/errors/normalize-unknown.spec.ts
pnpm exec tsx scripts/tests/run.ts unit tests/unit/plans/completion-metrics.spec.ts
pnpm exec tsx scripts/tests/run.ts unit tests/unit/utils/relative-time.spec.ts
```

### Repo-level validation before closing the slice

```bash
pnpm test:changed
pnpm check:full
```

### Optional spot checks if the implementation agent wants extra confidence

```bash
rg -n "from '@/lib/config/env'" src tests
rg -n "toFallbackErrorLike|normalizeUnknownError|coerceUnknownToMessage" src
rg -n "formatTimeAgo|getRelativeTime|relative-time" src
```

## Verification / closure

- **AC-A1 — Env split behind compatibility barrel**
  - Proof: `src/lib/config/env.ts` is reduced to re-exports/barrel glue; facet modules exist under `src/lib/config/env/`; `tests/unit/config/env.spec.ts` passes; `pnpm check:type`/`pnpm check:full` pass without importer breakage.
- **AC-A2 — Unknown-error normalization has one authority**
  - Proof: canonical helper exists; `coerceUnknownToMessage`, `normalizeThrown`, `getLoggableErrorDetails`, attempt-error helpers, and stream fallback logic delegate to it; targeted normalization tests and stream-helper tests pass.
- **AC-A3 — Completion metrics are computed once**
  - Proof: `detail.ts` and `summary.ts` import the shared metrics helper; `tests/unit/plans/completion-metrics.spec.ts`, `tests/unit/plans/summary-boundaries.spec.ts`, and any affected mapper/read-model tests pass; returned DTO fields remain unchanged.
- **AC-A4 — Relative-time formatting is unified intentionally**
  - Proof: both plan and dashboard utilities call the shared date helper; `tests/unit/utils/relative-time.spec.ts` locks compact/verbose/future outputs; existing plan-summary/dashboard tests still pass.
- **AC-A5 — Slice order stays aligned with prelim plan**
  - Proof: commits/PR description reflect env split first, then normalization, then metrics, then relative-time cleanup; no Slice B/C/D architectural work is mixed into the change.

## Dependencies

- **Upstream dependency:** none; Slice A is intentionally first in the overall execution order.
- **Downstream dependency for Slice C:** this slice should establish `src/features/plans/read-models/completion-metrics.ts` as the stable destination so Slice C can reuse it.
- **Downstream dependency for Slice D:** this slice may touch `src/app/api/v1/plans/stream/helpers.ts`, but only for normalization wrappers; lifecycle ownership remains a Slice D concern.
- **Downstream dependency for Slice F:** if a later `parseJsonBody()` helper wants shared thrown-value handling, it should build on the Slice A normalization core rather than introduce a second one.

## Cross-slice coordination points

- **Slice A ↔ Slice C:** agree that shared read-model helper ownership stays under `src/features/plans/read-models/` and that Slice A does not move status derivation into a new boundary yet.
- **Slice A ↔ Slice D:** keep `stream/helpers.ts` edits adapter-level only so Slice D can still split route-facing vs feature-facing exports cleanly.
- **Slice A ↔ Slice F:** keep route parsing out of scope here; only centralize normalization primitives.

## Likely commit split

1. **`refactor: split env config barrel`**
   - add facet modules under `src/lib/config/env/`
   - reduce `src/lib/config/env.ts` to compatibility exports
   - extend env-focused tests
2. **`refactor: centralize unknown error normalization`**
   - add canonical normalization core
   - rebase wrappers/adapters in `src/lib/errors.ts`, `src/lib/api/error-normalization.ts`, `src/lib/api/coerce-unknown-to-message.ts`, and stream helpers
   - add normalization-focused tests
3. **`refactor: extract shared plan utilities`**
   - add completion-metrics helper
   - add shared relative-time formatter
   - switch read-model and UI utility callers
   - add/extend plan/date helper tests

## Open decisions for the implementation agent

1. **Exact env facet naming:** keep `security.ts` + `local-testing.ts` separate, or fold them into `auth.ts`/`app.ts`? Prefer separation if it avoids recreating a mini-monolith.
2. **Normalized error shape:** should the core return a plain object or a small class-free record plus projection helpers? Prefer a record to keep serialization/testing straightforward.
3. **Wrapper retention:** should `coerceUnknownToMessage()` remain a file-level wrapper for stable imports, or should callers move directly to the new helper? For Slice A, prefer keeping the wrapper.
4. **Future-time copy contract:** lock exact dashboard scheduled-event strings before implementation (`In 5m` vs `In 5 min`, `Tomorrow at ...` casing/spacing).
5. **Test-only env helpers destination:** prefer `src/lib/config/env/testing.ts` with re-exports from `env.ts`; only move them into `tests/helpers/` if keeping them in `src/` creates layering or import issues.
