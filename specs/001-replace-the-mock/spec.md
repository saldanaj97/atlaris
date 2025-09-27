# Feature Specification: AI‑Backed Learning Plan Generation

**Feature Branch**: `001-replace-the-mock`  
**Created**: 2025-09-27  
**Status**: Draft  
**Input**: Replace mock generation with real AI-backed plan generator producing structured modules/tasks; transactional persistence; timeout fallback; attempt logging; error classification; no user-facing errors in core flow.

---

## Execution Flow (main)

1. Parse user description (objectives) – if empty: error
2. Extract key concepts (generation, structure, transaction, timeout, logging, classification, non-blocking UX)
3. Mark ambiguities explicitly
4. Define user story, journeys, acceptance scenarios, edge cases
5. Derive functional & quality requirements (testable)
6. Enumerate key entities
7. List open questions & assumptions
8. Provide acceptance checklist
9. Record execution status

---

## ⚡ Quick Guidelines

Focus on WHAT users need and WHY; avoid implementation specifics; write for non-technical stakeholders.

### For AI Generation

1. Mark ambiguities (_NEEDS CLARIFICATION_)
2. Avoid guessing unspecified details
3. Ensure requirements are testable
4. Typical gaps: permissions, retention, performance, error semantics, integrations, security

### Section Requirements

- Mandatory sections must be completed
- Optional sections appear only when relevant
- Remove non-applicable sections entirely (no "N/A")

---

## User Scenarios & Testing _(mandatory)_

### Primary User Story

As a learner creating a new learning plan, I want the system to automatically generate a structured set of modules and tasks tailored to my provided topic and learning parameters so that I can immediately see an organized path—or understand that the plan is still preparing—without manual data entry.

### Supporting Journeys

1. Successful generation within time budget → plan displays ordered modules & tasks.
2. Timeout during generation → plan remains empty (pending) without error message; later retry possible (future).
3. Invalid AI output → attempt recorded as validation failure; plan still accessible and pending.
4. Provider rate limit → attempt recorded as rate_limit failure; user sees pending state only.
5. Multiple plan creations in succession → each resolves independently with correct ordering.

### Acceptance Scenarios

1. Given a user creates a plan with valid inputs, When generation completes within budget, Then detail view shows ≥1 module and ordered tasks (both sequences start at 1 without gaps).
2. Given a plan is created, When generation times out, Then plan shows zero modules and no user-facing error message.
3. Given a generation succeeds, When attempt logs are inspected, Then one new success attempt shows correct module/task counts and duration.
4. Given generation output is structurally invalid, When attempt logs are inspected, Then a failure attempt with classification "validation" exists and no modules/tasks were created.
5. Given two plans created back-to-back, When both generations complete, Then each plan’s modules/tasks are isolated with independent ordering sequences.
6. Given provider rate-limits the request, When logs are inspected, Then a failure attempt with classification "rate_limit" exists and the plan remains pending.

### Edge Cases

- Duplicate ordering numbers → reject attempt (validation failure; no persistence).
- Zero modules returned → validation failure; plan remains pending.
- Timeout expiration → classify timeout; no partial persistence.
- Provider outage → classify provider_error; plan pending (plan remains pending unless cap reached, see Derived Status).
- Concurrent creations (burst) → isolated ordering integrity per plan.
- User leaves page immediately → background generation still completes.
- Crash mid-generation before persistence → transaction prevents partial data (attempt + content written atomically or not at all).
- Excessively long topic/notes → truncated (topic ≤200 chars, notes ≤2,000 chars) with truncation flags recorded.
- Unreasonable estimated minutes → values clamped (module 15–480, task 5–120) with normalization flag; non-numeric or <=0 triggers validation failure.

### Derived Status Semantics

The externally exposed plan status is derived (no denormalized column initially):

| Status  | Condition                                                                                  |
| ------- | ------------------------------------------------------------------------------------------ |
| pending | No successful attempt yet AND attempt cap not yet exhausted (≤2 failures so far)           |
| ready   | At least one successful attempt persisted ≥1 module                                        |
| failed  | Attempt cap (3) reached AND no successful attempt produced modules (all attempts failures) |

This definition ensures users can distinguish “will no longer retry automatically” (failed) from “still may succeed on a future attempt” (pending). A manual retry feature (future) would reset or extend logic explicitly.

## Review & Acceptance Checklist

### Content Quality

- [ ] No implementation details
- [ ] Focused on user value
- [ ] Suitable for non-technical stakeholders
- [ ] All mandatory sections completed

### Requirement Completeness

- [ ] No unresolved _NEEDS CLARIFICATION_ markers (or explicitly accepted)
- [ ] Requirements testable & unambiguous
- [ ] Success criteria measurable (readiness, ordering uniqueness, logging)
- [ ] Scope bounded (excludes retry UI, metrics)
- [ ] Dependencies & assumptions identified

---

## Execution Status

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [ ] Review checklist passed (pending clarifications)

---

## Clarifications

### Session 2025-09-27

- Q: How should a generation attempt be logged relative to the transactional persistence of modules/tasks? → A: D (Attempt log inserted inside same transaction so attempt + modules/tasks commit atomically.)
- Q: What should the hard generation timeout budget be for a single plan creation attempt? → A: E (Adaptive: start 10s; extend up to 20s only if partial parseable output already streaming.)
- Q: What maximum input length policy should we adopt for topic + notes? → A: B (Topic max 200 chars; Notes max 2,000 chars; overage truncated with internal log marker.)
- Q: What acceptable numeric range should we enforce for estimated minutes per module and per task? → A: D (Module 15–480, Task 5–120, clamp values and mark normalization flag.)
- Q: What attempt cap/throttle policy should apply per plan? → A: Hard cap 3 total attempts (automatic + manual); further attempts rejected.

### Applied Updates

- Added explicit requirement: attempt log record and generated modules/tasks persist atomically in a single transaction. If the transaction rolls back, neither the attempt nor partial content remains.
- Removed earlier ambiguity marker about when to record the attempt.
- Defined input length policy: topic ≤200 chars, notes ≤2,000 chars. Truncation applied server-side; attempt log records original lengths and a truncation flag.
- Added numeric effort bounds policy: modules must fall within 15–480 minutes, tasks within 5–120 minutes; out-of-range values are clamped and a normalization flag captured in attempt metadata.
- Added attempt cap: maximum of 3 generation attempts per plan (includes initial + up to 2 retries); further attempts return a capped error and do not enqueue generation.

---

## Requirements _(restored & updated)_

### Functional Requirements

1. Plan creation is acknowledged immediately without waiting for generation.
2. An AI-backed generation attempt starts for each new plan (unless inputs invalid).
3. A plan becomes "ready" only when ≥1 module exists.
4. Generation success produces structured modules each with ordered tasks.
5. Strict ordering integrity: (a) modules numbered sequentially starting at 1 with no gaps, (b) tasks per module numbered sequentially starting at 1 with no gaps, (c) duplicate indices invalidate attempt (no persistence), (d) ordering remains stable across reads after success.
6. Zero-module outputs are validation failures (no persistence).
7. Failures are classified: validation | provider_error | rate_limit | timeout | capped (fallback provider_error for unknown). Classification recorded only for failures (success attempts have NULL classification).
8. On any failure classification no partial modules/tasks persist.
9. Internal error details are not exposed to end users; user-visible errors are generic plus a correlation ID (logged server-side).
10. Pending plans are readable normally (empty modules list) during generation.
11. Every generation attempt is recorded with: plan_id, status, classification (nullable), modules_count, tasks_count, duration_ms, truncation flags, normalization flag, prompt_hash, metadata JSON (see FR12) .
12. Attempt metadata JSON MUST minimally include: { input: { topic: { truncated, original_length }, notes: { truncated, original_length } }, timing: { started_at, finished_at }, normalization: { modules_clamped, tasks_clamped } }. Additional fields (e.g., provider tokens) MAY be added later.
13. Adaptive timeout policy: initial hard budget 10s; may extend up to 20s ONLY if ≥1 well‑formed module header parsed before 9.5s; otherwise enforce 10s.
14. Attempt logging and module/task persistence occur inside a single atomic transaction (commit-all or rollback-all).
15. Logging failure (e.g., transient DB issue) causes the entire transaction to roll back; initial plan row persists (created earlier) but no attempt/module data persists.
16. Multiple attempts append records; hard cap 3 attempts/plan (initial + 2 retries). Additional requests rejected (capped classification, no provider call).
17. Concurrent plan creations do not interfere with ordering integrity.
18. Attempt duration captured in integer milliseconds using a monotonic source (acceptable tolerance ±5ms).
19. Effort bounds: module minutes clamped 15–480; task minutes clamped 5–120; if clamped set normalization flag; non-numeric or <=0 after parse → validation failure.
20. Retention policy deferred (see Deferred Items); no pruning in MVP.
21. No new user inputs required beyond existing plan fields.
22. User input limits: topic truncated at 200 chars; notes truncated at 2,000 chars with truncation flags & original_length recorded.
23. Derived plan status semantics follow table in "Derived Status Semantics"; exposed status MUST match mapping.

### Non-Functional / Quality Requirements

1. Generation timeout ensures interactive responsiveness (target: overall plan create API p95 latency delta < +200ms vs baseline measured over ≥30 runs, excluding first 3 warm-ups).
2. Creation response path adds minimal overhead (no synchronous AI provider call on request thread; background trigger ≤50ms extra CPU).
3. Logged data excludes sensitive user text (store only lengths + truncation flags; no raw notes re-logging) – redaction policy formalization deferred.
4. Concurrency safety prevents duplicate ordering or phantom partial writes (validated by concurrent creation test & transaction rollback test).
5. Error classification deterministic: identical failure conditions yield identical classification label.
6. Atomic transaction guarantees consistency between attempt log and generated content.
7. Input truncation adds <5ms p95 overhead (measured in isolation micro-benchmark of 100 samples; warm-up excluded).
8. Observability: correlation ID included in error logs; no external telemetry stack added (console + DB rows only) per constitution Principle 8.

### Open Questions (Unresolved After Clarification #1)

1. Retention period or pruning strategy for attempt history (currently infinite retention; FR20 marks deferred).
2. Redaction rules for sensitive input in logs (formal policy doc to be drafted Post-MVP).
3. Potential shift from route handler to Server Action for create endpoint (requires streaming or long-running constraints evaluation).

---
