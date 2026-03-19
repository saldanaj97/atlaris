# Launch Readiness Hardening — Todos

> **Parent PRD:** [#284 — PRD: Launch Readiness Hardening and Cost Guardrails](https://github.com/saldanaj97/atlaris/issues/284)

## Notes

### **VERY IMPORTANT - MUST FOLLOW**

- When you see "in parallel" in the execution order, it means those slices can be worked on simultaneously using subagents. It does NOT mean that the work within that slice is necessarily parallelizable — some slices may still have internal sequential steps or dependencies. The "parallel" label only indicates that the entire slice can be started without waiting for other slices to complete, not that every task within it can be done in parallel.
- When spawning a subagent, make sure to use Opus 4.6 High as the model when dealing with semi-complex/complex tasks and GPT 5.4 mini High when dealing with simple tasks such as exploring, reading files, or writing very simple code.

## Execution Order Summary

```
Can start immediately (parallel):
  ├── #285 Canonical AI Usage Accounting Contract
  ├── #287 Pre-Creation Gating & Quota Enforcement
  └── #292 Observability Volume Tuning

After #285:
  └── #286 AI Cost Calculation & Output-Token Ceilings

After #285 + #287:
  └── #288 Lifecycle Ownership Consolidation

After #288 (parallel):
  ├── #289 Status Delivery Cost Reduction
  ├── #290 Retry & Idempotency Policy Centralization
  └── #291 Request-Time DB Boundary Cleanup

Post-launch (parallel):
  ├── #293 Read-Path Optimization & Subscription Caching
  └── #294 Persistence Simplification & Queue Consolidation
```

---

## Phase 1: Launch-Blocking Correctness & Spend Visibility

> Slices 1 and 3 have no blockers and can start **in parallel**.
> Slice 2 depends on slice 1. Slice 4 depends on slices 1 and 3.

### 1. Canonical AI Usage Accounting Contract — [#285](https://github.com/saldanaj97/atlaris/issues/285)

- **Blocked by:** None — can start immediately
- **Parallel candidate:** Yes — can run in parallel with slice 3
- **User stories:** 8, 12, 13, 19, 24

**Summary:** Introduce one shared usage model at the provider boundary. All providers return the same fields. Persistence/billing consumes that shape. Missing usage → explicit error, not silent zero.

**Acceptance criteria:**

- [x] A single canonical usage type/interface exists that all AI providers return
- [x] All provider adapters normalize their responses into this canonical shape
- [x] Missing or incomplete usage data raises an explicit error/alert, never silently writes zero
- [x] All persistence and billing paths consume only the canonical usage shape
- [x] Existing tests pass; new boundary tests cover normalization and missing-data error paths

---

### 2. AI Cost Calculation & Output-Token Ceilings — [#286](https://github.com/saldanaj97/atlaris/issues/286)

- **Blocked by:** [#285](https://github.com/saldanaj97/atlaris/issues/285) (Canonical AI Usage Accounting Contract)
- **Parallel candidate:** No — must wait for slice 1
- **User stories:** 10, 13, 16, 24

**Summary:** Centralize cost calculation in one place. Add model-based output-token ceilings. Enforce consistently across tiers.

**Acceptance criteria:**

- [x] Cost calculation lives in exactly one module/function
- [x] Cost is derived deterministically from the canonical usage model
- [x] Output-token ceilings are defined per model and enforced at the provider call boundary
- [x] Token limits are enforced consistently across all user tiers
- [x] Tests cover cost calculation determinism, ceiling enforcement, and tier consistency

---

### 3. Pre-Creation Gating & Quota Enforcement — [#287](https://github.com/saldanaj97/atlaris/issues/287)

- **Blocked by:** None — can start immediately
- **Parallel candidate:** Yes — can run in parallel with slice 1
- **User stories:** 2, 4, 9, 20

**Summary:** Enforce durable limits, quota checks, and idempotency before plan shell creation. Rejected requests must not leave junk records.

**Acceptance criteria:**

- [x] Quota and limit checks execute before any plan record is created
- [x] Rejected requests return a clear error and leave zero user-visible plan records
- [x] Duplicate/idempotent submissions are detected and handled before record creation
- [x] Over-limit requests fail fast with an informative response
- [x] Tests cover quota rejection, duplicate detection, and "no junk records" invariant

---

### 4. Lifecycle Ownership Consolidation — [#288](https://github.com/saldanaj97/atlaris/issues/288)

- **Blocked by:** [#285](https://github.com/saldanaj97/atlaris/issues/285) (Canonical AI Usage Accounting Contract), [#287](https://github.com/saldanaj97/atlaris/issues/287) (Pre-Creation Gating & Quota Enforcement)
- **Parallel candidate:** No — must wait for slices 1 and 3
- **User stories:** 1, 3, 6, 7, 11, 18

**Summary:** Make PlanLifecycleService the single owner of create/generate/retry/regenerate. Legacy orchestration becomes thin adapters or is removed. PDF flows consistent.

**Acceptance criteria:**

- [x] PlanLifecycleService owns create, generate, retry, and regenerate for all entry points
- [x] Legacy orchestration paths are thin adapters delegating to the lifecycle service, or removed
- [x] PDF plan flows use the same lifecycle boundary as non-PDF flows
- [x] Failed generations end in a clear, consistent, user-visible state
- [x] One lifecycle record exists per generation attempt (inspectable by support)
- [x] Tests cover lifecycle consistency across stream, retry, regeneration, and PDF paths

---

## Phase 2: Pre-Launch Hardening

> Slice 8 has no blockers and can start **in parallel with Phase 1 work**.
> Slices 5, 6, and 7 all depend on slice 4 and can run **in parallel with each other** once slice 4 is done.

### 5. Status Delivery Cost Reduction — [#289](https://github.com/saldanaj97/atlaris/issues/289)

- **Blocked by:** [#288](https://github.com/saldanaj97/atlaris/issues/288) (Lifecycle Ownership Consolidation)
- **Parallel candidate:** Yes — can run in parallel with slices 6 and 7 once slice 4 is done
- **User stories:** 5, 14, 22

**Summary:** Replace hot polling with event-driven or backoff/jitter strategy. Add simplified read model for status.

**Acceptance criteria:**

- [x] Status delivery no longer depends on an aggressive fixed-interval polling loop
- [x] A simplified read model or event-driven mechanism serves status updates
- [x] Backoff and jitter are applied if polling is retained
- [x] Status contract is documented and stable across pending, ready, failed, and retryable states
- [x] Tests cover status behavior for each state without depending on polling internals

---

### 6. Retry & Idempotency Policy Centralization — [#290](https://github.com/saldanaj97/atlaris/issues/290)

- **Blocked by:** [#288](https://github.com/saldanaj97/atlaris/issues/288) (Lifecycle Ownership Consolidation)
- **Parallel candidate:** Yes — can run in parallel with slices 5 and 7 once slice 4 is done
- **User stories:** 3, 9, 16, 20

**Summary:** Define single retry owner across provider calls, lifecycle attempts, and queued jobs. Bounded retry semantics. Duplicate submission handling.

**Acceptance criteria:**

- [x] One module/service owns retry policy for all generation paths
- [x] Retry counts are bounded and intentional (no accidental multiplication)
- [x] Duplicate submissions are detected and handled consistently
- [x] Abandoned requests are cleaned up without consuming budget
- [x] Tests cover duplicate handling, abandoned-request behavior, and bounded retry semantics

---

### 7. Request-Time DB Boundary Cleanup — [#291](https://github.com/saldanaj97/atlaris/issues/291)

- **Blocked by:** [#288](https://github.com/saldanaj97/atlaris/issues/288) (Lifecycle Ownership Consolidation)
- **Parallel candidate:** Yes — can run in parallel with slices 5 and 6 once slice 4 is done
- **User stories:** 14, 21

**Summary:** Tighten DB contexts in generation flow. Explicit roles for any remaining multi-context paths.

**Acceptance criteria:**

- [x] Generation flow opens only the minimum required database contexts
- [x] Any remaining multi-context paths have documented, explicit roles
- [x] Request-scoped vs worker-scoped DB boundaries are clearly separated
- [x] No unnecessary extra DB connections are opened per request
- [x] Tests verify DB boundary behavior is correct and observable

---

### 8. Observability Volume Tuning — [#292](https://github.com/saldanaj97/atlaris/issues/292)

- **Blocked by:** None — can start immediately
- **Parallel candidate:** Yes — can run in parallel with any Phase 1 or Phase 2 work
- **User stories:** 15

**Summary:** Reduce Sentry replay/trace/log defaults. Keep exception reporting and high-value traces. Match expected launch traffic.

**Acceptance criteria:**

- [x] Sentry replay sample rate is reduced to a launch-appropriate level
- [x] Trace sampling is tuned: high-value traces kept, low-value traces reduced
- [x] Log-shipping volume is reduced without losing critical failure signals
- [x] High-severity exceptions and errors are still captured reliably
- [x] Environment-based sampling decisions are testable and documented

---

## Phase 3: Post-Launch Cleanup

> Both slices can start after launch. Slice 9 has no blockers. Slice 10 depends on slice 4.
> **Branch status:** ✅ Implemented and validated on `phase-3`; broader RLS hardening follow-up deferred to [#297](https://github.com/saldanaj97/atlaris/issues/297).

### 9. Read-Path Optimization & Subscription Caching — [#293](https://github.com/saldanaj97/atlaris/issues/293)

- **Blocked by:** None (post-launch)
- **Parallel candidate:** Yes — can run in parallel with slice 10
- **User stories:** 14, 17

**Summary:** Add pagination defaults, lighter-weight plan summaries. Serve subscription status from local webhook-synced state.

**Acceptance criteria:**

- [x] Plan-list endpoints return paginated results by default
- [x] Lightweight plan summaries are used for list views (not full plan objects)
- [x] Subscription status is served from webhook-synced local state
- [x] Live provider reads are only used for repair/admin/fallback, not default reads
- [x] Tests cover pagination defaults, summary contracts, and billing-status fallback behavior

---

### 10. Persistence Simplification & Queue Consolidation — [#294](https://github.com/saldanaj97/atlaris/issues/294)

- **Blocked by:** [#288](https://github.com/saldanaj97/atlaris/issues/288) (Lifecycle Ownership Consolidation) — post-launch
- **Parallel candidate:** Yes — can run in parallel with slice 9
- **User stories:** 18, 21, 26

**Summary:** Deeper persistence refactoring for generation/attempt state. Simplify background job paths.

**Acceptance criteria:**

- [x] Generation/attempt persistence is simplified (fewer tables or cleaner state machine)
- [x] Background job paths are consolidated where possible
- [x] Remaining technical debt is explicitly documented as deferred with rationale
- [x] No regression in generation correctness or lifecycle behavior
- [x] Tests cover any persistence changes and verify no behavioral regressions

**Follow-up note:** broader RLS/state-ownership hardening was intentionally left
out of this Phase 3 branch and tracked separately in [#297](https://github.com/saldanaj97/atlaris/issues/297). The remaining
`reserveAttemptSlot()` ownership defer is documented in
`prds/launch-readiness-audit/phase3-todos.md` and `docs/technical-debt.md`.

---
