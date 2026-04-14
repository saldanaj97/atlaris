# Slice E Plan — Client lifecycle / UI extraction

## Step E.0 - Confirm scope, acceptance criteria, and backend dependencies

### Scope confirmed from shared research

- Slice E follows Slice D in the agreed execution order and should not redefine backend lifecycle ownership.
- The slice covers four primary refactors only:
  1. introduce a shared client generation controller plus a shared draft model,
  2. extract SSE reading/parsing out of the React session hook,
  3. extract PDF upload/extraction logic out of `PdfCreatePanel`,
  4. thin `ManualCreatePanel`, `PdfCreatePanel`, `PlanPendingState`, and the related wrapper hooks.
- Mapping should keep flowing through `src/features/plans/create-mapper.ts`; Slice E centralizes client draft state above the mapper instead of replacing the mapper.
- `CreatePlanPageClient` remains the route-level method switcher, but it should stop owning ad-hoc topic handoff state once the shared draft/controller exists.

### Acceptance criteria

- A non-React SSE reader primitive exists and `usePlanGenerationSession()` becomes a thin React state wrapper around it.
- A shared client lifecycle controller exists for `extract -> preview -> create/retry -> stream -> poll -> terminal` and becomes the single client-side authority for generation state.
- A shared `PlanCreationDraft` (or equivalently named draft module) exists and both manual and PDF flows use it before calling `create-mapper.ts`.
- PDF upload/extraction request, timeout, abort, parse, and error logic move into a dedicated hook (`usePdfExtraction()` or equivalent) so `PdfCreatePanel` becomes phase orchestration plus rendering.
- `ManualCreatePanel`, `PdfCreatePanel`, `PlanPendingState`, `useStreamingPlanGeneration()`, `useRetryGeneration()`, and `usePlanStatus()` consume shared controller/session primitives instead of duplicating lifecycle ownership.
- Manual create, PDF create, retry, redirect-on-plan-id, and pending-page polling/retry behavior remain functionally equivalent to today.

### Explicit Slice D dependency contract

Slice E must start from the backend contract finalized by Slice D and should treat the following as prerequisites, not moving targets:

- stream/retry ownership stays behind the feature-level backend lifecycle/session boundary introduced in Slice D;
- stream event names and payloads remain stable for `plan_start`, `module_summary`, `progress`, `complete`, `error`, and `cancelled` as currently modeled in `src/features/plans/session/session-events.ts`;
- the client can still rely on an early plan id signal during the streaming lifecycle (`plan_start` today) so redirect-on-plan-id stays possible;
- retry route terminal semantics are settled: client-visible meaning of cancel vs error vs complete must be explicit before the controller is extracted;
- polling status semantics for `pending`, `processing`, `failed`, and `ready` are stable enough that the controller can map stream state and polling state into one model without compensating hacks.

If Slice D needs to change any of those semantics, that work should land first and this plan should be updated before implementation starts.

## Steps E.1-E.6 - Implementation sequence

### Step E.1 - Lock the client lifecycle contract with focused tests before moving code

1. Extend existing polling coverage in:
   - `tests/unit/hooks/usePlanStatus.spec.tsx`
   - `tests/integration/hooks/light/usePlanStatus.test.tsx`
2. Add focused unit coverage for the new primitives before shrinking components/hooks:
   - `tests/unit/features/plans/session/stream-reader.spec.ts`
   - `tests/unit/features/plans/draft/plan-creation-draft.spec.ts`
   - `tests/unit/features/plans/pdf/usePdfExtraction.spec.ts`
3. Keep these existing regression sentries in the validation loop because Slice E must preserve cross-flow behavior:
   - `tests/unit/mappers/learningPlans.spec.ts`
   - `tests/e2e/pdf-to-plan.spec.ts`
4. Add explicit assertions for:
   - event ordering and terminal handling from the stream reader,
   - polling backoff / retriable failure behavior,
   - PDF timeout vs user cancel behavior,
   - redirect when `onPlanIdReady` fires before stream completion,
   - retry flow parity between pending page and create page entry points.

### Step E.2 - Extract non-React stream reading first

1. Create `src/features/plans/session/stream-reader.ts` as a pure primitive responsible for:
   - reading `ReadableStream` chunks,
   - buffering line boundaries,
   - parsing each SSE payload,
   - yielding typed lifecycle events,
   - surfacing terminal/end-of-stream failures consistently.
2. Move the existing line parsing boundary out of the hook into this module and reuse `parseSsePlanEventLine()` unless Slice D introduced a better parser location.
3. Define the primitive around typed callbacks or an async generator, but keep it framework-free so both the hook and future non-React clients can reuse it.
4. Rework `src/features/plans/session/usePlanGenerationSession.ts` so it only owns:
   - request kickoff,
   - React state updates,
   - `AbortController` lifecycle,
   - conversion from typed stream events into UI state.
5. Keep exported state/result types stable unless a rename materially simplifies downstream wrappers.

### Step E.3 - Introduce the shared draft model before the shared controller

1. Create `src/features/plans/draft/plan-creation-draft.ts` as the canonical client-side draft layer.
2. Model one shared draft shape that can represent both:
   - manual creation fields from `UnifiedPlanInput`, and
   - PDF-derived editable fields plus proof metadata needed by `mapPdfSettingsToCreateInput()`.
3. Keep normalization/mapping rules in `src/features/plans/create-mapper.ts`; the new draft module should prepare valid draft state and delegate final request-shape creation to the mapper.
4. Move manual-specific `convertToOnboardingValues()` / payload-build logic out of `ManualCreatePanel.tsx` into the draft layer or a colocated draft adapter.
5. Move PDF payload-build logic out of `PdfCreatePanel.tsx` into the draft layer or a colocated draft adapter so both flows share one destination for validation and submit-readiness checks.
6. Ensure the draft model explicitly tracks which fields are UI-editable versus transport-only metadata (for example PDF proof token/hash/version).

### Step E.4 - Introduce the shared client generation controller

1. Create `src/features/plans/generation/controller.ts` as the single client lifecycle authority.
2. The controller should compose, rather than absorb, the extracted pieces:
   - draft state/selectors,
   - session streaming state,
   - polling state,
   - retry triggers,
   - PDF extraction state when relevant.
3. Define explicit controller phases aligned with research:
   - `idle`
   - `extracting`
   - `previewing`
   - `submitting`
   - `streaming`
   - `polling`
   - `complete`
   - `failed`
   - `cancelled` (only if Slice D keeps that user-visible distinction)
4. The controller API should expose selectors/actions tailored for UI consumers, for example:
   - current phase/status badges,
   - submit/retry/cancel actions,
   - plan id / redirect readiness,
   - modules/progress snapshots,
   - extraction preview data,
   - derived error display state.
5. Rebase these hooks on the controller instead of letting each own workflow logic:
   - `src/hooks/useStreamingPlanGeneration.ts`
   - `src/hooks/useRetryGeneration.ts`
   - `src/hooks/usePlanStatus.ts`
6. Prefer retaining thin compatibility wrappers for one slice if that reduces call-site churn; delete or inline them only after all affected UIs migrate.

### Step E.5 - Extract PDF upload/extraction out of `PdfCreatePanel`

1. Create `src/features/plans/pdf/usePdfExtraction.ts` to own:
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
4. Once the hook is in place, reduce `PdfCreatePanel.tsx` to a phase-switching orchestrator that wires controller state to `PdfUploadZone`, `PdfUploadingState`, `PdfExtractionPreview`, `PdfGeneratingState`, and `PdfUploadError`.

### Step E.6 - Thin the UI surfaces and finish migration

1. Rework `ManualCreatePanel.tsx` so it primarily:
   - binds `UnifiedPlanInput` to the shared draft,
   - triggers the controller submit action,
   - handles route navigation/toasts that intentionally stay UI-local.
2. Rework `CreatePlanPageClient.tsx` so it passes shared draft/controller context between manual and PDF modes instead of carrying bespoke `prefillTopic` / `topicResetVersion` handoff state unless that state remains the thinnest compatibility layer.
3. Rework `PlanPendingState.tsx` so it consumes one derived lifecycle surface from the controller or controller-backed hooks instead of manually stitching `usePlanStatus()` and `useRetryGeneration()` together.
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
   - add/extend unit + integration coverage for polling, stream reader, and PDF extraction primitives.
2. **refactor: extract stream reader and draft model**
   - add non-React stream reader, shared draft module, and migrate mapper-adjacent payload builders.
3. **refactor: add client generation controller**
   - introduce controller and rebase streaming/retry/status hooks on it.
4. **refactor: thin plan creation and pending UIs**
   - migrate `ManualCreatePanel`, `PdfCreatePanel`, `CreatePlanPageClient`, and `PlanPendingState` to the new controller/extraction hooks.

If conflicts are likely, split commit 4 into:

- `refactor: thin creation panels`
- `refactor: thin pending-state flow`

## Open decisions to resolve during implementation

- **Controller shape:** async-generator-driven controller vs hook + reducer composition. Prefer the smaller surface that does not recreate a second monolith.
- **Ownership of navigation/toasts:** keep router pushes and toast emission in UI components unless a shared side effect is truly duplicated across surfaces.
- **Status ownership boundary:** decide whether `usePlanStatus()` becomes an implementation detail under the controller or remains a thin exported compatibility hook backed by shared controller logic.
- **Draft sharing strategy:** decide whether PDF and manual drafts share one discriminated union or one core base draft plus small origin-specific adapters.
- **Cancellation UI semantics:** only expose a dedicated `cancelled` user-facing phase if Slice D preserves that distinction end-to-end.

## Validation Steps

Run targeted checks during the slice, then the repo baseline at the end.

### Targeted validation during extraction

- `pnpm exec tsx scripts/tests/run.ts unit tests/unit/hooks/usePlanStatus.spec.tsx`
- `pnpm exec tsx scripts/tests/run.ts integration tests/integration/hooks/light/usePlanStatus.test.tsx`
- `pnpm exec tsx scripts/tests/run.ts unit tests/unit/mappers/learningPlans.spec.ts`
- `pnpm exec tsx scripts/tests/run.ts unit tests/unit/features/plans/session/stream-reader.spec.ts`
- `pnpm exec tsx scripts/tests/run.ts unit tests/unit/features/plans/draft/plan-creation-draft.spec.ts`
- `pnpm exec tsx scripts/tests/run.ts unit tests/unit/features/plans/pdf/usePdfExtraction.spec.ts`

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
- **AC: shared client generation controller exists.**
  - Prove by showing one controller module is the source of submit/retry/poll/terminal selectors/actions and that wrapper hooks/components delegate to it.
- **AC: shared draft model is used by both manual and PDF flows.**
  - Prove by showing `ManualCreatePanel.tsx` and `PdfCreatePanel.tsx` no longer build payloads inline and both reach `create-mapper.ts` through the shared draft layer.
- **AC: PDF upload/extraction logic is extracted.**
  - Prove by showing abort/timeout/request/parse logic moved into `usePdfExtraction.ts` and `PdfCreatePanel.tsx` mostly renders phases.
- **AC: pending/retry surfaces no longer stitch lifecycle ownership manually.**
  - Prove by showing `PlanPendingState.tsx`, `useRetryGeneration.ts`, and `usePlanStatus.ts` consume shared controller/session abstractions rather than parallel state machines.
- **AC: behavior parity is preserved.**
  - Prove with targeted unit/integration coverage, the PDF e2e/spec run, and final `pnpm test:changed` + `pnpm check:full`.
