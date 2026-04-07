# Plan Generation Session — Implementation Plan

## Goal

Extract a first-class `PlanGenerationSession` boundary that absorbs server orchestration, transport semantics, and client session state. Create and retry converge on one session abstraction. Routes become thin HTTP adapters. Client hooks stop duplicating SSE parsing. Panels stop owning redirect/recovery policy.

## Settled Decisions

These are final. Do not reopen unless a hard contradiction is found in code during implementation.

1. **One session abstraction** for interactive create + retry.
2. **One-phase `/api/v1/plans/stream`** is the product truth. The two-phase `POST /plans` → stream flow is dead in practice.
3. **Cancel = disconnect + recovery.** No server-side abort for this pass.
4. **Redirect-on-`plan_start`** preserved as-is.
5. **Local DB-lifetime fix.** Retry gets a stream-scoped connection like create already has. Does not block on authenticated-request-scope.
6. **Queued regeneration** is out of first-pass scope entirely.

## Slice Overview & Dependency Map

```
Slice 1: Server Session Boundary + Event Contract
  │
  ├──► Slice 2: Client Session Controller  (blocks on Slice 1)
  │      │
  │      └──► Slice 3: Test Consolidation  (blocks on Slices 1+2)
  │
  └──► Slice 4: Docs & Dead Code Cleanup   (blocks on Slice 1, ideally after Slice 2)
```

**Order justification:**

- **Slice 1 first** because the server boundary is the foundation. Changing it after client consolidation would force the client to change twice. The highest-risk bug (retry DB lifetime) lives here.
- **Slice 2 after Slice 1** because the client hooks must adapt to the stabilized server event contract. Consolidating hooks before the server settles risks hardening around the current leaky design.
- **Slice 3 after Slices 1+2** because meaningful boundary tests require the boundary to exist. TDD tests written _within_ each slice are local; this slice replaces the _cross-cutting_ seam tests with proper boundary tests.
- **Slice 4 last** because docs should reflect the implemented state, and dead code is safest to remove after the replacement is proven.

## Overlap with Authenticated Request Scope

The [`authenticated-request-scope` research](../authenticated-request-scope/research.md) identified the same DB-lifetime risk in streamed work. Key shared surfaces:

| File | This Plan | Auth-Scope Plan |
|---|---|---|
| `src/lib/db/runtime.ts` | Read only — understand `getDb()` lifetime | Redesign `getDb()` globally |
| `src/lib/api/auth.ts` | Read only — understand `finally` cleanup timing | Redesign context runner |
| `src/features/plans/lifecycle/factory.ts` | Fix locally — retry gets stream-scoped connection | Eventually absorbed by broader scope redesign |

**Agreement:** This plan makes a **local fix** in `factory.ts` and the retry route. It does not change `getDb()`, `auth.ts`, or `runtime.ts`. The broader redesign is auth-scope's problem.

**Deferred auth.ts cleanup:** `src/lib/api/auth.ts` still exports dead `getCurrentUserRecordSafe()` surface area. The cleanup is: remove the export/JSDoc, delete its dedicated auth-unit coverage, and remove any lingering docs that still present it as a valid escape hatch. That cleanup is **out of scope here** and is tracked in [`docs/technical-debt.md`](../../docs/technical-debt.md).

---

## Slice 1: Server Session Boundary + Event Contract

### 1.0 — Confirm Scope & ACs

Verify the following before writing code:

- Create route (`src/app/api/v1/plans/stream/route.ts`) and retry route (`src/app/api/v1/plans/[planId]/retry/route.ts`) currently duplicate: auth check, DB setup, lifecycle service creation, SSE streaming, error mapping, disconnect handling.
- Retry route uses `getDb()` (request-scoped) for streamed work while create uses `createStreamDbClient()` (stream-scoped). This is the production-only DB lifetime bug.
- Legacy `executeGenerationStream` (helpers.ts:521-598) is dead code alongside the current lifecycle path (helpers.ts:620-717).

### 1.1 — Define Session Event Contract

**What:** Create a canonical event type definition that both server and client share.

**Files to create:**

- `src/features/plans/session/session-events.ts` — canonical SSE event types (`plan_start`, `content_delta`, `plan_section`, `usage`, `complete`, `error`)

**Steps:**

1. Extract event type definitions from the current inline unions in `src/features/ai/types/streaming.types.ts` and `src/app/api/v1/plans/stream/helpers.ts`.
2. Define a discriminated union `SessionEvent` that covers every event the server can emit.
3. Export an `isTerminalEvent()` type guard for use by both server and client.
4. Keep the event _shape_ identical to what the current SSE stream produces — this is a formalization, not a protocol change.

**Validation:** `pnpm type-check` passes. No runtime behavior change.

### 1.2 — Extract Server Session Module

**What:** Create a `PlanGenerationSession` that absorbs the shared orchestration from create and retry routes.

**Files to create:**

- `src/features/plans/session/server-session.ts` — the session module
- `src/features/plans/session/server-session.types.ts` — input/config types for the session
- `src/features/plans/session/index.ts` — barrel export

**Files to modify:**

- `src/features/plans/lifecycle/factory.ts` — accept injected DB client instead of calling `getDb()` internally
- `src/app/api/v1/plans/stream/route.ts` — collapse to thin HTTP adapter that delegates to session
- `src/app/api/v1/plans/[planId]/retry/route.ts` — converge on shared session, fix DB lifetime

**Steps:**

1. **Write boundary tests first** (`tests/integration/session/plan-generation-session.spec.ts`):
   - Create path: session produces `plan_start` → content → `complete`
   - Retry path: same event sequence through the same module
   - DB lifetime: streamed work uses injected DB client, not request-scoped `getDb()`
   - Error path: model failure produces `error` event, not thrown exception
   - Disconnect path: aborted request triggers `close` cleanup
2. Implement `createPlanGenerationSession()` that accepts:
   - `userId`, `dbClient` (stream-scoped), `signal` (AbortSignal from request)
   - Returns a `ReadableStream<Uint8Array>` of SSE events
   - Internally owns: lifecycle service creation, model resolution, generation invocation, event emission, error mapping, disconnect handling
3. Make factory accept injected `dbClient` parameter instead of calling `getDb()`.
4. Collapse create route to: auth → rate limit → create stream DB → call session → return Response.
5. Collapse retry route to: auth → rate limit → ownership check → create stream DB → call session → return Response.
6. **Verify retry now uses `createStreamDbClient()`** instead of request-scoped `getDb()` for lifecycle work.

**Risks:**

- **HIGH:** Rate limiting currently happens differently in create vs retry. Preserve existing per-route rate-limit logic in the thin adapter; do not absorb it into the session.
- **MEDIUM:** PDF-origin creation passes extra metadata. The session must accept optional metadata without coupling to PDF extraction.
- **MEDIUM:** The create route currently does duplicate detection. Keep this in the route adapter, not the session.

**Out of scope:** Changing rate-limit strategy, changing auth middleware, changing SSE wire format.

### 1.3 — Remove Legacy Execution Path

**What:** Delete `executeGenerationStream` (helpers.ts:521-598) and simplify helpers.

**Files to modify:**

- `src/app/api/v1/plans/stream/helpers.ts` — remove legacy path and any helper functions only used by it

**Steps:**

1. Verify no caller references `executeGenerationStream` (search for callers).
2. Delete the function and any private helpers it was the sole consumer of.
3. If `executeLifecycleGenerationStream` (helpers.ts:620-717) is now also absorbed by the server session module, delete it too and reduce helpers to pure utility functions (SSE formatting, etc.).

**Validation:** `pnpm type-check` && `pnpm test:changed`

### 1.4 — Validation & ACs

**Commands:**

- `pnpm type-check`
- `pnpm test:changed`
- Run targeted: `pnpm vitest run tests/integration/session/plan-generation-session.spec.ts`
- Run existing: `pnpm vitest run tests/integration/api/plans-stream.spec.ts tests/integration/api/plans-retry.spec.ts`

**Acceptance criteria:**

- [ ] Create and retry routes are thin HTTP adapters (< ~50 LOC of session logic each).
- [ ] Both routes delegate to the same `createPlanGenerationSession()` module.
- [ ] Retry uses a stream-scoped DB connection, not request-scoped `getDb()`.
- [ ] Legacy `executeGenerationStream` is deleted.
- [ ] Session event types are defined in `session-events.ts`, not scattered across helpers and AI types.
- [ ] Existing integration tests for create and retry still pass.
- [ ] New boundary tests cover create, retry, error, and disconnect paths.

---

## Slice 2: Client Session Controller

### 2.0 — Confirm Scope & ACs

Verify the following before writing code:

- `useStreamingPlanGeneration` (src/hooks/useStreamingPlanGeneration.ts) and `useRetryGeneration` (src/hooks/useRetryGeneration.ts) duplicate: fetch setup, SSE reader loop, line parsing, event dispatch, terminal state handling.
- The create hook invents a fake `persisting` state (line 379-386) that has no server-side milestone.
- Panels (`ManualCreatePanel`, `PdfCreatePanel`) own redirect/toast/recovery logic that belongs in the session boundary.
- `streamingPlanError.ts` contains `isAuthRedirectNeeded()` which is consumed by panels directly.

### 2.1 — Create Shared Session Hook

**What:** Unify the create and retry client session into `usePlanGenerationSession`.

**Files to create:**

- `src/features/plans/session/usePlanGenerationSession.ts` — shared session hook
- `src/features/plans/session/usePlanGenerationSession.types.ts` — hook state/config types
- `tests/unit/session/usePlanGenerationSession.spec.tsx` — hook tests

**Files to modify:**

- `src/hooks/useStreamingPlanGeneration.ts` — replace with thin wrapper or delete
- `src/hooks/useRetryGeneration.ts` — replace with thin wrapper or delete
- `src/app/plans/new/components/ManualCreatePanel.tsx` — switch to shared hook
- `src/app/plans/new/components/PdfCreatePanel.tsx` — switch to shared hook
- `src/app/plans/[id]/components/PlanPendingState.tsx` — switch retry to shared hook
- `src/app/plans/new/components/streamingPlanError.ts` — absorb into session hook or simplify

**Steps:**

1. **Write hook tests first** (`tests/unit/session/usePlanGenerationSession.spec.tsx`):
   - Create mode: hook triggers POST to `/api/v1/plans/stream`, exposes planId on `plan_start`, reaches `complete`
   - Retry mode: hook triggers POST to `/api/v1/plans/{id}/retry`, same event handling
   - Abort: calling `cancel()` aborts the fetch and sets state to `cancelled`
   - Auth redirect: 401 response detected and flagged (not auto-redirected by hook)
   - No `persisting` state: terminal states are `complete`, `error`, `cancelled` only
2. Implement `usePlanGenerationSession` that:
   - Takes a `mode` config: `{ mode: 'create', payload: CreatePayload }` | `{ mode: 'retry', planId: string }`
   - Internally owns: fetch call, SSE reader, event parsing (using `SessionEvent` types from Slice 1), state machine, abort controller
   - Exposes: `{ status, planId, sections, error, progress, start, cancel }`
   - Does NOT own: redirect execution, toast display, navigation timing — these are declarative signals the panel consumes
3. Remove fake `persisting` state. If the stream ends without a terminal event, status is `error` with a descriptive message, not an invented intermediate state.
4. Adapt `ManualCreatePanel` to use the shared hook in create mode.
5. Adapt `PdfCreatePanel` to use the shared hook in create mode. Note: PDF extraction remains panel-local; only the generation phase uses the shared hook.
6. Adapt `PlanPendingState` to use the shared hook in retry mode. Keep `PlanDraftView` presentational; only update its prop types if the shared session state shape changes.
7. Simplify or delete `streamingPlanError.ts` — move `isAuthRedirectNeeded()` into hook state if needed.

**Risks:**

- **HIGH:** Redirect timing is currently panel-owned. Moving it to declarative signals changes the control flow. Test manually: create → `plan_start` → redirect must still happen at the same point.
- **MEDIUM:** PDF flow has two async sub-flows (extraction + generation). Only generation uses the shared hook. Ensure the handoff between extraction complete → generation start is clean.
- **LOW:** `useRetryGeneration` is used in `PlanPendingState`, which has different UX context than creation panels. The shared hook must not assume creation-panel UX.

**Out of scope:** Changing redirect timing, changing cancel UX, adding queued regeneration, changing PDF extraction.

### 2.2 — Validation & ACs

**Commands:**

- `pnpm type-check`
- `pnpm test:changed`
- Run targeted: `pnpm vitest run tests/unit/session/usePlanGenerationSession.spec.tsx`
- Manual test matrix:
  - Manual create → stream → redirect → plan view
  - PDF create → extract → stream → redirect → plan view
  - Retry from draft view → stream → plan updates
  - Cancel during stream → state is `cancelled`
  - Auth redirect during stream → detected and flagged
  - Network disconnect during stream → state is `error`

**Acceptance criteria:**

- [ ] One shared `usePlanGenerationSession` hook handles both create and retry.
- [ ] No fake `persisting` state. Terminal states are `complete`, `error`, `cancelled`.
- [ ] SSE parsing is shared — not duplicated across hooks.
- [ ] Panels consume declarative session state, not raw SSE plumbing.
- [ ] Auth redirect detection works for both create and retry.
- [ ] `useStreamingPlanGeneration` and `useRetryGeneration` are deleted or reduced to re-export wrappers.
- [ ] Existing hook and panel tests pass or are replaced by boundary tests.

---

## Slice 3: Test Consolidation

### 3.0 — Confirm Scope & ACs

The current test suite protects internal seams (mocked helpers, mocked hooks) rather than observable session boundaries. After Slices 1 and 2, the boundary is well-defined. This slice replaces seam tests with boundary tests.

### 3.1 — Replace Seam Tests with Boundary Tests

**Files to modify or delete:**

| File | Action |
|---|---|
| `tests/integration/api/plans-stream.spec.ts` | Keep route-level coverage for auth, rate limit, duplicate detection, and request-shape behavior; reduce internal seam mocking only where the new boundary makes it obsolete |
| `tests/integration/api/plans-retry.spec.ts` | Keep route-level coverage for auth, ownership, rate limit, and retry request behavior; reduce internal seam mocking only where the new boundary makes it obsolete |
| `tests/unit/hooks/useStreamingPlanGeneration.spec.tsx` | Delete (replaced by `usePlanGenerationSession.spec.tsx`) |
| `tests/unit/app/plans/new/page.spec.tsx` | Rewrite to test observable panel behavior, not mocked hook wiring |
| `tests/unit/ai/streaming/helpers.spec.ts` | Simplify or delete if helpers absorbed into session |
| `tests/unit/app/api/v1/plans/stream/helpers-usage.spec.ts` | Delete if helpers absorbed into session |

**Steps:**

1. Inventory existing test assertions. Map each to its replacement location (route-level API test, session boundary test, hook test, or panel behavior test).
2. Add missing `createPlanGenerationSession()` boundary tests without deleting route-level adapter coverage.
3. Delete seam tests whose assertions are now covered by route-level API tests plus boundary tests.
4. Keep model-resolution tests if model selection remains a distinct public rule.
5. Verify no coverage regression for critical paths: create, retry, disconnect, PDF create, auth redirect.

**Risks:**

- **MEDIUM:** Coverage regression if old tests are deleted before replacements exist. Mitigate by maintaining a coverage assertion map.

**Out of scope:** Writing performance tests, E2E Playwright tests, or tests for queued regeneration.

### 3.2 — Validation & ACs

**Commands:**

- `pnpm test:changed` (should show net-zero or positive test count)
- Review coverage for `src/features/plans/session/` directory

**Acceptance criteria:**

- [ ] Route-level API tests still protect auth, rate limit, ownership, duplicate detection, and request-shape behavior.
- [ ] Session-boundary tests cover shared create/retry streaming behavior without replacing route-level adapter coverage.
- [ ] Panel tests prove observable behavior (rendered output, navigation), not mocked-hook choreography.
- [ ] No coverage regression for create, retry, disconnect, PDF create, and auth redirect paths.
- [ ] Model-resolution tests preserved if model selection is still a public rule.

---

## Slice 4: Documentation & Dead Code Cleanup

### 4.0 — Confirm Scope & ACs

After Slices 1-3, the session boundary is implemented, tested, and proven. This slice aligns documentation and removes code that is no longer reachable.

### 4.1 — Update Architecture Docs

**Files to modify:**

- `docs/architecture/plan-generation-architecture.md` — update to reflect one-phase truth and session boundary

**Files to create (if needed):**

- `docs/architecture/plan-generation-session.md` — canonical session lifecycle reference (only if the existing doc is too entangled to update cleanly)

**Steps:**

1. Remove references to two-phase create flow as current truth.
2. Document the session boundary: what it owns, what the route adapters own, what the client hook owns.
3. Document cancel = disconnect semantics explicitly.
4. Note the DB-lifetime fix and its relationship to the broader auth-scope effort.

### 4.2 — Remove Dead Code

**Candidates for full removal (confirm unused, then delete the code and related tests/docs in the same slice):**

| Code | Removal plan |
|---|---|
| `POST /api/v1/plans` (src/app/api/v1/plans/route.ts:117-232) | Current repo search shows no live product-code caller in `src`. Re-run that check during implementation, then remove the route, `src/lib/api/openapi.ts` entries, docs references, and related tests/fixtures (`tests/integration/contract/plans.post.spec.ts`, any broader integration or observability references that still mention `POST /api/v1/plans`). |
| `executeGenerationStream` (helpers.ts:521-598) | Delete the function and any helper-only tests that only exist to protect it, including `tests/unit/ai/streaming/helpers.spec.ts` and `tests/unit/app/api/v1/plans/stream/helpers-usage.spec.ts` if they remain tied solely to the removed helpers. |
| Old hook files if fully replaced | Remove `useStreamingPlanGeneration.ts` and `useRetryGeneration.ts` entirely once consumers move to the shared hook. Remove their dead tests/mocks at the same time, including `tests/unit/hooks/useStreamingPlanGeneration.spec.tsx` and mocked-hook wiring in `tests/unit/app/plans/new/page.spec.tsx`. |

**Removal rule for this plan:** if a dead code path is confirmed unused and still falls within this refactor's touched surface, **fully remove it**. Do not leave deprecation shims behind. Delete the code, its direct tests, and any doc/OpenAPI references in the same change.

### 4.3 — Validation & ACs

**Commands:**

- `pnpm type-check`
- `pnpm test:changed`
- `grep -r "executeGenerationStream"` returns zero hits
- `grep -r "POST /api/v1/plans"` only returns historical notes that intentionally document the removal

**Acceptance criteria:**

- [ ] Architecture docs match the implemented runtime behavior.
- [ ] No references to two-phase create flow as current product truth.
- [ ] Dead code confirmed unused in-repo is fully removed, including related tests, OpenAPI entries, and docs references.
- [ ] `pnpm type-check` and `pnpm test:changed` pass clean.

---

## Shared-File Conflict Map

These files are touched by multiple slices. Implementation order within each file must follow the slice order.

| File | Slice 1 | Slice 2 | Slice 3 | Slice 4 |
|---|---|---|---|---|
| `src/app/api/v1/plans/stream/route.ts` | Rewrite to adapter | — | Test rewrite | — |
| `src/app/api/v1/plans/[planId]/retry/route.ts` | Rewrite to adapter | — | Test rewrite | — |
| `src/app/api/v1/plans/stream/helpers.ts` | Remove legacy path | — | Delete seam tests | Remove if empty |
| `src/features/plans/lifecycle/factory.ts` | Fix DB injection | — | — | — |
| `src/hooks/useStreamingPlanGeneration.ts` | — | Replace/delete | Delete old tests | Verify gone |
| `src/hooks/useRetryGeneration.ts` | — | Replace/delete | Delete old tests | Verify gone |
| `src/app/plans/new/components/ManualCreatePanel.tsx` | — | Adapt to shared hook | Rewrite panel tests | — |
| `src/app/plans/new/components/PdfCreatePanel.tsx` | — | Adapt to shared hook | Rewrite panel tests | — |

## Explicit Out of Scope

- Queued regeneration — follow-up effort only.
- Server-side cancellation — cancel remains disconnect + recovery.
- Redirect timing changes — `plan_start` redirect preserved as-is.
- `getDb()` global redesign — that is authenticated-request-scope's problem.
- PDF extraction changes — extraction phase stays panel-local.
- Rate-limit strategy changes — existing per-route logic preserved.
- SSE wire format changes — event shapes stay the same, just formalized.
- `auth.ts` cleanup (`getCurrentUserRecordSafe()` export/tests/JSDoc removal) — tracked in `docs/technical-debt.md`, out of scope for this plan.
