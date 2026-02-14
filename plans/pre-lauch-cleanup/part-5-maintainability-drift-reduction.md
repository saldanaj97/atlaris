# Part 5: Maintainability Drift Reduction (Plan Generation)

Date: 2026-02-13 (post-implementation refresh)

Scope reviewed:

- `plans/plan-generation-audit/audit-overview.md`
- `src/app/api/v1/plans/**`
- `src/app/api/internal/jobs/regeneration/process/route.ts`
- `src/lib/ai/**`
- `src/lib/api/plans/**`
- `src/lib/db/queries/**`
- `src/lib/jobs/**`
- plan-generation related tests in `tests/**`

## Quick Verdict

- The previous document was outdated.
- Part 5 maintainability items called out in this plan are now implemented.
- Remaining risk is no longer implementation drift for these items; it is ongoing regression prevention via CI coverage and normal review discipline.

## Legacy Findings Validation Matrix

| ID  | Previous status (2026-02-10)                       | Current status                | Notes                                                                                    |
| --- | -------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| C1  | Duplicate entrypoints                              | **COMPLETED**                 | Deprecated server action path removed (`src/app/plans/actions.ts`).                      |
| C2  | Status split (attempts vs job queue)               | **Resolved**                  | Already resolved before this pass.                                                       |
| C3  | Regeneration queue had no consumer                 | **Resolved (implementation)** | Already resolved before this pass.                                                       |
| H1  | `/plans` and `/plans/stream` guardrails duplicated | **COMPLETED**                 | Shared preflight path added in `src/lib/api/plans/preflight.ts` and used by both routes. |
| H2  | Model resolution split/TODO-based                  | **Resolved**                  | Already resolved before this pass.                                                       |
| H3  | Prompt/schema/parser contract mismatch             | **COMPLETED**                 | Prompt contract now matches parser/schema (no task resources in prompt contract).        |
| H4  | Route parsing/ownership helper drift               | **COMPLETED**                 | Shared route-context helpers added and wired into tasks/status/retry routes.             |
| H5  | Classification messaging inconsistent              | **COMPLETED**                 | Centralized failure presentation map added and used by SSE + status route.               |
| M1  | Provider typing split confusion                    | **Resolved**                  | Already resolved before this pass.                                                       |
| M2  | Tests encoded legacy job-queue semantics           | **Resolved**                  | Already resolved before this pass.                                                       |
| M3  | No retry route integration coverage                | **COMPLETED**                 | Branch coverage expanded for `invalid_status`, `capped`, and `in_progress`.              |
| M4  | Detail/status parity untested                      | **COMPLETED**                 | Contract parity test added for detail/status endpoints.                                  |
| M5  | Regenerate tests only enqueue                      | **COMPLETED**                 | Worker drain integration test added; runbook added.                                      |
| L1  | Dead stub endpoint maintained                      | **COMPLETED**                 | `/api/v1/ai/generate-plan` route and dedicated tests removed.                            |

---

## Completed in Final Session (Implementation Log)

### 1) Generation contract alignment (prompt/schema/parser)

- Updated `src/lib/ai/prompts.ts` to remove task `resources` requirements and resource sections from the system prompt.
- Updated `tests/unit/ai/prompts.spec.ts` to reflect the enforced no-resources prompt contract.

### 2) Shared stream execution path for stream + retry

- Added shared stream orchestration helper in `src/app/api/v1/plans/stream/helpers.ts` (`executeGenerationStream`).
- Refactored:
  - `src/app/api/v1/plans/stream/route.ts`
  - `src/app/api/v1/plans/[planId]/retry/route.ts`
    to use the shared executor.

### 3) Classification message centralization

- Added `src/lib/ai/failure-presentation.ts` with canonical classification-to-message mapping.
- Wired it into:
  - `src/lib/ai/streaming/error-sanitizer.ts`
  - `src/app/api/v1/plans/[planId]/status/route.ts`

### 4) Route context standardization

- Added `src/lib/api/plans/route-context.ts` with shared helpers for plan-id parsing, auth user lookup, and owned-plan loading.
- Updated:
  - `src/app/api/v1/plans/[planId]/tasks/route.ts`
  - `src/app/api/v1/plans/[planId]/status/route.ts`
  - `src/app/api/v1/plans/[planId]/retry/route.ts`

### 5) `/plans` vs `/plans/stream` preflight dedup

- Added `src/lib/api/plans/preflight.ts` with shared preflight and create-with-rollback primitives.
- Updated:
  - `src/app/api/v1/plans/route.ts`
  - `src/app/api/v1/plans/stream/route.ts`
- Updated `src/lib/api/plans/shared.ts` to support optional injected db client where needed.

### 6) Dead path removals

- Removed deprecated server action path:
  - deleted `src/app/plans/actions.ts`
  - deleted `tests/integration/actions/generate-learning-plan.spec.ts`
  - deleted `tests/integration/actions/generate-learning-plan.dates.spec.ts`
- Removed dead stub endpoint:
  - deleted `src/app/api/v1/ai/generate-plan/route.ts`
  - deleted `tests/integration/api/ai-generate-plan.spec.ts`

### 7) Coverage additions

- Expanded retry integration coverage in `tests/integration/api/plans-retry.spec.ts`:
  - invalid status
  - attempt cap reached
  - in-progress conflict
- Added detail/status parity contract test:
  - `tests/integration/contract/plans.status-parity.spec.ts`
- Added regeneration execution integration test via worker drain endpoint:
  - `tests/integration/api/regeneration-worker-process.spec.ts`

### 8) Docs updates tied to this work

- Added worker runbook:
  - `docs/context/architecture/regeneration-worker-runbook.md`
- Linked runbook from architecture overview:
  - `docs/context/architecture/plan-generation-architecture.md`
- Removed dead endpoint reference from rate limiting docs:
  - `docs/rules/api/rate-limiting.md`

---

## Remaining Findings (Reprioritized)

For the scope tracked in this document, no open implementation findings remain.

Any new items should be treated as follow-up hardening or regression-prevention tasks, not unresolved Part 5 drift items.

---

## Validation Snapshot

- `pnpm lint` passed
- `pnpm type-check` passed
- `pnpm build` passed
- CodeRabbit CLI was attempted once in this environment but could not run due non-interactive raw-mode/TTY constraints; no review suggestions were produced.

---

## Expected Outcomes After This Refresh Plan

- One enforced generation contract from prompt through parser.
- One stream execution path for new generation + retry.
- One consistent error-message mapping across status and SSE.
- Better confidence in regeneration runtime behavior (enqueue plus worker execution path).
- Lower maintenance cost by removing dead/test-only generation surfaces.
