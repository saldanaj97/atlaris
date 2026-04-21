# Slice D Plan — Generation lifecycle consolidation (backend)

## Scope snapshot

- **Slice:** D
- **Execution order:** After Slice A and Slice B; begin only once Slice C is complete or its remaining items are explicitly confirmed non-overlapping; before Slice E/F.
- **Archived context:** This slice plan was originally derived from the shared prelim refactor findings umbrella docs and now stands on its own as the archived Slice D record.
- **In scope:** one lifecycle authority for create/retry/stream generation; thinner HTTP-only route adapters; split stream emission vs cleanup/persistence helpers; narrower boundaries for `PlanLifecycleService`, AI orchestrator, jobs queries, and attempt persistence.
- **Out of scope:** client controller work from Slice E, generic route parsing cleanup from Slice F, and edits to shared prelim research/todos artifacts.

## Dependencies and sequencing

- **Hard dependency on Slice B:** reuse the feature-owned destination for session/lifecycle facades so Slice D does not invent a parallel abstraction.
- **Execution gate on Slice C:** preserve current ready/failed/generating semantics because Slice C and Slice E consume them; do not begin Slice D until the remaining Slice C work is either complete or explicitly verified to avoid file-path/import overlap with this slice.
- **Cross-slice contract for Slice E:** SSE event names/order must remain backward-compatible unless this plan explicitly includes a migration path.
- **Cross-slice contract for Slice F:** leave generic JSON/body parsing standardization for later; only move route logic that is lifecycle-specific.

## Acceptance criteria to carry into implementation

1. Create and retry generation flows execute through one feature-owned backend session orchestration path.
2. `src/app/api/v1/plans/stream/route.ts` and `src/app/api/v1/plans/[planId]/retry/route.ts` become HTTP adapters: auth/rate-limit/preflight/request parsing in the route, lifecycle/session orchestration below the route.
3. `src/features/plans/session/stream-session.ts` is decomposed by runtime concern, and `src/app/api/v1/plans/stream/helpers.ts` is reduced to a compatibility shim or deleted.
   - SSE event formatting/emission lives in a feature-owned emitters module with a name that stays distinct from the existing `session-events.ts` type-definition file.
   - Cleanup / safe-failure helpers live in a feature-owned cleanup module.
   - `emitCancelledEvent` and `tryRecordUsage` have explicit homes instead of remaining as leftovers in the app-route helper layer.
   - Unused legacy handlers are deleted once tests prove no remaining consumers.
4. `PlanLifecycleService` has clearer internal boundaries: shared creation pipeline plus explicit origin-specific strategy modules for AI vs PDF creation, without changing external behavior.
5. `src/features/ai/orchestrator.ts` is narrowed so provider selection / timeout wiring / failure finalization are no longer one large procedural block.
6. `src/lib/db/queries/jobs.ts` and `src/lib/db/queries/helpers/attempts-persistence.ts` are split by responsibility without changing queue semantics, attempt reservation/finalization semantics, or RLS behavior.
7. Existing stream/retry/regeneration behavior remains compatible with current tests, especially SSE terminal events, failure classification, durable attempt limits, and regeneration worker usage of `processGenerationAttempt()`.

---

## Step D.0 — confirm scope / ACs from the original shared prelim findings

1. Reconfirm the slice boundary from the original shared prelim findings that scoped Slice D, especially the execution order, overlap notes, and the planning note that `stream/helpers.ts` was transitional while `stream-session.ts` was the primary donor for emission/cleanup extraction.
2. Lock the non-negotiable behavioral contracts before moving files:
   - Stream route still creates a plan, starts SSE with `plan_start`, and ends with current `complete` / `error` / `cancelled` semantics.
   - Retry route still rejects ineligible plan states up front and otherwise emits the same SSE contract.
   - Regeneration worker still relies on `PlanLifecycleService.processGenerationAttempt()` semantics staying stable.
3. Confirm legacy-helper disposition up front:
   - **Move** `buildPlanStartEvent`, `emitSanitizedFailureEvent`, `emitModuleSummaries`, and `executeLifecycleGenerationStream` out of the current `stream-session.ts` donor file into a feature-owned emission/session module.
   - **Move** `emitCancelledEvent` out of `stream/helpers.ts` into the same feature-owned emission module so cancellation signaling is not stranded in the app-route helper layer.
   - **Move** `safeMarkPlanFailed` and any remaining cleanup-only helpers into a feature-owned cleanup module.
   - **Move** `tryRecordUsage` into an explicit session/lifecycle or usage-recording home below `src/features/plans/session/` instead of leaving it as a hidden side-effect helper in `stream/helpers.ts`.
   - **Delete** `handleSuccessfulGeneration`, `handleFailedGeneration`, and `withFallbackCleanup` if parity search/tests confirm they remain unused after extraction.
   - **Delete or inline** fallback-only serialization helpers from the compatibility layer if the moved cleanup module becomes their only caller, and prefer Slice A's shared primitives (`unknownThrownCore`, `safeStringifyUnknown`, `coerceUnknownToMessage`) over carrying duplicate wrappers forward.
4. Record implementation guardrails for the coding agent:
   - Do not change SSE event names unless a migration is planned and tests are updated together.
   - Do not add new route/business leakage from `src/features/*` back up into `src/app/*`.
   - Do not weaken request-scoped / stream-scoped DB lifetime handling.

## Step D.1 — lock parity coverage before moving ownership

1. Extend route-level tests first so refactors are pinned by behavior:
   - `tests/integration/api/plans-stream.spec.ts`
   - `tests/integration/api/plans-retry.spec.ts`
2. Add or strengthen assertions for:
   - identical event ordering across create vs retry (`plan_start` before terminal event)
   - terminal event parity for retryable failure, permanent failure, cancellation, and unexpected exception cleanup
   - DB cleanup behavior when unhandled generation errors occur
   - create vs retry parity around attempt numbering and classification surfaced to the client
3. Lock lower-level helper behavior before splitting modules:
   - keep `tests/unit/ai/streaming/helpers.spec.ts` for `safeMarkPlanFailed`-style swallowing/logging behavior until the helper lands in its new module
   - keep `tests/unit/app/api/v1/plans/stream/helpers-usage.spec.ts` or its replacement focused on usage-recording semantics if that logic moves
   - keep `tests/unit/app/api/v1/plans/stream/fallback-error-like.spec.ts` or its replacement pinned to the chosen fallback-normalization wrapper while that behavior still exists
4. Expand persistence/queue regression coverage before broad file splits:
   - `tests/integration/db/jobs.queries.spec.ts`
   - `tests/integration/db/jobs.queue.spec.ts`
   - `tests/integration/db/attempts-atomic-observability.spec.ts`
   - `tests/unit/db/attempts-persistence.spec.ts`
   - keep `tests/unit/ai/orchestrator-pacing.spec.ts` and `tests/unit/ai/orchestrator-timeout.spec.ts` green as the orchestrator narrows

## Step D.2 — introduce one feature-owned generation session authority

1. Introduce or complete a shared feature module (preferred name from research: `src/features/plans/session/plan-generation-session.ts`) that becomes the main create/retry session entrypoint and owns:
   - construction of the SSE response currently handled by `createPlanGenerationSessionResponse()`
   - invocation of `processGenerationAttempt()`
   - unhandled-error cleanup callback wiring
2. Default end-state: move `createPlanGenerationSessionResponse()` into `plan-generation-session.ts`, keep `createStreamDbClient()` as a thin stream-DB utility under `src/features/plans/session/`, and only delete/merge `server-session.ts` if it becomes trivial after the move.
3. Target end-state API shape:
   - one entrypoint for **create-and-stream** generation
   - one entrypoint for **retry-and-stream** generation
   - shared internals for stream DB lifetime + event-stream execution
4. Route responsibilities after this step:
   - **stream route:** auth, request JSON parsing/validation, generation rate-limit check, model-resolution preflight if still HTTP-scoped, then delegate
   - **retry route:** auth, plan ownership/status preflight, durable-attempt/rate-limit preflight, then delegate
5. Important implementation constraint:
   - if model resolution remains stream-only, pass a resolved `modelOverride` into the shared session module rather than letting the route keep the entire orchestration.
   - do **not** implicitly add query-parameter model override behavior to retry unless product behavior is intentionally expanded.

## Step D.3 — split `stream-session.ts` / `stream/helpers.ts` by runtime concern and remove the transitional layer

1. Create **emission-only** module(s), preferably under `src/features/plans/session/stream-emitters.ts` (or another name that stays distinct from the existing `session-events.ts` type-definition file), sourced primarily from the current `stream-session.ts` donor file, for:
   - `buildPlanStartEvent`
   - `emitSanitizedFailureEvent`
   - `emitCancelledEvent`
   - `emitModuleSummaries`
   - `executeLifecycleGenerationStream` (or keep this in `plan-generation-session.ts` if it reads more as orchestration than formatting)
2. Create **cleanup-only** module(s), preferably under `src/features/plans/session/stream-cleanup.ts`, for:
   - `safeMarkPlanFailed`
   - any remaining fallback error-shaping used only for cleanup/logging
3. Remove mixed ownership from route space:
   - if `src/app/api/v1/plans/stream/helpers.ts` survives temporarily, keep it as a compatibility wrapper/re-export only.
   - routes should import feature session APIs only.
4. Legacy helper disposition:
   - `emitCancelledEvent` → move to the emission module with the other SSE event emitters.
   - `tryRecordUsage` → move to an explicit session/lifecycle or usage-recording home; do not leave it behind in the compatibility wrapper.
   - `handleSuccessfulGeneration` → delete unless a new non-lifecycle consumer is introduced during refactor; current search shows no callers.
   - `handleFailedGeneration` → delete unless a new non-lifecycle consumer is introduced during refactor; current search shows no callers.
   - `withFallbackCleanup` → delete if no caller remains after cleanup extraction; otherwise keep only in the cleanup module with a caller-driven name.
   - `toFallbackErrorLike` / `omitCircularFields` → keep only if still required by cleanup/emission internals; otherwise replace or narrow them around `unknownThrownCore`, `safeStringifyUnknown`, and `coerceUnknownToMessage` from `src/lib/errors/normalize-unknown.ts`.
5. End-state rule: no feature module under `src/features/plans/session/` should need to import from `src/app/api/...`.

## Step D.4 — narrow `PlanLifecycleService` around explicit creation strategies

1. Extract shared creation pipeline stages out of `PlanLifecycleService`:
   - tier + duration normalization gate
   - capped-plan precheck
   - duplicate detection handling
   - atomic insert result mapping
2. Move origin-specific behavior into dedicated strategy helpers/modules, e.g.:
   - `origin-strategies/create-ai-plan.ts`
   - `origin-strategies/create-pdf-plan.ts`
3. AI strategy should own only AI-specific normalization/input mapping.
4. PDF strategy should own:
   - proof/quota reservation ordering
   - rollback-on-failure behavior
   - PDF provenance/context shaping
5. Keep the public lifecycle surface stable where possible:
   - `createPlan()` and `createPdfPlan()` can remain as public methods if routes/tests already rely on them
   - internally they should become thin orchestrators over shared pipeline + origin strategy
6. Preserve `processGenerationAttempt()` as the single execution path used by stream, retry, and regeneration worker.
   - If new internal helpers are extracted, keep result unions unchanged so worker and route tests do not need semantic rewrites.

## Step D.5 — trim AI orchestrator coordination surface without changing semantics

1. Split `src/features/ai/orchestrator.ts` by decision boundary, not by arbitrary line count.
2. First extractions should be pure or near-pure helpers with existing test seams:
   - reservation rejection/result mapping
   - timeout setup + cleanup lifecycle
   - finalize-failure flow / synthetic failure attempt creation
   - provider invocation wrapper / instrumentation boundary
3. Keep the exported `runGenerationAttempt()` API stable.
4. Preserve invariants covered by current tests:
   - reservation rejection statuses/classifications
   - timeout extension behavior
   - finalize-success/failure call ordering
   - provider metadata/raw text propagation into final results
5. Do **not** mix queue splitting into the orchestrator change; keep this as a narrow refactor with unit coverage proving no behavioral drift.

## Step D.6 — split jobs queries and attempt persistence by responsibility

1. Split `src/lib/db/queries/jobs.ts` into smaller modules with a stable barrel or compatibility exports:
   - `jobs/mutations.ts` → enqueue/claim/complete/fail
   - `jobs/monitoring.ts` → `getFailedJobs`, `getJobStats`, `cleanupOldJobs`, possibly `countUserJobsSince`
   - keep shared row mapping / retry-policy helpers under `helpers/jobs-helpers.ts` unless a clearer home emerges
2. Preserve current consumers during the split:
   - `src/features/jobs/queue.ts`
   - `src/app/api/v1/plans/[planId]/regenerate/route.ts`
   - monitoring/admin callers
3. Split `src/lib/db/queries/helpers/attempts-persistence.ts` into:
   - normalization-only helper(s) (`normalizeParsedModules`, normalization flags)
   - persistence-only transaction helper for successful attempt/module/task replacement
4. Preserve RLS-sensitive invariants:
   - `prepareRlsTransactionContext()` / `reapplyJwtClaimsInTransaction()` stay inside the persistence transaction path
   - success finalization still replaces modules/tasks atomically and only finalizes the matching `in_progress` attempt row
5. Keep `src/lib/db/queries/attempts.ts` as the orchestration point unless a later slice explicitly moves the public query API.

## Step D.7 — thin routes to final HTTP-only adapters and clean import graph

1. Final pass on `src/app/api/v1/plans/stream/route.ts`:
   - keep request parsing, auth/rate-limit headers, and HTTP error mapping
   - remove stream DB setup, duplicated close logic, direct SSE orchestration, and direct cleanup wiring
2. Final pass on `src/app/api/v1/plans/[planId]/retry/route.ts`:
   - keep plan lookup/ownership/status preflight and rate-limit headers
   - remove stream DB setup, session response construction, and direct cleanup wiring
3. Confirm both routes now depend only on feature-owned session/lifecycle modules plus generic route utilities.
4. If `server-session.ts` becomes redundant after the new session module lands, either:
   - reduce it to a very small stream transport primitive, or
   - merge it into the new feature-owned session module and delete the old file.

---

## Validation steps

Run these after the implementation, preferring changed-only/targeted commands first, then the repo baselines:

1. Targeted unit/integration checks for this slice:
   - `pnpm exec tsx scripts/tests/run.ts integration tests/integration/api/plans-stream.spec.ts`
   - `pnpm exec tsx scripts/tests/run.ts integration tests/integration/api/plans-retry.spec.ts`
   - `pnpm exec tsx scripts/tests/run.ts integration tests/integration/api/plans.regenerate.spec.ts`
   - `pnpm exec tsx scripts/tests/run.ts integration tests/integration/db/jobs.queries.spec.ts`
   - `pnpm exec tsx scripts/tests/run.ts integration tests/integration/db/jobs.queue.spec.ts`
   - `pnpm exec tsx scripts/tests/run.ts integration tests/integration/db/attempts-atomic-observability.spec.ts`
   - `pnpm exec tsx scripts/tests/run.ts unit tests/unit/db/attempts-persistence.spec.ts`
   - `pnpm exec tsx scripts/tests/run.ts unit tests/unit/ai/streaming/helpers.spec.ts`
   - `pnpm exec tsx scripts/tests/run.ts unit tests/unit/app/api/v1/plans/stream/helpers-usage.spec.ts`
   - `pnpm exec tsx scripts/tests/run.ts unit tests/unit/app/api/v1/plans/stream/fallback-error-like.spec.ts`
   - `pnpm exec tsx scripts/tests/run.ts unit tests/unit/ai/orchestrator-pacing.spec.ts`
   - `pnpm exec tsx scripts/tests/run.ts unit tests/unit/ai/orchestrator-timeout.spec.ts`
   - `pnpm exec tsx scripts/tests/run.ts unit tests/unit/features/plans/lifecycle/lifecycle-consolidation.spec.ts`
   - `pnpm exec tsx scripts/tests/run.ts unit tests/unit/architecture/import-boundaries.spec.ts`
2. Type/lint checks:
   - `pnpm check:type`
   - `pnpm check:lint`
3. Final repo baseline required by repo instructions:
   - `pnpm test:changed`
   - `pnpm check:full`

---

## Verification / closure

Walk each acceptance criterion with proof points after implementation:

1. **One lifecycle authority for create/retry/stream generation**
   - Proof: both routes call the same feature session entrypoint; diff shows duplicated stream-session logic removed from both routes.
   - Proof command: `rg "createPlanGenerationSessionResponse|createStreamDbClient|plan-generation-session" src/app/api/v1/plans src/features/plans/session -n`
2. **Routes are HTTP-only adapters**
   - Proof: stream/retry routes contain only parsing/preflight/error mapping and delegation, not stream DB lifetime management.
   - Proof command: inspect `git diff -- src/app/api/v1/plans/stream/route.ts src/app/api/v1/plans/[planId]/retry/route.ts`
3. **`stream/helpers.ts` no longer mixes concerns**
   - Proof: emission helpers live under feature session modules, cleanup helpers live in cleanup module, `emitCancelledEvent` / `tryRecordUsage` have explicit homes, and `stream/helpers.ts` is only a compatibility shim or is deleted entirely.
   - Proof command: `rg "handleSuccessfulGeneration|handleFailedGeneration|withFallbackCleanup|emitCancelledEvent|tryRecordUsage" src -n`
4. **`PlanLifecycleService` boundaries are narrower**
   - Proof: AI vs PDF creation branches delegate to extracted strategy helpers, while `processGenerationAttempt()` remains the single execution authority.
   - Proof command: `rg "origin-strategies|processGenerationAttempt\\(" src/features/plans/lifecycle -n`
5. **AI orchestrator is narrowed without behavior drift**
   - Proof: extracted helper modules exist and orchestrator tests still pass.
   - Proof commands: targeted orchestrator unit tests above.
6. **Jobs/attempt persistence are split by concern**
   - Proof: `jobs.ts` responsibilities separated into mutation/monitoring modules; attempts normalization is distinct from DB write transaction code.
   - Proof commands: `rg "export async function (getJobStats|getFailedJobs|cleanupOldJobs|insertJobRecord|persistSuccessfulAttempt|normalizeParsedModules)" src/lib/db/queries -n`
7. **Behavior remains compatible for stream/retry/regeneration**
   - Proof: targeted stream/retry/regeneration + lifecycle + queue tests all pass, followed by `pnpm test:changed` and `pnpm check:full`.

---

## Likely commit split

1. **Commit 1 — lock lifecycle parity tests**
   - Add/adjust stream, retry, queue, and persistence coverage before moving code.
2. **Commit 2 — shared session authority + helper split**
   - Introduce or finish the feature-owned generation session module, split `stream-session.ts` by runtime concern, and move cancellation/usage helpers to explicit homes.
3. **Commit 3 — route thinning + compatibility cleanup**
   - Make routes HTTP-only, update them to the shared session entrypoints, and reduce `stream/helpers.ts` to a compatibility shim or delete it.
4. **Commit 4 — lifecycle/orchestrator narrowing**
   - Extract origin strategies and orchestrator helper modules while preserving public APIs.
5. **Commit 5 — queue/persistence module split + final cleanup**
   - Split `jobs.ts`, split attempts persistence helpers, delete transitional legacy helpers, run final baselines.

## Open decisions to settle before coding

1. **Model override ownership:** keep retry semantics unchanged and pass resolved model config from the route, or intentionally expand retry to accept the same override path as stream.
2. **Session module shape:** default to moving `createPlanGenerationSessionResponse()` into `plan-generation-session.ts`, keep `createStreamDbClient()` as a thin stream-DB utility under `src/features/plans/session/`, and only delete/merge `server-session.ts` if it becomes trivial after the move.
3. **Error normalization dependency:** reuse `unknownThrownCore`, `safeStringifyUnknown`, and `coerceUnknownToMessage` from `src/lib/errors/normalize-unknown.ts` during `stream/helpers.ts` cleanup unless a remaining SSE-specific wrapper still needs a narrower adapter.
4. **Jobs split surface:** preserve `src/lib/db/queries/jobs.ts` as a compatibility barrel during the slice vs update all imports in one pass.
5. **Attempt persistence extraction depth:** stop at normalization/persistence separation in this slice; avoid redesigning reservation/finalization public APIs unless tests expose a real need.
