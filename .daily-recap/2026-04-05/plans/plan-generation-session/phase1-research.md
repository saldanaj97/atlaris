# Phase 1: Plan Generation Session — Research & Implementation Plans

> **Parent issue:** Not assigned yet. This research treats "Plan generation session" as the chosen architecture candidate from the shortlist, not an existing GitHub issue.
> **Adjacent prerequisite:** [`authenticated-request-scope`](/Users/juansaldana/Dev/Projects/atlaris/.plans/authenticated-request-scope/research.md) is not a hard blocker, but overlap is real around DB lifetime and auth context.
> **Research date:** 2026-04-05
> **Status:** Research complete — ready for design review and plan drafting

## Recommended Direction

The recommended planning defaults are:

1. Converge interactive `create + retry` on one first-class generation-session boundary.
2. Treat the current one-phase `/api/v1/plans/stream` path as the truth for this refactor.
3. Keep `cancel = disconnect/recovery`, not true server-side cancellation, in this pass.
4. Preserve redirect on first `plan_start` / plan id availability.
5. Fix the long-lived RLS connection story locally now, even though authenticated-request-scope overlaps.
6. Treat queued regeneration as adjacent follow-up work, not first-pass scope.

---

## Slice 1: Server Session Boundary

### 1. Current State

The server-side "session" is not a real module yet. It is route choreography spread across route handlers, stream helpers, and the lifecycle service.

- The primary stream route parses input, rate-limits, creates a second DB connection just for the long-lived stream, calls `createPlan`/`createPdfPlan`, resolves model choice, builds `ProcessGenerationInput`, starts the SSE stream, and owns fallback cleanup in [`src/app/api/v1/plans/stream/route.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/route.ts#L62) through [`src/app/api/v1/plans/stream/route.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/route.ts#L383).
- The retry route replays a similar flow with a different preflight: it rate-limits, verifies plan ownership/status, rebuilds `ProcessGenerationInput` from persisted plan data, then reuses the same stream helper path in [`src/app/api/v1/plans/[planId]/retry/route.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/[planId]/retry/route.ts#L87) through [`src/app/api/v1/plans/[planId]/retry/route.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/[planId]/retry/route.ts#L229).
- `PlanLifecycleService` is deeper than the route code, but it still only owns lifecycle result semantics. It does not own session kickoff, stream event emission, route error mapping, or route-specific connection lifetime in [`src/features/plans/lifecycle/service.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/features/plans/lifecycle/service.ts#L43) through [`src/features/plans/lifecycle/service.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/features/plans/lifecycle/service.ts#L481).
- The factory explicitly documents a prior "closed connection" bug and now depends on callers to pass the right DB lifetime for stream routes versus retry routes versus workers in [`src/features/plans/lifecycle/factory.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/features/plans/lifecycle/factory.ts#L1) through [`src/features/plans/lifecycle/factory.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/features/plans/lifecycle/factory.ts#L39).
- Stream helper functions still own session-facing concerns like sanitizing SSE errors, emitting terminal events, and fallback cleanup in [`src/app/api/v1/plans/stream/helpers.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/helpers.ts#L84) through [`src/app/api/v1/plans/stream/helpers.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/helpers.ts#L717).
- That helper file still carries two overlapping execution paths: a legacy generic `executeGenerationStream(...)` path in [`src/app/api/v1/plans/stream/helpers.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/helpers.ts#L521) through [`src/app/api/v1/plans/stream/helpers.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/helpers.ts#L598), and the current lifecycle-specific path in [`src/app/api/v1/plans/stream/helpers.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/helpers.ts#L620) through [`src/app/api/v1/plans/stream/helpers.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/helpers.ts#L717). That is legacy protocol glue inside the current abstraction.
- The architecture doc claims plan generation is intentionally two-phase, with `POST /api/v1/plans` creating a shell and `POST /api/v1/plans/stream` only streaming content in [`docs/architecture/plan-generation-architecture.md`](/Users/juansaldana/Dev/Projects/atlaris/docs/architecture/plan-generation-architecture.md#L8) through [`docs/architecture/plan-generation-architecture.md`](/Users/juansaldana/Dev/Projects/atlaris/docs/architecture/plan-generation-architecture.md#L41).
- The shipped client does not follow that contract. The hook posts directly to `/api/v1/plans/stream` in [`src/hooks/useStreamingPlanGeneration.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/hooks/useStreamingPlanGeneration.ts#L148), which means the route is both shell-creation and stream-start for the actual product path.
- `POST /api/v1/plans` still exists and uses `PlanLifecycleService.createPlan/createPdfPlan`, but the search results show no current UI caller for it; the endpoint is covered by contract/integration tests, not by the live creation hook in [`src/app/api/v1/plans/route.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/route.ts#L117) through [`src/app/api/v1/plans/route.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/route.ts#L232).

Concrete friction:

- The stream route has to know that the wrapper-provided `getDb()` connection is only safe for rate limiting and that lifecycle work needs a separate stream-scoped client in [`src/app/api/v1/plans/stream/route.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/route.ts#L108) through [`src/app/api/v1/plans/stream/route.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/route.ts#L131).
- Retry duplicates stream setup shape rather than sharing one server-side session boundary.
- The session concept is split between discriminated lifecycle results (`generation_success`, `retryable_failure`, `already_finalized`) and SSE event concerns (`plan_start`, `complete`, sanitized `error`), so no single boundary owns both.
- The doc/runtime mismatch means you cannot honestly plan the interface without first deciding whether the intended product model is two-phase or one-phase.

### 2. Files to Change

| File | Change | Lines |
|------|--------|-------|
| `src/app/api/v1/plans/stream/route.ts` | Collapse route-owned session orchestration into a dedicated server session boundary | 62-383 |
| `src/app/api/v1/plans/[planId]/retry/route.ts` | Reuse the same session-start abstraction or intentionally diverge with a narrower adapter | 87-229 |
| `src/app/api/v1/plans/stream/helpers.ts` | Move event emission / fallback cleanup behind a clearer boundary or reduce to thin route adapter utilities | 84-717 |
| `src/features/plans/lifecycle/service.ts` | Either expand to own a session abstraction or remain a lower-level lifecycle core beneath a new session module | 43-481 |
| `src/features/plans/lifecycle/types.ts` | Rework lifecycle/session result types if route code should stop translating unions by hand | 90-222 |
| `src/features/plans/lifecycle/factory.ts` | Clarify DB lifetime ownership and adapter wiring | 1-39 |
| `src/app/api/v1/plans/route.ts` | Either restore as the real shell-creation entrypoint or explicitly demote if one-phase becomes the truth | 117-232 |
| `docs/architecture/plan-generation-architecture.md` | Align documentation to the chosen runtime model | 8-151 |

**New files:**

| File | Purpose |
|------|---------|
| `src/features/plans/session/server-session.ts` | Candidate home for a server-side session boundary that owns kickoff, lifecycle invocation, and typed session events |
| `src/features/plans/session/session-events.ts` | Optional home for typed session events if SSE stops being the primary internal contract |

### 3. Implementation Steps (TDD)

1. **Write tests for the real server session boundary first:**
   - Test manual create+stream success through one boundary, including plan shell creation and emitted session milestones.
   - Test retry path through the same boundary or explicit alternate boundary, including invalid statuses and existing capped plans.
   - Test long-lived stream cleanup semantics so route code no longer owns "second DB connection" knowledge.
   - Test the chosen truth for `POST /api/v1/plans` versus `/api/v1/plans/stream`.

2. **Implement the session boundary:**
   - Decide whether it owns SSE emission directly or returns typed session events.
   - Pull route-owned session choreography out of `stream/route.ts` and `retry/route.ts`.
   - Make DB lifetime an explicit session concern instead of route trivia.
   - Keep `PlanLifecycleService` either as a lower-level execution core or deepen it further; do not leave responsibilities split ambiguously.

3. **Validate:**
   - Run targeted server tests for `plans-stream`, `plans-retry`, and lifecycle service coverage.
   - Verify the chosen route contract with existing contract tests around `POST /api/v1/plans`.
   - Manually verify that early navigation does not break persisted generation.

### 4. Risk Areas

- **Overlap with authenticated-request-scope:** HIGH — stream route currently creates its own RLS client because request-scope lifetime is not long enough. Any change here can conflict with auth-scope redesign.
- **Behavioral change:** HIGH — the user-visible create flow may change depending on whether the app keeps early navigation on first `planId`.
- **Edge cases:** long-lived stream disconnects, already-finalized attempts, duplicate plans, invalid/tier-denied model overrides, PDF-origin proof and rollback behavior.
- **Test gaps:** current tests prove many route seams with dependency overrides instead of one behavioral session contract.
- **Doc drift risk:** if the team refuses to decide between two-phase and one-phase, the plan will stay dishonest.

### 5. Estimated Overlap

- **With Slice 2 (Client session controller):** Shared on session milestones, route choice, and redirect timing.
- **With Slice 3 (Contract/test consolidation):** Shared on event/result types and replacement of override-heavy tests.
- **With authenticated-request-scope:** Shared on DB lifetime and auth wrapper semantics; merge conflict risk is medium-to-high if both efforts move the same route files concurrently.
- **Merge recommendation:** settle the two-phase versus one-phase truth before implementation. Then land the server session boundary before client adoption.

---

## Slice 2: Client Session Controller

### 1. Current State

The client surface treats "plan generation session" as a hook plus duplicated panel choreography.

- `useStreamingPlanGeneration()` owns fetch, SSE parsing, local state, terminal event handling, auth-redirect detection, and promise resolution/rejection in [`src/hooks/useStreamingPlanGeneration.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/hooks/useStreamingPlanGeneration.ts#L123) through [`src/hooks/useStreamingPlanGeneration.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/hooks/useStreamingPlanGeneration.ts#L340).
- The hook always posts to `/api/v1/plans/stream`, not to `POST /api/v1/plans`, in [`src/hooks/useStreamingPlanGeneration.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/hooks/useStreamingPlanGeneration.ts#L148).
- The hook exposes a `persisting` status, but the server never emits a matching session milestone. That status is only entered when the reader ends without a terminal event in [`src/hooks/useStreamingPlanGeneration.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/hooks/useStreamingPlanGeneration.ts#L379) through [`src/hooks/useStreamingPlanGeneration.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/hooks/useStreamingPlanGeneration.ts#L386), so the client state machine already contains a fake state.
- `ManualCreatePanel` maps form values, starts generation, shows the success toast, pushes to the plan page when `onPlanIdReady` fires, and owns fallback redirect/toast behavior on failure in [`src/app/plans/new/components/ManualCreatePanel.tsx`](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/ManualCreatePanel.tsx#L58) through [`src/app/plans/new/components/ManualCreatePanel.tsx`](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/ManualCreatePanel.tsx#L140).
- `PdfCreatePanel` duplicates much of that session choreography after a separate extraction phase: it builds a different payload, calls the same `startGeneration`, shows the same success toast, pushes on `onPlanIdReady`, then partially diverges in error-state handling in [`src/app/plans/new/components/PdfCreatePanel.tsx`](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/PdfCreatePanel.tsx#L230) through [`src/app/plans/new/components/PdfCreatePanel.tsx`](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/PdfCreatePanel.tsx#L508).
- Shared error recovery logic lives in `handleStreamingPlanError`, which treats auth-required, abort, and partial-failure-with-planId differently, including redirecting users onto the partially created plan page in [`src/app/plans/new/components/streamingPlanError.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/streamingPlanError.ts#L34) through [`src/app/plans/new/components/streamingPlanError.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/streamingPlanError.ts#L88).
- `CreatePlanPageClient` owns method switching and prefill handoff from PDF to manual, but not session state. That keeps page-state and session-state as two separate client coordinators in [`src/app/plans/new/components/CreatePlanPageClient.tsx`](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/CreatePlanPageClient.tsx#L23) through [`src/app/plans/new/components/CreatePlanPageClient.tsx`](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/CreatePlanPageClient.tsx#L138).

Concrete friction:

- Manual and PDF creation each own submission guards, success toasts, navigation timing, and error recovery instead of sharing one session controller.
- The hook exposes low-level stream state, but the panels still have to know too much about session milestones and how to recover from partial failures.
- Redirect timing is a design decision hiding as callback ergonomics: both panels navigate on first `planId` availability, not on session completion.
- Retry already proves the protocol is duplicated, not shared: [`src/hooks/useRetryGeneration.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/hooks/useRetryGeneration.ts#L138) through [`src/hooks/useRetryGeneration.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/hooks/useRetryGeneration.ts#L230) reimplements its own fetch, decode, parse, and terminal-event loop instead of consuming the same client session boundary.
- The PDF flow has two async sub-flows (extraction, then generation) but only the second uses the shared generation hook, so the page has no unified create-session story.

### 2. Files to Change

| File | Change | Lines |
|------|--------|-------|
| `src/hooks/useStreamingPlanGeneration.ts` | Replace low-level stream hook with a clearer session controller or split transport from session orchestration | 123-340 |
| `src/app/plans/new/components/ManualCreatePanel.tsx` | Stop owning redirect/toast/error choreography directly | 58-140 |
| `src/app/plans/new/components/PdfCreatePanel.tsx` | Move generation-session choreography into shared client controller; leave PDF extraction concerns local | 230-508 |
| `src/app/plans/new/components/streamingPlanError.ts` | Either absorb into a session controller or reduce to a thin presenter utility | 34-88 |
| `src/app/plans/new/components/CreatePlanPageClient.tsx` | Potential place to own shared client session coordination above manual/PDF panels | 23-138 |

**New files:**

| File | Purpose |
|------|---------|
| `src/features/plans/session/usePlanGenerationSession.ts` | Candidate shared client controller for plan generation lifecycle and redirect/error policy |
| `src/features/plans/session/session-navigation.ts` | Optional home for plan-id-ready versus completion navigation rules |

### 3. Implementation Steps (TDD)

1. **Write behavior-first client tests:**
   - Test manual and PDF creation through one shared session controller, not by mocking hook internals separately.
   - Test auth-required redirect policy, abort handling, and partial-failure-with-planId recovery.
   - Test chosen navigation milestone: first `planId`, first persisted shell, or completed stream.

2. **Implement the shared client controller:**
   - Separate transport parsing from session policy.
   - Move success/error/redirect orchestration out of both panels.
   - Keep PDF extraction outside the shared controller unless the controller explicitly models pre-generation phases too.

3. **Validate:**
   - Run hook/controller tests and plan creation panel tests.
   - Manually verify manual create, PDF create, cancellation, auth redirect, and failure-to-plan-page recovery.

### 4. Risk Areas

- **Behavioral change:** HIGH — users currently navigate as soon as the first `planId` arrives. Changing that changes perceived speed and failure recovery.
- **Edge cases:** auth redirect after non-SSE response, abort while stream still persists on server, PDF extraction success followed by generation failure.
- **State split risk:** if extraction and generation remain modeled separately, the page can keep suffering from dual-controller drift.
- **Test gaps:** current panel tests mock the hook rather than exercising one real session controller boundary.

### 5. Estimated Overlap

- **With Slice 1 (Server session boundary):** High overlap on route choice and session milestones.
- **With Slice 3 (Contract/test consolidation):** Shared on event naming, parsing, and what the client actually consumes.
- **Merge recommendation:** land the server/session contract first or at least freeze it before changing client orchestration.

---

## Slice 3: Session Contract And Test Consolidation

### 1. Current State

The session contract is split between transport-specific types, validation schema, helper functions, and tests that often assert seam choreography rather than boundary behavior.

- SSE event types live in [`src/features/ai/types/streaming.types.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/features/ai/types/streaming.types.ts#L1) through [`src/features/ai/types/streaming.types.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/features/ai/types/streaming.types.ts#L75).
- Runtime validation for those same events lives separately in [`src/features/ai/streaming/schema.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/features/ai/streaming/schema.ts#L1) through [`src/features/ai/streaming/schema.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/features/ai/streaming/schema.ts#L63).
- Client parsing logic then wraps that schema in [`src/hooks/streaming/parse-sse-plan-event.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/hooks/streaming/parse-sse-plan-event.ts#L1) through [`src/hooks/streaming/parse-sse-plan-event.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/hooks/streaming/parse-sse-plan-event.ts#L39).
- Model resolution is a separate route helper in [`src/app/api/v1/plans/stream/model-resolution.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/model-resolution.ts#L1) through [`src/app/api/v1/plans/stream/model-resolution.ts`](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/model-resolution.ts#L67), which means "session startup contract" is already fragmented before generation begins.
- The big integration suite for `plans-stream` uses `createStreamHandler` overrides to inject `processGenerationAttempt` and assert route behavior in [`tests/integration/api/plans-stream.spec.ts`](/Users/juansaldana/Dev/Projects/atlaris/tests/integration/api/plans-stream.spec.ts#L66) through at least [`tests/integration/api/plans-stream.spec.ts`](/Users/juansaldana/Dev/Projects/atlaris/tests/integration/api/plans-stream.spec.ts#L520).
- `plans-retry` tests use the same override-heavy pattern on `createRetryHandler` in [`tests/integration/api/plans-retry.spec.ts`](/Users/juansaldana/Dev/Projects/atlaris/tests/integration/api/plans-retry.spec.ts#L49) through [`tests/integration/api/plans-retry.spec.ts`](/Users/juansaldana/Dev/Projects/atlaris/tests/integration/api/plans-retry.spec.ts#L203).
- Hook tests validate raw SSE handling directly in [`tests/unit/hooks/useStreamingPlanGeneration.spec.tsx`](/Users/juansaldana/Dev/Projects/atlaris/tests/unit/hooks/useStreamingPlanGeneration.spec.tsx#L35) through [`tests/unit/hooks/useStreamingPlanGeneration.spec.tsx`](/Users/juansaldana/Dev/Projects/atlaris/tests/unit/hooks/useStreamingPlanGeneration.spec.tsx#L175).
- Panel tests mock the hook entirely and then assert form-to-hook choreography in [`tests/unit/app/plans/new/page.spec.tsx`](/Users/juansaldana/Dev/Projects/atlaris/tests/unit/app/plans/new/page.spec.tsx#L25) through [`tests/unit/app/plans/new/page.spec.tsx`](/Users/juansaldana/Dev/Projects/atlaris/tests/unit/app/plans/new/page.spec.tsx#L240).
- Some helper tests are extremely local, such as `safeMarkPlanFailed` swallowing errors in [`tests/unit/ai/streaming/helpers.spec.ts`](/Users/juansaldana/Dev/Projects/atlaris/tests/unit/ai/streaming/helpers.spec.ts#L21) through [`tests/unit/ai/streaming/helpers.spec.ts`](/Users/juansaldana/Dev/Projects/atlaris/tests/unit/ai/streaming/helpers.spec.ts#L36), which is a symptom of a boundary that still leaks implementation details.

Concrete friction:

- The contract is duplicated across types and zod schema without a single obvious authority.
- Integration tests replace too much internal behavior with overrides, which makes refactors safer for the seams than for the actual session boundary.
- The test harness also leans on an ad-hoc stream reader in `tests/helpers/streaming.ts`, which makes it easier to preserve wire-format behavior in tests while still missing a broken higher-level session contract.
- Contract tests exist for `POST /api/v1/plans`, but the live client path bypasses that endpoint, so test confidence is split across parallel truths.

### 2. Files to Change

| File | Change | Lines |
|------|--------|-------|
| `src/features/ai/types/streaming.types.ts` | Re-home or clarify authority for session event types | 1-75 |
| `src/features/ai/streaming/schema.ts` | Align validation to the chosen contract authority | 1-63 |
| `src/hooks/streaming/parse-sse-plan-event.ts` | Simplify once the session contract is clearer | 1-39 |
| `src/app/api/v1/plans/stream/model-resolution.ts` | Decide whether model resolution is part of session startup or a lower-level helper | 1-67 |
| `tests/integration/api/plans-stream.spec.ts` | Replace override-heavy route tests with higher-value session-boundary coverage | 66-520 and remaining cases |
| `tests/integration/api/plans-retry.spec.ts` | Same for retry session coverage | 49-203 |
| `tests/unit/hooks/useStreamingPlanGeneration.spec.tsx` | Replace raw transport parsing tests with controller-boundary tests if the hook changes shape | 35-175 |
| `tests/unit/app/plans/new/page.spec.tsx` | Stop mocking the session hook as the primary way to prove flow behavior | 25-240 |

**New files:**

| File | Purpose |
|------|---------|
| `tests/integration/session/plan-generation-session.spec.ts` | Candidate high-value integration suite for end-to-end session behavior |
| `tests/unit/session/plan-session-controller.spec.tsx` | Candidate controller-level client session tests |

### 3. Implementation Steps (TDD)

1. **Write replacement tests first:**
   - One server-side session integration suite covering create+stream, retry, disconnect, and failure recovery through the chosen session boundary.
   - One client-side session controller suite covering navigation, error policy, and milestone handling.
   - Contract-level tests for the chosen event/result authority.

2. **Refactor test surface:**
   - Delete or shrink tests that only verify internal override seams once the boundary tests exist.
   - Keep model-resolution tests if model selection remains a stable public rule.

3. **Validate:**
   - Run the new boundary suites plus any still-relevant contract tests.
   - Confirm no lost coverage for PDF create, retry, and disconnect persistence.

### 4. Risk Areas

- **Coverage regression:** if old seam tests are deleted before real boundary tests exist, you will make the codebase feel cleaner while making it less safe.
- **Behavioral drift masked by mocks:** current override-heavy tests can green-light a broken real session path.
- **Doc/contract mismatch:** if the team does not pick one truth for create-versus-stream flow, tests will continue protecting both stories badly.

### 5. Estimated Overlap

- **With Slice 1:** High overlap because session boundary choice dictates test shape.
- **With Slice 2:** High overlap because client controller and emitted contract are inseparable.
- **Merge recommendation:** land this after or alongside Slice 1, not before, or you will harden the wrong abstraction.

---

## Cross-Slice Analysis

### Recommended Implementation Order

```text
Recommended truth: keep current one-phase interactive create/stream flow
  └── Slice 1: Server session boundary
        ├── Slice 3: Contract and boundary-test consolidation
        └── Slice 2: Client session controller adoption
```

**Rationale:** until the server-side session truth is decided, both the contract and the client are standing on sand. The worst move here would be to clean up the client first and cement today’s server ambiguity into a nicer API.

### Shared File Map

| File | Slice 1 | Slice 2 | Slice 3 |
|------|---------|---------|---------|
| `src/app/api/v1/plans/stream/route.ts` | ✅ primary | — | ✅ |
| `src/app/api/v1/plans/[planId]/retry/route.ts` | ✅ primary | — | ✅ |
| `src/app/api/v1/plans/stream/helpers.ts` | ✅ primary | — | ✅ |
| `src/features/plans/lifecycle/service.ts` | ✅ primary | — | ✅ |
| `src/hooks/useStreamingPlanGeneration.ts` | — | ✅ primary | ✅ |
| `src/app/plans/new/components/ManualCreatePanel.tsx` | — | ✅ primary | ✅ |
| `src/app/plans/new/components/PdfCreatePanel.tsx` | — | ✅ primary | ✅ |
| `src/app/plans/new/components/streamingPlanError.ts` | — | ✅ primary | ✅ |
| `src/features/ai/types/streaming.types.ts` | — | ✅ consumer | ✅ primary |
| `src/features/ai/streaming/schema.ts` | — | ✅ consumer | ✅ primary |

### Key Findings

1. The current product path is already one-phase from the client’s perspective, regardless of what the docs say.
2. Route code still knows too much about DB lifetime and session startup policy.
3. Manual and PDF create flows duplicate client-side session choreography.
4. The current client state machine already contains a fake `persisting` milestone, which is a warning that the protocol and consumer are out of sync.
5. The test suite is spending a lot of effort protecting seams that should disappear once the session boundary is real.
