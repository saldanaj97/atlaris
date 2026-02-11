# Phase 3 Plan (Post-Launch Cleanup and Drift Reduction)

This phase maps to post-launch cleanup items from `plans/plan-generation-audit/audit-overview.md`.

## Overview Checklist

> Instruction: check off each item immediately after implementation + tests + staging/production-safe validation are complete.

- [x] Remove or merge redundant manual generation server action path
- [x] Resolve regeneration queue drift (worker-backed execution and disable behavior)
- [x] Remove legacy job-queue coupling from plan status derivation
- [x] Consolidate duplicated validation surfaces to a single source of truth
- [x] Cap extraction response payload size and return explicit truncation metadata
- [x] Update regression/contract tests for all changed flows
- [x] Update runbook/changelog with final architecture and fallback notes

---

## Objective

Reduce long-term maintenance risk and production drift by consolidating duplicate pathways, clarifying source-of-truth status logic, and tightening API contracts.

## Scope

In scope:

- Cleanup of redundant generation entry points
- Queue and worker path consistency for regeneration
- Status derivation simplification
- Validation centralization
- Extraction response bounding

Out of scope:

- Major feature work
- Large schema redesigns not required for cleanup

---

## Detailed Task Plan

## 1) Remove/merge redundant manual generation server action path

Code touch points:

- `src/app/plans/actions.ts`
- UI callsites under `src/app/plans/**`
- Canonical API routes under `src/app/api/v1/plans/**`
- `src/lib/ai/orchestrator.ts`

Implementation steps:

1. Confirm canonical generation entrypoint (API route-based).
2. Remove duplicate server-action business logic or convert action to thin delegator.
3. Migrate all callsites to canonical path.
4. Delete dead exports/imports once traffic confirms no usage.

Validation:

- Integration checks for create/generate/retry behavior.
- Smoke test UI actions against canonical route.

Rollback:

- Reintroduce delegator action temporarily if client regression appears.

## 2) Resolve regeneration queue drift

Code touch points:

- `src/app/api/v1/plans/[planId]/regenerate/route.ts`
- `src/lib/jobs/queue.ts`
- Queue worker/processor modules
- Related status and attempt persistence query modules

Implementation steps:

1. Enforce one regeneration contract: enqueue -> worker executes -> status updates.
2. Add idempotency to prevent duplicate queued jobs for same target.
3. Align disable/cancel behavior with queue state transitions.
4. Add monitoring for stuck pending/processing jobs.

Validation:

- Integration test for queued execution end-to-end.
- Test disable/cancel path semantics.
- Concurrency test for duplicate regenerate requests.

Rollback:

- Feature flag to route regeneration through previous behavior if worker instability appears.

## 3) Remove legacy job-queue coupling from plan status derivation

Code touch points:

- `src/lib/db/queries/plans.ts`
- `src/lib/mappers/detailToClient.ts`
- `src/app/api/v1/plans/[planId]/status/route.ts`

Implementation steps:

1. Define source of truth for status (plan generation status + attempts + modules).
2. Remove legacy queue-based status inputs from user-facing status derivation.
3. Keep queue metrics for operations only, not product status truth.

Validation:

- Contract tests for expected statuses across state transitions.
- Regression test against historical sample states.

Rollback:

- Temporary flag to re-enable legacy derivation while fixing edge cases.

## 4) Consolidate duplicated validation surfaces

Code touch points:

- Validation modules under `src/lib/validation/**`
- API routes under `src/app/api/v1/**`
- Remaining server actions under `src/app/**/actions.ts`

Implementation steps:

1. Inventory all duplicated input validators (plan create/regenerate/PDF).
2. Move to shared schemas in one canonical module.
3. Replace per-route/per-action duplicates with shared imports.
4. Keep boundary-specific checks only when truly required.

Validation:

- Unit tests for shared schemas.
- Route contract tests: same invalid payload -> same failure behavior.

Rollback:

- Repoint specific routes to previous local validators if breakage appears.

## 5) Cap extraction response payload size

Code touch points:

- `src/app/api/v1/plans/from-pdf/extract/route.ts`
- `src/lib/pdf/structure.ts`
- Related serializer/response helper modules

Implementation steps:

1. Define hard cap thresholds (bytes/items/sections).
2. Apply truncation in server response layer.
3. Include explicit metadata (`truncated`, `maxBytes`, `returnedBytes`).
4. Update clients to handle truncation metadata safely.

Validation:

- Unit tests for under-limit/at-limit/over-limit responses.
- Integration test confirming stable contract when truncated.

Rollback:

- Adjust cap thresholds via config if too restrictive.

---

## Parallelization Plan (3 Subagents)

Recommended assignments:

- Subagent A: Task 1 + Task 4
  - Reason: both reduce entrypoint/validation duplication and align contracts.

- Subagent B: Task 2 + Task 3
  - Reason: both touch queue lifecycle and status correctness; keep logic aligned.

- Subagent C: Task 5
  - Reason: mostly isolated response-contract and payload-sizing work.

Parallel-safe execution:

- Subagent C can run fully in parallel with A and B.
- On B, complete core queue behavior (Task 2) before final status decoupling (Task 3).
- On A, start validator consolidation scaffolding while Task 1 callsites migrate.

Merge sequence recommendation:

1. Task 2
2. Task 3
3. Task 1
4. Task 4
5. Task 5
6. Full regression pass

---

## Definition of Done

- All checklist items at top are checked.
- Exactly one canonical generation path remains for manual initiation.
- Regeneration execution path is deterministic and worker-backed.
- User-facing status derivation no longer depends on legacy queue state.
- Validation logic is centralized and reused consistently.
- Extraction responses are bounded and contractually explicit when truncated.
- Post-launch monitoring shows no increase in stuck statuses or regeneration failures.
