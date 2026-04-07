# Research: Plan Generation Session

> **Research date:** 2026-04-05
> **Status:** Initial research complete — ready for planning decisions
> **Adjacent work:** [Authenticated Request Scope research](/Users/juansaldana/Dev/Projects/atlaris/.plans/authenticated-request-scope/research.md)

## Current-State Summary

The repo has a deeper `PlanLifecycleService`, but the full "plan generation session" is still split across too many layers:

- The create stream route still owns request parsing, generation-specific rate limiting, stream-scoped DB lifetime, create-result-to-HTTP mapping, model-resolution logging, SSE startup, and cleanup around the service call in [src/app/api/v1/plans/stream/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/route.ts#L62).
- The retry route re-implements a second version of that orchestration, but with different connection assumptions, in [src/app/api/v1/plans/[planId]/retry/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/[planId]/retry/route.ts#L87).
- The transport helper only knows how to map `GenerationAttemptResult` to SSE events, not how to own the whole server-side session, in [src/app/api/v1/plans/stream/helpers.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/helpers.ts#L602).
- That same helper file still contains a legacy generic executor path in [src/app/api/v1/plans/stream/helpers.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/helpers.ts#L521), so the protocol layer is already carrying dead weight.
- The lifecycle service is genuinely deeper for creation and attempt processing, but it still stops at "business operation result", leaving routes to own session concerns in [src/features/plans/lifecycle/service.ts](/Users/juansaldana/Dev/Projects/atlaris/src/features/plans/lifecycle/service.ts#L43).
- The create client hook owns fetch + SSE parsing + state machine for only one endpoint (`/api/v1/plans/stream`) in [src/hooks/useStreamingPlanGeneration.ts](/Users/juansaldana/Dev/Projects/atlaris/src/hooks/useStreamingPlanGeneration.ts#L123).
- The create hook also exposes a `persisting` state with no matching server event; that status is only entered after the stream ends without a terminal event in [src/hooks/useStreamingPlanGeneration.ts](/Users/juansaldana/Dev/Projects/atlaris/src/hooks/useStreamingPlanGeneration.ts#L379).
- Retry uses a completely separate hook with duplicated SSE parsing and different terminal semantics in [src/hooks/useRetryGeneration.ts](/Users/juansaldana/Dev/Projects/atlaris/src/hooks/useRetryGeneration.ts#L84).
- The creation panels own redirect, toast, and recovery policy on top of the hook in [src/app/plans/new/components/ManualCreatePanel.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/ManualCreatePanel.tsx#L58) and [src/app/plans/new/components/PdfCreatePanel.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/PdfCreatePanel.tsx#L230).

This is the core friction: one user workflow is still coordinated by hand across route, helper, service, hook, panel, and retry-only variants.

## Recommended Decisions

These are the recommended defaults for the implementation plan:

1. Use one first-class generation-session abstraction for interactive `create + retry`.
2. Treat the current one-phase `/api/v1/plans/stream` create flow as the operational truth for this refactor.
3. Keep cancellation as disconnect/recovery for this pass; do not add true server-side cancellation now.
4. Preserve redirect-on-`plan_start` for this pass.
5. Fix the long-lived RLS/session lifetime story locally in this effort instead of blocking on authenticated-request-scope.
6. Keep queued regeneration out of first-pass scope; treat it as a follow-up alignment target.

## Key Findings

### 1. The server session boundary is not real yet

The create route still performs the session-critical work itself:

- open/close a special long-lived RLS connection in [stream/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/route.ts#L108)
- branch AI vs PDF creation input mapping in [stream/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/route.ts#L138)
- translate lifecycle outcomes into HTTP/AppError shapes in [stream/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/route.ts#L167)
- resolve and log model-selection policy in [stream/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/route.ts#L212)
- build `ProcessGenerationInput` and wire transport callbacks in [stream/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/route.ts#L275)

That is too much policy for something that claims to be "delegated to lifecycle".

### 2. Retry is a near-copy with drift risk

The retry route repeats the same general orchestration shape:

- rate limit check in [retry/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/[planId]/retry/route.ts#L96)
- resolve tier and build generation input in [retry/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/[planId]/retry/route.ts#L120)
- create lifecycle service and wrap SSE emission in [retry/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/[planId]/retry/route.ts#L123)
- use the same `executeLifecycleGenerationStream` helper in [retry/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/[planId]/retry/route.ts#L175)

This means create and retry are already coupled, but the coupling is duplicated instead of absorbed.

### 3. There is a likely production-only closed-connection risk in retry

This is an inference from the code, not a reproduced failure yet.

- `withAuth` returns the route `Response` and then always runs cleanup in `finally` via `runWithAuthenticatedContext` in [src/lib/api/auth.ts](/Users/juansaldana/Dev/Projects/atlaris/src/lib/api/auth.ts#L147).
- `getDb()` in non-test runtime returns the request-scoped RLS client from request context in [src/lib/db/runtime.ts](/Users/juansaldana/Dev/Projects/atlaris/src/lib/db/runtime.ts#L24).
- The retry route passes that request-scoped DB into `createPlanLifecycleService(...)` for SSE work in [retry/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/[planId]/retry/route.ts#L123).
- The lifecycle factory explicitly documents the prior "closed connection" bug and says only the create stream route gets a stream-scoped connection, while retry uses request-scoped DB in [src/features/plans/lifecycle/factory.ts](/Users/juansaldana/Dev/Projects/atlaris/src/features/plans/lifecycle/factory.ts#L6).

If the stream outlives the route callback, retry is exposed to the same failure class the create route already had. Tests are unlikely to catch it because test runtime forces `getDb()` to the service-role DB in [src/lib/db/runtime.ts](/Users/juansaldana/Dev/Projects/atlaris/src/lib/db/runtime.ts#L24).

### 4. Model resolution is split across two layers

- The stream route decides query-override vs saved-preference vs tier-default and logs the decision in [src/app/api/v1/plans/stream/model-resolution.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/model-resolution.ts#L18).
- The generation adapter still resolves provider/model again at execution time in [src/features/plans/lifecycle/adapters/generation-adapter.ts](/Users/juansaldana/Dev/Projects/atlaris/src/features/plans/lifecycle/adapters/generation-adapter.ts#L20).

That split is manageable today, but it is still one concern with two owners.

### 5. "Cancel" semantics are misleading

- The client hook aborts the fetch in [src/hooks/useStreamingPlanGeneration.ts](/Users/juansaldana/Dev/Projects/atlaris/src/hooks/useStreamingPlanGeneration.ts#L127).
- The event stream aborts its internal signal on stream cancellation in [src/features/ai/streaming/events.ts](/Users/juansaldana/Dev/Projects/atlaris/src/features/ai/streaming/events.ts#L79).
- The server helper explicitly treats client disconnect as "result saved to DB" in [src/app/api/v1/plans/stream/helpers.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/helpers.ts#L700).
- The UI tells the user "Generation cancelled" in [src/app/plans/new/components/streamingPlanError.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/streamingPlanError.ts#L48).

That is not a true cancellation guarantee. It is "stop listening locally and hope the server path handles disconnect sanely."

### 6. Client session semantics are duplicated

- Create flow: [useStreamingPlanGeneration.ts](/Users/juansaldana/Dev/Projects/atlaris/src/hooks/useStreamingPlanGeneration.ts#L123)
- Retry flow: [useRetryGeneration.ts](/Users/juansaldana/Dev/Projects/atlaris/src/hooks/useRetryGeneration.ts#L84)

Both parse SSE lines, handle terminal events, surface errors, and own navigation-side state transitions, but they diverge in API shape and behavior.

## Slice 1: Server Session Controller

### 1. Current State

The server-side session orchestration for create and retry is spread across:

- [src/app/api/v1/plans/stream/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/route.ts#L62)
- [src/app/api/v1/plans/[planId]/retry/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/[planId]/retry/route.ts#L87)
- [src/app/api/v1/plans/stream/helpers.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/helpers.ts#L602)
- [src/features/plans/lifecycle/service.ts](/Users/juansaldana/Dev/Projects/atlaris/src/features/plans/lifecycle/service.ts#L43)
- [src/features/plans/lifecycle/factory.ts](/Users/juansaldana/Dev/Projects/atlaris/src/features/plans/lifecycle/factory.ts#L1)
- [src/app/api/v1/plans/stream/model-resolution.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/model-resolution.ts#L18)

Runtime flow today:

1. Auth wrapper resolves user and request-scoped DB.
2. Route performs rate limiting.
3. Create route opens a second, stream-scoped DB connection; retry route does not.
4. Route creates lifecycle service with a no-op job queue.
5. Route calls `createPlan` or reconstructs `ProcessGenerationInput` for retry.
6. Route wraps lifecycle execution in SSE transport callbacks.
7. Helper maps service result to transport events.
8. Route or helper performs cleanup/failure marking.

This is the most important deepening target because the same orchestration logic already exists twice, and not even with the same connection-lifetime guarantees.

### 2. Files to Change

| File | Change | Lines |
|------|--------|-------|
| `src/app/api/v1/plans/stream/route.ts` | Shrink into thin HTTP adapter around a server-session module | 62-380 |
| `src/app/api/v1/plans/[planId]/retry/route.ts` | Converge on the same server-session module instead of parallel orchestration | 87-229 |
| `src/app/api/v1/plans/stream/helpers.ts` | Decide whether SSE emission stays here or moves under a session controller | 602-717 |
| `src/features/plans/lifecycle/service.ts` | Potentially expose/create session-level entrypoints or stay pure business service | 158-480 |
| `src/features/plans/lifecycle/factory.ts` | Fix or remove the retry route's request-scoped DB assumption | 1-39 |
| `src/app/api/v1/plans/stream/model-resolution.ts` | Re-home if model policy becomes part of session construction | 1-62 |
| `src/lib/api/auth.ts` | Overlap risk only if stream-scoped auth/session lifecycle becomes a shared abstraction | 147-205 |

**New files (likely):**

| File | Purpose |
|------|---------|
| `src/features/plans/session/server-session.ts` | Own create/retry orchestration, DB lifetime rules, and lifecycle-to-transport mapping |
| `src/features/plans/session/server-session.types.ts` | Session-specific inputs/results separate from raw route payloads |

### 3. Implementation Steps (TDD)

1. **Write session-boundary tests first:**
   - Create and retry should both run through the same server-session entrypoint.
   - Session entrypoint must guarantee correct DB lifetime for streamed work.
   - Create and retry should produce the same SSE contract for success, retryable failure, permanent failure, and disconnect.

2. **Extract route orchestration into a shared server-session module:**
   - Move create/retry session wiring out of the routes.
   - Keep routes responsible only for HTTP request validation, route params, and response construction.
   - Make DB lifetime policy explicit in the session module instead of hidden in route-local helpers.

3. **Unify create/retry orchestration:**
   - Remove duplicated no-op job queue setup, `processGeneration` binding, and `executeLifecycleGenerationStream(...)` wiring.
   - Make retry use the same connection-lifetime story as create, or explicitly justify why it is different.

4. **Validate:**
   - Run targeted route/session tests.
   - Verify failure marking and cleanup paths still behave correctly.
   - Manually inspect whether disconnect semantics remain intentional.

### 4. Risk Areas

- **Merge conflict risk with authenticated request scope:** HIGH — any fix to stream-scoped auth/DB lifetime overlaps [authenticated-request-scope research](/Users/juansaldana/Dev/Projects/atlaris/.plans/authenticated-request-scope/research.md).
- **Behavioral change:** HIGH — create/retry routes are user-visible and rate-limit sensitive.
- **Edge cases:** PDF-origin creation, duplicate detection, invalid model overrides, disconnect during generation, already-finalized retries.
- **Test gaps:** Current test runtime masks request-scoped RLS cleanup behavior via service-role `getDb()`.

### 5. Estimated Overlap

- **With Slice 2:** Shared because client behavior depends on when the server emits `plan_start`, `error`, and `complete`.
- **With Slice 3:** Shared because transport contract changes will ripple into session controller shape.
- **With authenticated request scope:** Shared DB lifetime and wrapper cleanup assumptions.
- **Merge recommendation:** Land this before or alongside any client unification so transport semantics stop drifting.

## Slice 2: Client Session Controller

### 1. Current State

The client-side session concept is split across:

- [src/hooks/useStreamingPlanGeneration.ts](/Users/juansaldana/Dev/Projects/atlaris/src/hooks/useStreamingPlanGeneration.ts#L123)
- [src/hooks/useRetryGeneration.ts](/Users/juansaldana/Dev/Projects/atlaris/src/hooks/useRetryGeneration.ts#L84)
- [src/app/plans/new/components/ManualCreatePanel.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/ManualCreatePanel.tsx#L58)
- [src/app/plans/new/components/PdfCreatePanel.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/PdfCreatePanel.tsx#L230)
- [src/app/plans/new/components/streamingPlanError.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/streamingPlanError.ts#L34)
- [src/app/plans/[id]/components/PlanDraftView.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/[id]/components/PlanDraftView.tsx#L11)

Concrete friction:

- Create and retry use different hooks for the same transport style.
- `useStreamingPlanGeneration` hardcodes `/api/v1/plans/stream` instead of modelling a session transport generically.
- The panels own navigation-on-`plan_start` and recovery-on-error themselves in [ManualCreatePanel.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/ManualCreatePanel.tsx#L99) and [PdfCreatePanel.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/PdfCreatePanel.tsx#L443).
- Error recovery is a helper that reaches back into the hook’s `StreamingError` shape in [streamingPlanError.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/streamingPlanError.ts#L57).

This is why UI tests mock the hook instead of testing behavior at a real session boundary.

### 2. Files to Change

| File | Change | Lines |
|------|--------|-------|
| `src/hooks/useStreamingPlanGeneration.ts` | Generalize into a session hook or session client | 123-408 |
| `src/hooks/useRetryGeneration.ts` | Either delete via convergence or reduce to a thin retry adapter | 84-215 |
| `src/app/plans/new/components/ManualCreatePanel.tsx` | Remove session-policy wiring from the panel | 58-140 |
| `src/app/plans/new/components/PdfCreatePanel.tsx` | Remove duplicated start/recovery policy from the panel | 230-508 |
| `src/app/plans/new/components/streamingPlanError.ts` | Fold into session boundary or keep as a clearer transport-policy helper | 34-88 |
| `src/app/plans/[id]/components/PlanDraftView.tsx` | Potentially adapt to richer shared session state | 11-99 |

**New files (likely):**

| File | Purpose |
|------|---------|
| `src/features/plans/session/usePlanGenerationSession.ts` | Shared client hook for create/retry session state and terminal transitions |
| `src/features/plans/session/client-session-errors.ts` | Shared transport-to-UI recovery rules if not embedded in the hook |

### 3. Implementation Steps (TDD)

1. **Write shared client-session tests first:**
   - Create flow should expose plan ID as soon as `plan_start` arrives.
   - Retry flow should be able to reuse the same event parser and terminal handling.
   - Abort/disconnect semantics should be explicit and tested, not hand-waved through toast assertions.

2. **Collapse duplicate SSE parsing logic:**
   - Share line parsing, terminal event handling, and error normalization between create and retry.
   - Decide whether create and retry are two entrypoints on one hook or one generic session client plus thin wrappers.

3. **Move navigation/error policy down or make it declarative:**
   - Panels should not each decide how to recover from partial failure.
   - If redirects remain panel-level, the hook should return enough structured outcome to keep those decisions simple and consistent.

4. **Validate:**
   - Run hook tests.
   - Replace panel tests that only prove mocked-hook interactions with tests that assert observable navigation/error behavior.

### 4. Risk Areas

- **Merge conflict risk with Slice 3:** HIGH — any event contract change affects hook behavior.
- **Behavioral change:** MEDIUM/HIGH — create currently redirects on `plan_start`, retry refreshes on `complete`.
- **Edge cases:** auth redirect, no `planId` in terminal error, abort after `plan_start`, partial failure with persisted plan.
- **Test gaps:** Existing panel tests are implementation-heavy and do not prove the end-to-end session semantics.

### 5. Estimated Overlap

- **With Slice 1:** Shared through event timing and session termination semantics.
- **With Slice 3:** Shared through event contract parsing and error-code normalization.
- **Merge recommendation:** Land after Slice 1 is stable enough that the client hook is not built on a moving server contract.

## Slice 3: Session Transport Contract And Cancellation Semantics

### 1. Current State

The transport contract currently spans:

- [src/features/ai/types/streaming.types.ts](/Users/juansaldana/Dev/Projects/atlaris/src/features/ai/types/streaming.types.ts#L1)
- [src/hooks/streaming/parse-sse-plan-event.ts](/Users/juansaldana/Dev/Projects/atlaris/src/hooks/streaming/parse-sse-plan-event.ts#L1)
- [src/features/ai/streaming/events.ts](/Users/juansaldana/Dev/Projects/atlaris/src/features/ai/streaming/events.ts#L1)
- [src/app/api/v1/plans/stream/helpers.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/stream/helpers.ts#L602)

Problems:

- The contract is typed, but ownership is split between transport utils, route helpers, and client hooks.
- `cancelled` exists in the event schema, but most visible cancellation behavior today comes from local fetch abort rather than a server-emitted cancel event.
- The create hook invents a `persisting` state when the stream ends without terminal events in [useStreamingPlanGeneration.ts](/Users/juansaldana/Dev/Projects/atlaris/src/hooks/useStreamingPlanGeneration.ts#L368), which is a transport-level ambiguity leaking into UI state.

### 2. Files to Change

| File | Change | Lines |
|------|--------|-------|
| `src/features/ai/types/streaming.types.ts` | Clarify canonical session event contract | 1-68 |
| `src/hooks/streaming/parse-sse-plan-event.ts` | Keep parsing thin and contract-centric | 1-35 |
| `src/features/ai/streaming/events.ts` | Clarify cancel/disconnect behavior and ownership | 1-89 |
| `src/app/api/v1/plans/stream/helpers.ts` | Centralize event-emission policy or split transport concerns from session concerns | 602-717 |
| `src/hooks/useStreamingPlanGeneration.ts` | Remove synthetic states that the server contract does not actually define | 233-397 |

**New files (likely):**

| File | Purpose |
|------|---------|
| `src/features/plans/session/session-events.ts` | Session-specific event contract if you want to stop burying it under generic AI streaming |
| `docs/architecture/plan-generation-session.md` | Canonical lifecycle + transport contract once agreed |

### 3. Implementation Steps (TDD)

1. **Write contract tests first:**
   - Server helper emits the exact event sequence expected for success/failure/disconnect.
   - Client parser rejects malformed or drifted events predictably.
   - Abort/disconnect semantics are explicit: local abort, server cancel, server continues after disconnect.

2. **Decide and encode cancellation semantics:**
   - Either support true server-side cancel or explicitly document "disconnect only".
   - Remove ambiguous UI wording if true cancellation is not supported.

3. **Make session state map directly to transport states:**
   - Avoid client-only synthetic states unless the server protocol justifies them.
   - Keep event ownership near the session boundary, not scattered across generic helpers and hooks.

4. **Validate:**
   - Run transport helper/hook tests.
   - Verify create and retry still agree on event handling.

### 4. Risk Areas

- **Behavioral change:** HIGH — touches error UX, cancel UX, and SSE compatibility.
- **Edge cases:** malformed JSON, missing `planId`, disconnect after partial data, auth redirect returning HTML instead of SSE.
- **Test gaps:** current tests cover pieces, but not the whole create/retry contract as one boundary.

### 5. Estimated Overlap

- **With Slice 1:** Server-session orchestration emits the contract.
- **With Slice 2:** Client-session controller consumes the contract.
- **Merge recommendation:** Land contract clarification alongside Slice 1, then adapt Slice 2 to it.

## Cross-Slice Analysis

### Recommended Implementation Order

1. Slice 1 — Server Session Controller
2. Slice 3 — Session Transport Contract And Cancellation Semantics
3. Slice 2 — Client Session Controller
4. Documentation/test cleanup

**Rationale:** The server currently has the highest risk and the strongest architectural lie. Fixing the client first would just preserve and repackage a drifting contract. The transport contract should be stabilized before the client abstraction is unified.

### Shared File Map

| File | Slice 1 | Slice 2 | Slice 3 |
|------|---------|---------|---------|
| `src/app/api/v1/plans/stream/route.ts` | primary | — | secondary |
| `src/app/api/v1/plans/[planId]/retry/route.ts` | primary | — | secondary |
| `src/app/api/v1/plans/stream/helpers.ts` | primary | — | primary |
| `src/features/plans/lifecycle/service.ts` | primary | — | — |
| `src/hooks/useStreamingPlanGeneration.ts` | — | primary | primary |
| `src/hooks/useRetryGeneration.ts` | — | primary | secondary |
| `src/features/ai/types/streaming.types.ts` | — | secondary | primary |
| `src/features/ai/streaming/events.ts` | secondary | — | primary |

## Test Surface To Replace Or Simplify

- [tests/integration/api/plans-stream.spec.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/integration/api/plans-stream.spec.ts#L1)
- [tests/integration/api/plans-retry.spec.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/integration/api/plans-retry.spec.ts#L1)
- [tests/unit/features/plans/lifecycle/service.spec.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/unit/features/plans/lifecycle/service.spec.ts#L1)
- [tests/unit/features/plans/lifecycle/process-generation.spec.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/unit/features/plans/lifecycle/process-generation.spec.ts#L1)
- [tests/unit/hooks/useStreamingPlanGeneration.spec.tsx](/Users/juansaldana/Dev/Projects/atlaris/tests/unit/hooks/useStreamingPlanGeneration.spec.tsx#L1)
- [tests/unit/app/plans/new/page.spec.tsx](/Users/juansaldana/Dev/Projects/atlaris/tests/unit/app/plans/new/page.spec.tsx#L1)
- [tests/unit/ai/streaming/helpers.spec.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/unit/ai/streaming/helpers.spec.ts#L1)
- [tests/unit/app/api/v1/plans/stream/helpers-usage.spec.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/unit/app/api/v1/plans/stream/helpers-usage.spec.ts#L1)

The goal is not "more tests". The goal is fewer tests that sit closer to the actual session boundary and stop mocking every layer separately.

## Questions The Code Cannot Answer

1. Do you want to preserve SSE as the primary transport, or are you open to moving toward "create session + durable status channel" instead of long-lived request streams?
2. Should create and retry converge on one client-visible session abstraction, or do you intentionally want two separate user experiences?
3. Do you want true server-side cancellation semantics, or is "disconnect locally and recover from the plan page" acceptable as the explicit product behavior?
4. Are you willing to move redirect/toast policy closer to the session boundary, or do you want that to remain panel-level even if it keeps some duplication?
