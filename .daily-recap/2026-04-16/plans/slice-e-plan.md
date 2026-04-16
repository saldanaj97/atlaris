# Slice E Plan — Client lifecycle / UI extraction

## Step E.0 - Confirm scope, acceptance criteria, and backend dependencies

### Scope confirmed from shared research

- Slice E follows Slice D in the agreed execution order and should not redefine backend lifecycle ownership.
- The slice covers four primary refactors only:
  1. keep the existing client draft/editor boundaries explicit and move mapper-adjacent payload helpers out of UI components instead of introducing a second draft abstraction above `create-mapper.ts`,
  2. extract SSE reading/parsing out of the React session hook,
  3. extract PDF upload/extraction logic out of `PdfCreatePanel`,
  4. thin `ManualCreatePanel`, `PdfCreatePanel`, `PlanPendingState`, and the related wrapper hooks by reusing smaller shared session / polling primitives instead of introducing a new client-side monolith.
- Mapping should keep flowing through `src/features/plans/create-mapper.ts`; Slice E should collocate manual payload helpers there (or in a sibling helper) instead of introducing a second mapping layer.
- `CreatePlanPageClient` remains the route-level method switcher and should only change if a thinner shared client seam naturally replaces the current `prefillTopic` / `topicResetVersion` handoff.

### Acceptance criteria

- A non-React SSE reader primitive exists and `usePlanGenerationSession()` becomes a thin React state wrapper around it.
- `usePlanGenerationSession()` owns the stream reader (`consumePlanGenerationSseStream` + `parseSsePlanEventLine`); `useStreamingPlanGeneration()` and `useRetryGeneration()` stay thin wrappers over that session. `usePlanStatus()` remains polling-only (backoff / status fetch) and does not parse SSE, but it composes cleanly with the session hooks on surfaces like the pending page without duplicating stream reads.
- Manual payload-build logic no longer lives in `ManualCreatePanel.tsx`, and the existing `usePdfExtractionDraft()` seam remains the explicit post-extraction editing boundary unless a thinner shared adapter clearly replaces it.
- PDF upload/extraction request, timeout, abort, parse, and error logic move into a dedicated client hook (`usePdfExtraction()` or equivalent) so `PdfCreatePanel` becomes phase orchestration plus rendering.
- `ManualCreatePanel`, `PdfCreatePanel`, and `PlanPendingState` consume thinner shared session / polling primitives; trivial compatibility wrappers are acceptable if they stay thin.
- Manual create, PDF create, PDF preview edit/reset behavior, retry, redirect-on-plan-id, and pending-page polling/retry behavior remain functionally equivalent to today.

### Explicit Slice D dependency contract

Current server-side source of truth for Slice D dependencies:

- `src/features/plans/session/stream-session.ts` (server-side orchestrator — NOT client code)
- `src/features/plans/session/server-session.ts` (server-side SSE response builder)
- `src/features/plans/session/session-events.ts` (event types: `plan_start`, `module_summary`, `progress`, `complete`, `error`, `cancelled`)
- `src/hooks/streaming/parse-sse-plan-event.ts` (client-side SSE line parser that is already extracted from the session hook)

Slice E must treat the following as prerequisites, not moving targets:

- stream/retry ownership stays behind the feature-level backend lifecycle/session boundary introduced in Slice D;
- stream event names and payloads remain stable for `plan_start`, `module_summary`, `progress`, `complete`, `error`, and `cancelled` as currently modeled in `session-events.ts`;
- the client can still rely on an early plan id signal during the streaming lifecycle (`plan_start` today) so redirect-on-plan-id stays possible;
- retry route terminal semantics are settled: client-visible meaning of cancel vs error vs complete must be explicit before any additional client lifecycle seam is extracted;
- polling status semantics for `pending`, `processing`, `failed`, and `ready` are stable enough that the client can compose stream state and polling state without compensating hacks.

Practical implication: Slice D may rename/move server-side files (`stream-session.ts`, `server-session.ts`) or change helper exports. Slice E should stay anchored to the client-side consumer boundary (`usePlanGenerationSession.ts`, the SSE line parser, and wrapper hooks), and only widen if Slice D lands a client-visible wire-format or event-schema change that forces it.

If Slice D needs to change any of those semantics, that work should land first and this plan should be updated before implementation starts.

## Steps E.1-E.6 - Implementation sequence

### Step E.1 - Lock the client lifecycle contract with focused tests before moving code

1. Extend existing polling coverage in:
   - `tests/unit/hooks/usePlanStatus.spec.tsx`
   - `tests/integration/hooks/light/usePlanStatus.test.tsx`
   - `tests/unit/hooks/useStreamingPlanGeneration.spec.tsx`
2. Add focused unit coverage for the new primitives before shrinking components/hooks:
   - `tests/unit/features/plans/session/stream-reader.spec.ts`
   - `tests/unit/hooks/useRetryGeneration.spec.tsx`
   - `tests/unit/hooks/usePdfExtraction.spec.tsx`
3. Keep these existing regression sentries in the validation loop because Slice E must preserve cross-flow behavior:
   - `tests/unit/hooks/useStreamingPlanGeneration.spec.tsx`
   - `tests/unit/mappers/learningPlans.spec.ts`
   - `tests/e2e/pdf-to-plan.spec.ts`
4. Add explicit assertions for:
   - event ordering and terminal handling from the stream reader,
   - polling backoff / retriable failure behavior,
   - wrapper-hook parity while `useStreamingPlanGeneration()` stays as a thin compatibility layer,
   - PDF timeout vs user cancel behavior,
   - PDF preview draft reset behavior only when extracted input actually changes,
   - redirect when `onPlanIdReady` fires before stream completion,
   - retry flow parity between pending page and create page entry points.

### Step E.2 - Extract non-React stream reading first

1. Create `src/features/plans/session/stream-reader.ts` as a pure primitive responsible for:
   - reading `ReadableStream` chunks,
   - buffering line boundaries,
   - parsing each SSE payload,
   - yielding typed lifecycle events,
   - surfacing terminal/end-of-stream failures consistently.
2. Extract the `pump()` responsibilities that still live inline in `usePlanGenerationSession.ts` — `ReadableStream` reads, `TextDecoder`, line buffering, terminal-event short-circuiting, and end-of-stream fallback — into this module. Reuse `parseSsePlanEventLine()` as the per-line parser unless a very small relocation alongside the new reader removes the odd feature -> hooks dependency without widening the slice.
3. Define the primitive around typed callbacks or an async generator, but keep it framework-free so both the hook and future non-React clients can reuse it.
4. Rework `src/features/plans/session/usePlanGenerationSession.ts` so it only owns:
   - request kickoff,
   - React state updates,
   - `AbortController` lifecycle,
   - conversion from typed stream events into UI state.
5. Keep exported state/result types stable unless a rename materially simplifies downstream wrappers.

### Step E.3 - Thin mapper-adjacent payload helpers and keep the explicit PDF draft boundary

1. Move manual-specific `convertToOnboardingValues()` and `buildCreatePayload()` out of `ManualCreatePanel.tsx` into `src/features/plans/create-mapper.ts` or a small sibling helper module.
2. Keep normalization/mapping rules in `src/features/plans/create-mapper.ts`; do not introduce a second cross-flow mapping layer above it.
3. Treat `src/app/plans/new/components/usePdfExtractionDraft.ts` as the current post-extraction editor boundary. Do not replace it unless a thinner shared adapter clearly reduces complexity.
4. If any shared draft helper is introduced, keep it narrowly scoped to payload preparation / metadata shaping rather than replacing `UnifiedPlanInput` form state or the existing PDF preview reducer.
5. Preserve the current PDF preview reset semantics and stable section identities while extracted input stays the same.

### Step E.4 - Keep wrapper hooks thin and only extract smaller lifecycle seams if needed

1. After Step E.2, reassess whether a new client controller still provides net value. Default to keeping `useStreamingPlanGeneration()` as a thin compatibility wrapper around `usePlanGenerationSession()`.
2. If pending-page wiring still feels over-stitched, prefer a smaller seam over a new monolithic controller:
   - allow `useRetryGeneration()` to accept session state/actions from the caller, or
   - extract a narrow post-submit lifecycle helper shared by retry/poll consumers.
3. Keep `usePlanStatus()` focused on polling/backoff and `useRetryGeneration()` focused on cooldown/retry delegation unless proven duplication remains after the stream-reader extraction.
4. Do not pull PDF extraction/editing phases into this lifecycle seam; keep them separate from post-submit generation state.
5. Preserve current external hook APIs unless a small signature change clearly removes duplicated session instances.
6. Only introduce a dedicated client controller module if the smaller-seam approach still leaves real duplicated lifecycle logic after Steps E.2 and E.5.

### Step E.5 - Extract PDF upload/extraction out of `PdfCreatePanel`

1. Create `src/hooks/usePdfExtraction.ts` (or colocate a same-purpose client hook near `PdfCreatePanel` if that keeps the UI-only concern clearer) to own:
   - file-type validation,
   - `FormData` creation,
   - request dispatch to `/api/v1/plans/from-pdf/extract`,
   - timeout handling,
   - user cancel vs timeout abort reasons,
   - extraction schema parsing,
   - truncation toast metadata preparation,
   - normalized error/code output.
2. Keep presentational choices in the component tree; the hook should expose typed extraction state and commands rather than JSX-ready text when possible.
3. Preserve current PDF-specific semantics:
   - cancel returns to idle,
   - timeout shows a recoverable error,
   - truncation still surfaces informational feedback,
   - successful extraction returns preview data plus proof metadata.
4. Keep `usePdfExtractionDraft.ts` as the post-extraction editing boundary unless a thinner shared adapter clearly replaces it. `PdfCreatePanel.tsx` should wire the two seams sequentially: `usePdfExtraction()` drives `idle -> uploading -> preview|error`, then `usePdfExtractionDraft()` drives editing inside the preview phase before generation starts.

### Step E.6 - Thin the UI surfaces and finish migration

1. Rework `ManualCreatePanel.tsx` so it primarily:
   - replaces inline payload-building logic with imports from the mapper-adjacent helper,
   - triggers the existing generation hook without unnecessary form-state rewrites,
   - handles route navigation/toasts that intentionally stay UI-local.
2. Leave `CreatePlanPageClient.tsx` alone unless one of the extracted seams naturally replaces the current `prefillTopic` / `topicResetVersion` handoff. Do not refactor it just to remove a small amount of state.
3. Rework `PlanPendingState.tsx` only as far as needed to reduce duplicated session ownership or over-stitching between `usePlanStatus()` and `useRetryGeneration()`.
4. Preserve route-level behavior on the pending page:
   - auto-refresh when status becomes `ready`,
   - retry button gating by attempts/cooldown,
   - clear differentiation between generation failure and polling connection issues.
5. After the UIs migrate, remove obsolete component-local helpers/state machines that are fully subsumed by the draft/controller/extraction primitives.

## Cross-slice coordination points

- **Slice D → Slice E:** finalize backend stream event semantics, retry endpoint semantics, and cancellation meaning before client abstraction work starts.
- **Slice C → Slice E:** keep the UI-facing meaning of `ready`, `processing`, `failed`, and related status labels aligned with the canonical status/read-model boundary.
- **Slice F → Slice E:** if Slice F adds route parsing helpers around stream/retry endpoints later, Slice E should consume those APIs indirectly through the existing client hooks rather than coupling to route details.

## Likely commit split

1. **test: lock client lifecycle behavior**
   - add/extend unit + integration coverage for polling, stream reader, retry wiring, and PDF extraction primitives.
2. **refactor: extract stream reader and PDF extraction hook**
   - add non-React stream reader, thin the `usePlanGenerationSession()` pump loop, add `usePdfExtraction()`, and simplify `PdfCreatePanel`.
3. **refactor: collocate manual payload helpers and thin pending-state wiring**
   - move manual payload helpers out of `ManualCreatePanel`, and simplify `useRetryGeneration()` / `PlanPendingState` wiring only if a smaller shared seam proves worthwhile.

## Open decisions to resolve during implementation

- **Client lifecycle seam:** a new controller vs a smaller helper seam. Prefer the smaller surface unless real duplicated lifecycle logic remains after E.2/E.5.
- **Ownership of navigation/toasts:** keep router pushes and toast emission in UI components unless a shared side effect is truly duplicated across surfaces.
- **Status ownership boundary:** decide whether `usePlanStatus()` remains the polling owner with a smaller helper seam around retry/session composition, or whether a wider abstraction is actually justified.
- **`usePdfExtraction()` location:** `src/hooks/` vs colocation near `PdfCreatePanel`. Match the smallest, clearest client-only ownership boundary.
- **Retry session ownership:** decide whether `useRetryGeneration()` should accept external session state/actions to avoid duplicate `usePlanGenerationSession()` instances on the pending page.
- **Cancellation UI semantics:** only expose a dedicated `cancelled` user-facing phase if Slice D preserves that distinction end-to-end.

## Validation Steps

Run targeted checks during the slice, then the repo baseline at the end.

### Targeted validation during extraction

- `pnpm exec tsx scripts/tests/run.ts unit tests/unit/hooks/usePlanStatus.spec.tsx`
- `pnpm exec tsx scripts/tests/run.ts integration tests/integration/hooks/light/usePlanStatus.test.tsx`
- `pnpm exec tsx scripts/tests/run.ts unit tests/unit/hooks/useStreamingPlanGeneration.spec.tsx`
- `pnpm exec tsx scripts/tests/run.ts unit tests/unit/hooks/useRetryGeneration.spec.tsx`
- `pnpm exec tsx scripts/tests/run.ts unit tests/unit/mappers/learningPlans.spec.ts`
- `pnpm exec tsx scripts/tests/run.ts unit tests/unit/features/plans/session/stream-reader.spec.ts`
- `pnpm exec tsx scripts/tests/run.ts unit tests/unit/hooks/usePdfExtraction.spec.tsx`

### Browser / flow validation

- `pnpm test:smoke` if the slice changes user-visible loading/retry behavior broadly enough that smoke coverage is warranted.
- `pnpm exec playwright test tests/e2e/pdf-to-plan.spec.ts` for the PDF happy path after `PdfCreatePanel` migration.

### Final repo baseline

- `pnpm test:changed`
- `pnpm check:type`
- `pnpm check:lint`
- `pnpm check:full`

## Verification / closure

- **AC: non-React SSE reader exists and the hook is thin.**
  - Prove by inspecting `src/features/plans/session/stream-reader.ts`, confirming `usePlanGenerationSession.ts` no longer owns chunk-buffer parsing, and passing the dedicated stream-reader unit test.
- **AC: payload helpers and draft boundaries are clearer without extra abstraction.**
  - Prove by showing `ManualCreatePanel.tsx` no longer builds payloads inline, `usePdfExtractionDraft()` remains the explicit post-extraction editor boundary unless a thinner adapter replaced it, and both flows still reach `create-mapper.ts` through the existing mapper boundary.
- **AC: PDF upload/extraction logic is extracted.**
  - Prove by showing abort/timeout/request/parse logic moved into `usePdfExtraction.ts` and `PdfCreatePanel.tsx` mostly renders phases.
- **AC: pending/retry surfaces no longer over-stitch lifecycle ownership.**
  - Prove by showing `PlanPendingState.tsx`, `useRetryGeneration.ts`, and `usePlanStatus.ts` either share a smaller session seam or clearly justify any remaining separate ownership, without duplicating raw stream-reading logic.
- **AC: behavior parity is preserved.**
  - Prove with targeted unit/integration coverage, the PDF e2e/spec run, explicit coverage for preview reset semantics + redirect-on-plan-id + retry parity, and final `pnpm test:changed` + `pnpm check:full`.
