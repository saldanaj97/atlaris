# Phase 2: Pre-Launch Hardening — Execution Tracker

> **Parent PRD:** [#284](https://github.com/saldanaj97/atlaris/issues/284)
> **Prerequisite:** #288 merged ✅ (commit 2b9b7fa)
> **Status:** ✅ All slices implemented and validated

## Execution Order

```
#289 Status Delivery Cost Reduction    ✅ Complete
#290 Retry & Idempotency Policy        ✅ Complete
#291 DB Boundary Cleanup               ✅ Complete
```

---

## Slice 5: Status Delivery Cost Reduction (#289)

### Implementation Steps

- [x] 5.1 Create `src/shared/constants/polling.ts` with backoff/jitter config constants
- [x] 5.2 Write tests for exponential backoff behavior in usePlanStatus hook
- [x] 5.3 Replace `setInterval(3000)` in `usePlanStatus.ts` with `setTimeout`-based exponential backoff + jitter
- [x] 5.4 Write tests for simplified status endpoint (reduced queries + cache headers)
- [x] 5.5 Simplify status endpoint: skip modules query when not `ready`, add `Cache-Control` header
- [x] 5.6 Document status contract with JSDoc on `derivePlanStatus`
- [x] 5.7 Validate: lint, type-check, test:changed

### Acceptance Criteria

- [x] Status delivery no longer depends on aggressive fixed-interval polling
- [x] Backoff and jitter are applied (initial=1s, max=10s, multiplier=1.5, jitter=±20%)
- [x] Status endpoint uses 1-2 DB queries instead of 3
- [x] Cache-Control headers present on status responses
- [x] Status contract documented and stable across all states
- [x] Tests cover status behavior for each state

---

## Slice 6: Retry & Idempotency Policy Centralization (#290)

### Implementation Steps

- [x] 6.1 Write tests for centralized retry policy module
- [x] 6.2 Create `src/features/plans/retry-policy.ts` with bounded retry semantics
- [x] 6.3 Fix multiplication bug: cap `retryable: true` at `maxAttempts` in `computeShouldRetry`
- [x] 6.4 Wire retry policy into regeneration worker (replace raw `retryable: true/false`)
- [x] 6.5 Move provider retry config behind centralized retry policy constants
- [x] 6.6 Write tests for abandoned request cleanup
- [x] 6.7 Create `src/features/plans/cleanup.ts` for stuck plans and orphaned attempts
- [x] 6.8 Validate: lint, type-check, test:changed

### Acceptance Criteria

- [x] One module owns retry policy for all generation paths
- [x] Retry counts are bounded (no accidental multiplication)
- [x] `retryable: true` no longer bypasses to ABSOLUTE_MAX_ATTEMPTS(100)
- [x] Abandoned requests cleaned up without consuming budget
- [x] Tests cover bounded retry semantics and cleanup behavior

---

## Slice 7: Request-Time DB Boundary Cleanup (#291)

### Implementation Steps

- [x] 7.1 Write tests for DB boundary behavior (single connection, usage recording)
- [x] 7.2 Add `dbClient` parameter to `UsageRecordingAdapter` constructor
- [x] 7.3 Update `factory.ts` to accept single `dbClient` for all adapters
- [x] 7.4 Restructure stream route: Connection 1 for auth/rate-limit only, Connection 2 for all lifecycle
- [x] 7.5 Apply same single-connection pattern to retry route if applicable
- [x] 7.6 Increase `idle_timeout` to 180s for stream-scoped connections
- [x] 7.7 Document multi-context paths with JSDoc
- [x] 7.8 Validate: lint, type-check, test:changed

### Acceptance Criteria

- [x] Generation flow opens minimum required DB contexts
- [x] All lifecycle operations use stream-scoped connection
- [x] UsageRecordingAdapter uses injected client (no getDb() fallback)
- [x] Request-scoped vs worker-scoped boundaries documented
- [x] Tests verify DB boundary behavior
