# Phase 2 Plan (Pre-Launch Hardening)

This phase maps to pre-launch hardening items from `plans/plan-generation-audit/audit-overview.md`.

## Overview Checklist

> Instruction: check off each item immediately after implementation + tests + staging validation are complete.

- [ ] Fix retry concurrency race and enforce attempt cap atomically
- [ ] Unify tier/model gating across stream, retry, and default fallback paths
- [ ] Sanitize SSE error messages (no raw internal/provider leakage)
- [ ] Harden PDF ingestion against memory/CPU DoS
- [ ] Add focused tests for all Phase 2 tasks
- [ ] Complete security and abuse-regression verification
- [ ] Validate rollback toggles/playbook for each task

---

## Objective

Reduce pre-launch incident risk by tightening concurrency control, model access control, output sanitization, and ingestion resource safety.

## Scope

In scope:

- Atomic attempt reservation and cap enforcement
- Single policy for tier/model resolution
- Safe SSE error contract
- Request and parser safeguards for PDF ingestion abuse

Out of scope:

- New feature additions
- Broad architecture changes unrelated to these hardening tasks

---

## Detailed Task Plan

## 1) Fix retry concurrency race + atomic attempt cap enforcement

Code touch points:

- `src/app/api/v1/plans/[planId]/retry/route.ts`
- `src/lib/db/queries/attempts.ts`
- `src/lib/ai/orchestrator.ts`

Implementation steps:

1. Add a single atomic DB function for attempt reservation.
2. Lock plan/attempt state inside one transaction.
3. Prevent duplicate in-flight attempts for same plan.
4. Return deterministic machine-readable rejection reasons (`capped`, `in_progress`).
5. Remove optimistic pre-check race windows in route layer.

Validation:

- Concurrency integration test (parallel retries on same plan).
- Assert cap never exceeded and attempt records remain consistent.

Rollback:

- Flag atomic guard path for quick fallback if operational issue appears.

## 2) Unify tier/model gating across all generation entry paths

Code touch points:

- `src/app/api/v1/plans/stream/route.ts`
- `src/app/api/v1/plans/[planId]/retry/route.ts`
- `src/lib/ai/provider-factory.ts`
- Model/tier policy utility under `src/lib/**`

Implementation steps:

1. Create one resolver function for requested + fallback model selection by user tier.
2. Route all entrypoints (stream/retry/default path) through that resolver.
3. Ensure fallback never escalates to disallowed tier models.
4. Standardize error/fallback contract and telemetry fields.

Validation:

- Matrix tests for tiers x models x entrypoint.
- Verify consistent behavior for allowed, denied, and fallback scenarios.

Rollback:

- Feature-flag unified resolver while collecting telemetry.

## 3) Sanitize SSE error messages

Code touch points:

- `src/app/api/v1/plans/stream/route.ts`
- `src/app/api/v1/plans/stream/helpers.ts`
- `src/lib/ai/streaming/events.ts`
- `src/lib/api/errors.ts` (if needed)

Implementation steps:

1. Define strict public SSE error payload schema (`code`, `message`, `retryable`, optional `requestId`).
2. Map all internal errors to sanitized public variants.
3. Remove direct pass-through of raw `error.message` from provider/internal exceptions.
4. Keep detailed context in server logs only.

Validation:

- Unit tests for sanitizer mapping.
- Verify no stack traces, SQL fragments, provider payloads, prompts, or secrets in SSE output.

Rollback:

- Keep compatibility layer if client expects legacy shape; still return sanitized text only.

## 4) Harden PDF ingestion against memory/CPU DoS

Code touch points:

- `src/app/api/v1/plans/from-pdf/extract/route.ts`
- `src/lib/pdf/extract.ts`
- `src/lib/api/pdf-rate-limit.ts`
- Related schema/validation modules under `src/lib/validation/**`

Implementation steps:

1. Enforce strict request-level limits (file size, MIME, pages where feasible).
2. Add parser guardrails (max pages/chars/time; cancellation support).
3. Add per-user and endpoint-level ingestion throttling.
4. Reject oversized or malformed documents quickly with bounded CPU/memory impact.
5. Add telemetry for parse size/time/rejection reasons.

Validation:

- Adversarial tests: oversized, malformed, high-page-count, and parser stress cases.
- Confirm bounded processing time and stable memory profile.

Rollback:

- Keep limits configurable; relax thresholds via config only if false positives occur.

---

## Parallelization Plan (3 Subagents)

Recommended assignments:

- Subagent A: Task 1 (atomic retry + cap)
  - Critical path due to DB concurrency behavior.

- Subagent B: Task 2 + Task 3 (model gating + SSE sanitization)
  - Shared API/orchestrator touch points; easier coordinated review.

- Subagent C: Task 4 (PDF ingestion DoS hardening)
  - Mostly isolated to upload/extract path and parser limits.

Parallel-safe execution:

- Tasks 2, 3, and 4 can run in parallel.
- Task 1 should begin first and remain highest priority, but can still run in parallel with others.

Merge sequence recommendation:

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Combined regression pass

---

## Definition of Done

- All checklist items at top are checked.
- Concurrent retries cannot exceed attempt cap under load.
- Tier/model policy behavior is identical across stream/retry/fallback flows.
- SSE error payloads are sanitized and stable.
- PDF ingestion enforces hard resource limits and resists common DoS patterns.
- Focused tests pass for all modified paths.
- Staging validation confirms no material regression in generation success/error rates.
