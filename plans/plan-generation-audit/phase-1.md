# Phase 1 Plan (Launch Blockers)

This phase maps to the highest-priority launch blockers from `plans/plan-generation-audit/audit-overview.md`.

## Overview Checklist

> Instruction: check off each item immediately after implementation + tests + staging validation are complete.

- [x] Eliminate service-role default in request-path generation persistence
- [x] Align generation rate limiting with real stream execution path
- [x] Wrap `/plans/stream` with `withAuthAndRateLimit('aiGeneration', ...)`
- [x] Wire abort/timeout into OpenRouter provider path
- [x] Fix PDF flow contract and create-to-generate execution path
- [x] Enforce signed extraction proof for PDF-origin generation
- [x] Persist and inject extracted PDF context into prompt generation
- [x] Replace placeholder malware scanner with production AV integration
- [ ] Targeted test coverage and staging verification completed for all tasks above

---

## Objective

Close all launch-critical gaps in security, abuse-resistance, and flow correctness for manual and PDF-origin plan generation.

## Scope

In scope:

- Request-path DB safety and RLS defense-in-depth
- Correct and enforceable generation rate limits
- Streaming cancellation and timeout behavior
- PDF contract integrity and trust boundary
- Real malware scanning in upload pipeline

Out of scope:

- Non-critical refactors
- UX polish not tied to the blockers
- New product features unrelated to generation risk

---

## Detailed Task Plan

## 1) Eliminate service-role default in request-path generation persistence

Code touch points:

- `src/lib/db/queries/attempts.ts`
- `src/lib/ai/orchestrator.ts`
- `src/app/api/v1/plans/stream/route.ts`
- `src/app/api/v1/plans/[planId]/retry/route.ts`

Implementation steps:

1. Refactor `startAttempt`, `recordSuccess`, `recordFailure` to require explicit DB client.
2. Inject request-scoped `getDb()` from route handlers/orchestrator call path.
3. Remove all request-path fallback to service-role DB.
4. Add guard/assertion to fail closed if no valid request-scoped client exists.

Validation:

- Unit tests for required DB client wiring.
- Integration test proving cross-tenant writes are not possible.

Rollback:

- Revert route wiring commit only; keep tests to force safe re-implementation.

## 2) Align generation rate limiting with stream execution path

Code touch points:

- `src/lib/api/rate-limit.ts`
- `src/app/api/v1/plans/stream/route.ts`
- `src/lib/api/user-rate-limit.ts`

Implementation steps:

1. Move durable limiter to a counter/source used by actual generation execution.
2. Run durable check before expensive generation starts.
3. Ensure response contract includes proper 429 body and retry metadata.

Validation:

- Integration test: N requests pass, N+1 rejects with expected response.

Rollback:

- Temporary flag to preserve old limiter while telemetry confirms behavior.

## 3) Apply `aiGeneration` wrapper to `/plans/stream`

Code touch points:

- `src/app/api/v1/plans/stream/route.ts`
- `src/lib/api/auth.ts`

Implementation steps:

1. Wrap stream route with `withAuthAndRateLimit('aiGeneration', ...)`.
2. Ensure stream does not begin when wrapper rejects.
3. Keep durable limiter from Task 2 as second layer.

Validation:

- Route-level integration test for wrapper behavior and headers.

Rollback:

- Revert wrapper binding only if streaming transport edge-case appears.

## 4) Wire abort/timeout into OpenRouter provider path

Code touch points:

- `src/lib/ai/providers/openrouter.ts`
- `src/lib/ai/providers/router.ts`
- `src/lib/ai/orchestrator.ts`

Implementation steps:

1. Ensure `AbortSignal` and timeout config reach actual provider call.
2. Cancel upstream call on client disconnect.
3. Classify and persist timeout/abort failures cleanly.

Validation:

- Integration test: canceled stream aborts provider request.
- Integration test: forced slow request yields timeout classification.

Rollback:

- Keep an emergency config toggle for provider cancellation wiring.

## 5) Fix PDF flow contract and execution path

Code touch points:

- `src/app/plans/new/components/PdfCreatePanel.tsx`
- `src/lib/validation/learningPlans.ts`
- `src/app/api/v1/plans/route.ts`
- `src/app/api/v1/plans/stream/route.ts`

Implementation steps:

1. Define strict request contract for PDF-origin create/generate flow.
2. Align required fields between client and server.
3. Ensure create path reliably transitions to generation path.
4. Return clear failure codes for invalid phase transitions.

Validation:

- Integration test for happy path upload -> extract -> create -> generate.
- Regression test for current payload mismatch.

Rollback:

- Temporary backward-compatible parser for one release if needed.

## 6) Enforce trust boundary with signed extraction proof

Code touch points:

- `src/app/api/v1/plans/from-pdf/extract/route.ts`
- `src/app/api/v1/plans/route.ts`
- `src/lib/config/env.ts`
- New/updated security utility in `src/lib/security/**`

Implementation steps:

1. Create signed extraction token payload (user, plan/context hash, expiry, nonce).
2. Sign token server-side and return after successful extraction.
3. Verify token on PDF-origin create/generate requests.
4. Reject forged, expired, mismatched, and replayed tokens.

Validation:

- Unit tests for valid/tampered/expired/mismatched proofs.
- Security test for replay attempt.

## 7) Persist and use extracted PDF context in generation prompt

Code touch points:

- `src/app/api/v1/plans/route.ts`
- `src/lib/db/schema/tables/plans.ts` (or related storage tables)
- `src/lib/ai/prompts.ts`
- `src/lib/ai/orchestrator.ts`

Implementation steps:

1. Persist sanitized/bounded extraction context.
2. Load context in generation input path.
3. Inject context into prompts with strict delimiters and size caps.
4. Define fallback behavior when context is unavailable.

Validation:

- Unit tests for prompt assembly with/without PDF context.
- Integration test verifying context appears in generation request path.

Rollback:

- Feature-flag prompt injection separately from persistence.

## 8) Replace placeholder malware scanner with real AV

Code touch points:

- `src/lib/security/malware-scanner.ts`
- `src/app/api/v1/plans/from-pdf/extract/route.ts`
- `src/lib/config/env.ts`
- New AV adapter under `src/lib/integrations/**` or `src/lib/security/**`

Implementation steps:

1. Integrate one production-grade AV provider.
2. Scan before extraction/parsing; block on malicious verdict.
3. Enforce fail-closed behavior for scan timeouts/errors on upload path.
4. Log scan verdict and latency metrics.

Validation:

- Unit tests with mocked clean/infected/timeout outcomes.
- Integration test ensuring infected files never reach extraction.

Rollback:

- Route maintenance-mode fallback preferred over bypassing AV.

---

## Parallelization Plan (3 Subagents)

Recommended assignments:

- Subagent A (Core request-path controls): Tasks 1, 2, 3
  - Reason: same route and limiter surfaces, fewer merge conflicts.

- Subagent B (Provider execution safety): Task 4
  - Reason: isolated to provider/orchestrator layer.

- Subagent C (PDF hardening pipeline): Tasks 5, 6, 7, 8
  - Reason: shared upload/extract/create/generate boundary.

Parallel-safe combinations:

- A and B can run fully in parallel.
- C can run in parallel with A/B, but within C the order should be:
  - Task 5 -> Task 6 -> Task 7; Task 8 can run alongside 6/7 if interface contracts are stable.

Merge order recommendation:

1. B
2. A
3. C
4. End-to-end validation pass

---

## Definition of Done

- All checklist items at top are checked.
- No request-path generation persistence can execute via service-role fallback.
- `/plans/stream` has layered rate limits (category + durable) with consistent 429 behavior.
- Provider calls are cancellable and timeout-enforced.
- PDF flow uses verified extraction proof and persisted extracted context for prompting.
- Malware scanning is production-grade and enforced pre-extraction.
- Targeted unit/integration tests pass for changed flows.
- Staging soak check (manual + PDF generation) passes without critical errors.
