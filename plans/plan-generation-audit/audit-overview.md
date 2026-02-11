# Plan Generation Audit Overview

Date: 2026-02-10

Scope audited in parallel:

- Manual plan generation flow
- PDF-to-plan generation flow

Primary focus areas:

- Launch-risk issues (security, abuse resistance, correctness)
- RLS and DB client safety
- Tier/model gating and quota/rate-limit integrity
- Dead/redundant code that can cause behavior drift

## Executive Risk Snapshot

- High severity: 8
- Medium severity: 8
- Most urgent pattern: control-plane drift (limits/gating/checks not aligned with real execution paths)
- Most dangerous single issue: request-path generation persistence currently defaults to service-role DB in shared attempts code

---

## Phase 0 - Launch Blockers (Fix Before Launch)

1. **Eliminate service-role default in request-path generation persistence (RLS defense-in-depth gap)**

- Risk: request-triggered generation writes can bypass RLS protections if any ownership check regresses.
- Evidence: `src/lib/db/queries/attempts.ts:28`, `src/lib/db/queries/attempts.ts:259`, `src/app/api/v1/plans/stream/route.ts:144`, `src/app/api/v1/plans/[planId]/retry/route.ts:131`
- Action:
  - Require explicit DB client injection for `startAttempt`, `recordSuccess`, `recordFailure`.
  - Pass request-scoped `getDb()` client from API handlers.
  - Fail closed if no client is provided in request context.

2. **Fix generation rate limiting so it matches real execution paths**

- Risk: intended durable generation throttling is disconnected from stream-based generation.
- Evidence: `src/lib/api/rate-limit.ts:23`, `src/app/api/v1/plans/stream/route.ts:56`, `src/app/api/v1/plans/stream/route.ts:144`
- Action:
  - Move durable generation cap to a source tied to actual generation attempts (`generation_attempts` or dedicated counter table).
  - Keep user-facing category limiter and durable limiter both active.

3. **Apply `aiGeneration` wrapper rate limiting to `/plans/stream`**

- Risk: expensive stream endpoint is not using `withAuthAndRateLimit('aiGeneration', ...)` like sibling generation endpoints.
- Evidence: `src/app/api/v1/plans/stream/route.ts:38`, `src/app/api/v1/plans/[planId]/retry/route.ts:31`
- Action:
  - Wrap stream route with `withAuthAndRateLimit('aiGeneration', ...)`.
  - Ensure consistent `X-RateLimit-*` headers and 429 behavior.

4. **Wire abort/timeout into OpenRouter provider call path**

- Risk: client disconnect/cancel can still incur full upstream AI cost.
- Evidence: `src/lib/ai/orchestrator.ts:222`, `src/lib/ai/providers/openrouter.ts:55`, `src/lib/ai/providers/openrouter.ts:87`
- Action:
  - Thread `AbortSignal` and explicit timeout into provider request.
  - Add integration coverage proving cancellation terminates provider calls.

5. **Fix broken PDF flow contract and execution path**

- Risk: PDF plan creation currently requires inputs that PDF UI payload does not send; creation path also does not trigger generation.
- Evidence: `src/app/plans/new/components/PdfCreatePanel.tsx:145`, `src/lib/validation/learningPlans.ts:126`, `src/app/api/v1/plans/route.ts:52`, `src/app/api/v1/plans/route.ts:182`
- Action:
  - Align payload contract (`topic` handling) and route orchestration.
  - Use one atomic server flow for create+generate (or explicit two-step contract with guaranteed second step).

6. **Enforce trust boundary for PDF-origin plans (no forged extracted content)**

- Risk: caller can forge `origin: 'pdf'` and `extractedContent` without passing extraction scan/validation route.
- Evidence: `src/app/api/v1/plans/route.ts:123`, `src/app/api/v1/plans/route.ts:137`, `src/app/api/v1/plans/from-pdf/extract/route.ts:83`
- Action:
  - Require short-lived signed extraction token (user-bound, hash-bound, expiry-bound).
  - Reject PDF-origin plan creation without valid extraction proof.

7. **Actually use persisted PDF extraction in generation input/prompt**

- Risk: extracted PDF semantics are dropped; output may be only topic-based and not document-grounded.
- Evidence: `src/app/api/v1/plans/route.ts:137`, `src/app/api/v1/plans/route.ts:145`, `src/lib/db/schema/tables/plans.ts:31`, `src/lib/ai/prompts.ts:57`, `src/lib/ai/providers/openrouter.ts:60`
- Action:
  - Persist bounded/sanitized extracted payload (or canonical references/digest).
  - Include extracted context in `GenerationInput` and prompt templates under strict token budgets.

8. **Replace placeholder malware scanning before public launch**

- Risk: upload pipeline relies on heuristic scanning and can miss malicious PDFs.
- Evidence: `src/lib/security/malware-scanner.ts:53`, `src/app/api/v1/plans/from-pdf/extract/route.ts:95`
- Action:
  - Integrate real AV scanner/service.
  - Quarantine-first flow + reject-on-scan-timeout policy.

---

## Phase 1 - Pre-Launch Hardening (If Time This Week)

1. **Fix retry concurrency race and enforce attempt cap atomically**

- Risk: concurrent retries can both pass checks and trigger duplicate costly generations.
- Evidence: `src/app/api/v1/plans/[planId]/retry/route.ts:73`, `src/app/api/v1/plans/[planId]/retry/route.ts:89`, `src/lib/db/queries/attempts.ts:277`
- Action:
  - Atomic transition/lock (`failed -> generating`) and reservation of attempt slot in one transaction.

2. **Unify tier/model gating across stream/retry/default fallback**

- Risk: fallback/default model selection can bypass per-tier intent in edge paths.
- Evidence: `src/app/api/v1/plans/stream/route.ts:121`, `src/lib/config/env.ts:367`, `src/app/api/v1/plans/[planId]/retry/route.ts:97`
- Action:
  - Central model resolver: validate requested and fallback models against user tier for all generation entrypoints.

3. **Sanitize SSE error messages**

- Risk: raw provider/internal messages leak to clients.
- Evidence: `src/lib/ai/failures.ts:16`, `src/app/api/v1/plans/stream/helpers.ts:90`
- Action:
  - Return classification-based user-safe messages.
  - Keep internal details only in structured logs/Sentry.

4. **Harden PDF ingestion against memory/CPU DoS**

- Risk: multipart parse + in-memory handling + parser execution can be abused.
- Evidence: `src/app/api/v1/plans/from-pdf/extract/route.ts:70`, `src/app/api/v1/plans/from-pdf/extract/route.ts:88`, `src/lib/pdf/extract.ts:81`
- Action:
  - Enforce body-size limits at edge/proxy.
  - Add parse timeout/cancellation and ingestion concurrency caps.

---

## Phase 2 - Post-Launch Cleanup And Drift Reduction

1. **Remove/merge redundant manual generation server action path**

- Risk: duplicate entrypoint bypasses control parity and causes future drift.
- Evidence: `src/app/plans/actions.ts:32`, `src/app/plans/actions.ts:70`
- Action:
  - Remove dead path or re-route to shared generation service with identical wrappers.

2. **Resolve regeneration queue drift**

- Risk: queued regeneration can stall if worker consumption is absent/inactive.
- Evidence: `src/app/api/v1/plans/[planId]/regenerate/route.ts:102`, `src/lib/jobs/queue.ts:25`
- Action:
  - Ensure worker is active and monitored, or disable endpoint until operationally ready.

3. **Remove legacy job-queue coupling from plan status derivation**

- Risk: UI/status correctness can drift from real generation source of truth.
- Evidence: `src/lib/db/queries/plans.ts:175`, `src/lib/mappers/detailToClient.ts:120`
- Action:
  - Derive status from `learning_plans.generation_status`, attempts, and module presence only.

4. **Consolidate duplicated validation surfaces**

- Risk: duplicate validators increase inconsistency risk over time.
- Evidence: `src/components/pdf/PdfUploadZone.tsx:51`, `src/lib/pdf/validate.ts:18`, `src/lib/api/rate-limit.ts:23`
- Action:
  - Define one authoritative server validation contract and make client checks advisory only.

5. **Cap extraction response payload size**

- Risk: overly large extraction responses can harm API/client performance.
- Evidence: `src/app/api/v1/plans/from-pdf/extract/route.ts:143`, `src/lib/pdf/structure.ts:37`, `src/lib/stripe/tier-limits.ts:31`
- Action:
  - Return preview + reference token; paginate/truncate large extraction content.

---

## Detailed Findings List

### Manual Flow Findings

- **M-1 (High, High confidence)**: service-role default in generation persistence query layer (`attempts.ts`) on request paths.
- **M-2 (High, High confidence)**: durable generation limiter and stream execution path are misaligned.
- **M-3 (High, High confidence)**: `/plans/stream` missing `aiGeneration` wrapper limiter.
- **M-4 (High, High confidence)**: abort/timeout passed from orchestrator but not consumed in OpenRouter provider call.
- **M-5 (Medium, High confidence)**: retry race allows cap overshoot under concurrent requests.
- **M-6 (Medium, Medium confidence)**: fallback/default model path can weaken tier gating guarantees.
- **M-7 (Medium, High confidence)**: SSE emits provider/internal message text directly.
- **M-8 (Medium, High confidence)**: redundant server action path for manual generation.
- **M-9 (Medium, Medium confidence)**: regeneration queue consumer not evident in repo.
- **M-10 (Medium, High confidence)**: plan status mapper still coupled to legacy queue state.

### PDF Flow Findings

- **P-1 (High, High confidence)**: PDF create payload contract mismatch + no guaranteed generation trigger in create route.
- **P-2 (High, High confidence)**: forged `origin: 'pdf'`/`extractedContent` accepted without extraction proof token.
- **P-3 (High, High confidence)**: extracted PDF content not persisted/used in generation prompts.
- **P-4 (High, Medium-high confidence)**: stream generation not truly constrained by intended DB-backed generation limiter.
- **P-5 (High, High confidence)**: request-time persistence still falls back to service-role.
- **P-6 (High, High confidence)**: malware scanner is heuristic placeholder.
- **P-7 (Medium, High confidence)**: ingestion path has DoS exposure (memory/CPU).
- **P-8 (Medium, Medium confidence)**: extraction response size not bounded tightly.
- **P-9 (Medium, Medium confidence)**: model-tier enforcement inconsistent across entrypoints.
- **P-10 (Medium, High confidence)**: duplicated validation surfaces increase drift risk.

---

## Recommended Execution Order (Pragmatic)

1. Close launch blockers in this order: **RLS/client safety -> rate limiting alignment -> provider cancellation -> PDF trust boundary -> malware scanning**.
2. Run targeted tests after each blocker fix (unit only for touched flows, ignore integration tests for now).
3. Add operational guardrails before launch day:
   - Alerts for generation rate spikes, timeout spikes, and PDF ingest failures.
   - Canary test for create->stream success on both manual and PDF paths.
4. Immediately after launch, run Phase 2 cleanup to remove drift vectors.
