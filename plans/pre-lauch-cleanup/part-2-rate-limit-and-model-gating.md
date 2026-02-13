# Part 2: Rate Limiting, Attempt Capping, Model Gating, and Retry Concurrency Audit

Date: 2026-02-10
Scope: `plans/plan-generation-audit/audit-overview.md`, generation API entrypoints, shared limiters, model/tier selection flow, and related control-plane utilities.

## Executive Take

- The biggest real risk is **model/tier gating bypass through default-model fallback paths**.
- The second biggest risk is **retry concurrency overshooting attempt caps and running duplicate expensive generations**.
- Current limiters are partially aligned, but still split across route-level checks and non-atomic preflights.
- The code is close to being clean: most fixes are surgical and can be done without broad rewrites.

---

## Findings (Prioritized)

## 1) Critical - Tier/model gating can be bypassed via default provider fallback

### Impact

- Free/starter users can end up using a model that is not tier-allowed if env defaults drift.
- Expensive model usage can bypass intended entitlement policy and cost controls.

### Evidence

- `src/app/api/v1/plans/stream/route.ts:158` selects `model` from override-or-`AI_DEFAULT_MODEL`.
- `src/app/api/v1/plans/stream/route.ts:166` falls back to `getGenerationProvider()` when `model === AI_DEFAULT_MODEL`.
- `src/lib/ai/provider-factory.ts:82` uses `aiEnv.defaultModel` for default provider model.
- `src/lib/config/env.ts:367` allows `AI_DEFAULT_MODEL` env override with no validation.
- `src/app/api/v1/plans/[planId]/retry/route.ts:97` always uses `getGenerationProvider()` (no tier-specific resolution).

### Why this is a loophole

- Stream route validates override against tier, but default path can still route through env-configured default model.
- Retry route never tier-resolves model per user, so it inherits global default blindly.

### Smallest safe fix

- Introduce one server-only resolver (example name: `resolveGenerationModelForUser`) that always returns an allowed model for user tier.
- In request paths, always call `getGenerationProviderWithModel(resolvedModel)`.
- Do not call bare `getGenerationProvider()` in user-triggered generation routes.

### Follow-up hardening

- Validate `aiEnv.defaultModel` against `AVAILABLE_MODELS` at startup.
- Fail closed if configured default model is invalid or not in allowed production list.
- Add structured logs for rejected model overrides.

### Verification tests

- Free-tier user + env default set to pro model -> resolved model must still be free-tier model.
- Invalid `?model=` override -> safe fallback to tier-allowed default.
- Retry route uses same resolved model policy as stream route.

---

## 2) Critical - Retry concurrency race can exceed attempt cap and duplicate generation work

### Impact

- Two concurrent retry requests can both pass prechecks and both run generation.
- `ATTEMPT_CAP` can be overshot and duplicate provider calls can occur.

### Evidence

- `src/app/api/v1/plans/[planId]/retry/route.ts:74` reads attempt count.
- `src/app/api/v1/plans/[planId]/retry/route.ts:89` updates plan status in a separate operation.
- `src/app/api/v1/plans/[planId]/retry/route.ts:131` starts generation after those checks.
- `src/lib/db/queries/attempts.ts:284` `startAttempt()` reads existing attempt count without lock/reservation.

### Smallest safe fix

- Change retry status transition to conditional compare-and-set (`failed -> generating`) and reject if 0 rows updated.
- Add atomic reservation in attempts layer: lock plan row + verify cap + reserve slot (or write pending attempt) in one transaction.

### Follow-up hardening

- Add idempotency key support for retry endpoint.
- Consider plan-level advisory lock during generation start.

### Verification tests

- Two parallel retries on same failed plan -> exactly one proceeds, one gets conflict/rate-limited response.
- Attempt count never exceeds `ATTEMPT_CAP` under concurrent retry load.

---

## 3) High - Durable generation limiter is not consistently enforced on all generation entrypoints

### Impact

- Control-plane drift: some generation paths use DB-backed durable cap, others rely only on in-memory category limiter.
- In multi-instance deployment, in-memory limiter is not globally consistent.

### Evidence

- Durable check present in stream: `src/app/api/v1/plans/stream/route.ts:62`.
- Durable check present in create route: `src/app/api/v1/plans/route.ts:70`.
- Retry route has no durable check in path: `src/app/api/v1/plans/[planId]/retry/route.ts`.
- Regenerate route has no durable attempt check before enqueue: `src/app/api/v1/plans/[planId]/regenerate/route.ts:100`.
- User limiter is in-memory by design: `src/lib/api/user-rate-limit.ts:9`.

### Smallest safe fix

- Enforce durable generation limit at the attempt-start boundary (`startAttempt` or new `reserveGenerationAttempt`) so all callers inherit it.
- As immediate patch, add durable check to retry path before starting generation.

### Follow-up hardening

- Move route-level durable checks out of handlers after centralization.
- Add worker-side durable enforcement for queued regeneration execution path.

### Verification tests

- Retry request over durable limit -> 429 from durable limiter.
- Stream and retry produce identical durable limit behavior.

---

## 4) High - Durable limiter check is preflight-only and non-atomic

### Impact

- Concurrent requests can pass preflight and exceed configured 10/hour durable cap.

### Evidence

- `src/lib/api/rate-limit.ts:28` count query then branch on threshold.
- `src/app/api/v1/plans/stream/route.ts:62` check occurs before generation attempt write at `src/app/api/v1/plans/stream/route.ts:181`.

### Smallest safe fix

- Merge durable window check with attempt reservation into a single transaction in attempts query layer.
- Stop using route-level count-then-act for durable enforcement.

### Follow-up hardening

- Add a dedicated generation quota table keyed by `(user_id, window_start)` with atomic increment semantics.

### Verification tests

- Parallel stream starts at limit boundary -> only one allowed when one slot remains.
- No overrun beyond configured durable window cap.

---

## 5) Medium - Duplicate/misaligned durable checks between `/plans` and `/plans/stream`

### Impact

- Plan creation can be blocked even though generation is not executed there.
- Confusing behavior and drift risk from duplicated control checks.

### Evidence

- `/plans` is creation-only now (commented): `src/app/api/v1/plans/route.ts:183`.
- Yet `/plans` still runs durable generation limiter: `src/app/api/v1/plans/route.ts:70`.
- Stream route also runs durable limiter: `src/app/api/v1/plans/stream/route.ts:62`.

### Smallest safe fix

- Remove durable generation check from `/plans` create route.
- Keep enforcement at generation execution boundary only.

### Follow-up hardening

- Consider explicit “create draft” vs “start generation” API contracts.
- Eliminate any remaining dead direct-generation server action path.

### Verification tests

- User over durable generation cap can still create a plan record.
- Same user cannot start generation via stream while over cap.

---

## 6) Medium - Model gating logic is fragmented and partially TODO

### Impact

- New entrypoints can accidentally skip model-tier checks.
- Preference APIs and runtime behavior can diverge.

### Evidence

- Stream has inline model gating logic: `src/app/api/v1/plans/stream/route.ts:153`.
- Provider factory has TODO to validate model/tier: `src/lib/ai/provider-factory.ts:27`.
- Preferences route tier-gating is TODO: `src/app/api/v1/user/preferences/route.ts:85`.

### Smallest safe fix

- Add one shared model policy module for all write/read call sites.
- Replace inline stream gating with shared resolver call.

### Follow-up hardening

- Add typed error codes for model policy rejects (`MODEL_NOT_ALLOWED_FOR_TIER`, `MODEL_INVALID`).
- Wire preference persistence only after same policy module is in place.

### Verification tests

- Table-driven tests across tiers (`free`, `starter`, `pro`) and model IDs (valid free/pro/invalid).
- Preferences and stream use exactly same resolver behavior.

---

## 7) Medium - Regenerate enqueue path has no dedupe/inflight guard

### Impact

- Multiple pending regeneration jobs can be enqueued for same plan quickly.
- Burns quota and queue capacity; can produce confusing user outcomes.

### Evidence

- Regenerate endpoint always enqueues: `src/app/api/v1/plans/[planId]/regenerate/route.ts:100`.
- Queue insert path has no dedupe key or uniqueness guard: `src/lib/db/queries/jobs.ts:203`.
- Job schema has no uniqueness constraint for `(plan_id, job_type, pending/processing)`: `src/lib/db/schema/tables/jobs.ts:22`.

### Smallest safe fix

- Before enqueue, check for existing `pending|processing` regeneration job for same plan/user and return 409 with existing job id.

### Follow-up hardening

- Add partial unique index at DB layer to prevent duplicates regardless of application bugs.

### Verification tests

- Parallel regenerate calls for same plan produce one queued job.
- Second request returns deterministic conflict response.

---

## 8) Low - Generation control-plane constants are scattered

### Impact

- Raising/lowering limits requires touching multiple files and mental models.
- Easy to introduce inconsistent behavior.

### Evidence

- User request limiter config: `src/lib/api/user-rate-limit.ts:53`.
- Durable limiter constants: `src/lib/api/rate-limit.ts:11`.
- Attempt cap source: `src/lib/db/queries/attempts.ts:29`, `src/lib/config/env.ts:454`.
- Model default source split: `src/lib/ai/ai-models.ts:18`, `src/lib/config/env.ts:367`.

### Smallest safe fix

- Create a single generation policy module that exports all generation-control constants and resolvers.

### Follow-up hardening

- Add policy snapshot tests and docs generated from policy object.

### Verification tests

- One config change updates behavior consistently in stream/retry/regenerate.

---

## Proposed Target Architecture (Single Source of Truth)

## A) Central policy module

Create `src/lib/ai/generation-policy.ts` (or `src/lib/api/generation-policy.ts`) containing:

- `GENERATION_POLICY.requestRate` (user-facing category limiter metadata)
- `GENERATION_POLICY.durableWindow` (count + window)
- `GENERATION_POLICY.attemptCapPerPlan`
- `resolveGenerationModelForUser({ tier, requestedModel, envDefaultModel })`
- `assertModelAllowedForTier(...)`

No generation route should define model or limit behavior inline.

## B) One execution gate for durable + attempt reservation

Add `reserveGenerationAttempt()` in attempts query layer:

- Inputs: `planId`, `userId`, `input`, `dbClient`, `now`
- Transactional steps:
  1. Lock plan row.
  2. Verify ownership and status transition eligibility.
  3. Enforce durable per-user window cap.
  4. Enforce per-plan attempt cap.
  5. Insert reserved/pending attempt row.

All entrypoints (`stream`, `retry`, worker regeneration, server action if retained) call this same function.

## C) Request wrappers remain for fast-abuse shield, not correctness authority

- Keep `withAuthAndRateLimit('aiGeneration')` for cheap rejection and headers.
- Treat DB-backed reservation gate as correctness source.

## D) Endpoint responsibilities

- `/plans` -> create plan only.
- `/plans/stream` -> start generation (calls central reserve + model resolver).
- `/plans/:id/retry` -> same start path, no custom cap logic.
- `/plans/:id/regenerate` -> enqueue only after dedupe guard; worker uses same reserve/model gate before execution.

## E) Test strategy for policy correctness

- Unit: model resolver and policy table tests.
- Integration: concurrent retry/stream reservations at boundary conditions.
- Regression: free-tier cannot execute pro model from any entrypoint.

---

## Suggested Implementation Order

1. Fix model-resolution bypass (Finding 1).
2. Add atomic reserve gate and migrate retry/stream to it (Findings 2, 4).
3. Align durable enforcement across execution paths (Finding 3).
4. Remove duplicated `/plans` durable check (Finding 5).
5. Add regenerate dedupe guard and DB uniqueness (Finding 7).
6. Consolidate policy constants (Finding 8).
