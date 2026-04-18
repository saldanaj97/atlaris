# knip-remaining-plan todos

- [x] Re-read the current Knip report at `/var/folders/_f/vqtdg0x17jq294z6bpy_pp240000gn/T/copilot-tool-output-1776463554767-eu2cfq.txt`.
- [x] Filter out the explicitly excluded barrel / compat findings and the intentionally kept `getPlanListTotalCount` barrel import.
- [x] Recompute the remaining scope as 82 unused exports and 92 unused exported types.
- [x] Group the remaining findings into concrete cleanup buckets grounded in the current tree.
- [x] Check representative exporter/importer boundaries so the plan names exact files to inspect before cleanup.
- [x] Define a safe-first execution order that separates low-risk de-exports from risky entrypoint / legacy areas.
- [x] Define a build-only validation strategy for later implementation, including where build-only checks are insufficient.
- [x] Capture risks, defer candidates, and open questions before any implementation work starts.

## Review

- Planning only; no source cleanup implemented.
- No tests were run.
- No build was run.

## Live consumer refactors (2026-04-18)

- [x] **Slice 1 — Scheduling barrel:** Removed `src/features/scheduling/types.ts`; all consumers import `@/shared/types/scheduling.types`. Targeted vitest: `tests/unit/scheduling`, `ScheduleWeekList.spec.tsx`, `plan-access-types.spec.ts`, `schedules.queries.spec.ts`.
- [x] **Slice 2 — Summary read-model:** `SummaryTaskRow` / `ProgressStatusRow` are module-local in `summary.ts`; tests `completion-metrics.spec.ts` and `planQueries.spec.ts` use local type aliases. Targeted vitest: completion-metrics, planQueries, summary-boundaries, plan-status.
- [x] **Slice 3 — Same-file Knip:** `sessionAssignmentSchema`, `daySchema`, `weekSchema` internal in `scheduling.schemas.ts`; `LEARNING_PLAN_PROMPT_SCHEMA` internal in `prompts.ts`; OpenRouter response helpers/types internalized (`TextPart`, `extractChunkText`, `USAGE_TOKEN_FIELDS`, `isTextPartArray`, `describeResponseValue`, `createInvalidShapeError`, `StreamUsageEventContext`); removed unused `getRetryBackoffConfig` + `RETRY_BACKOFF_MS` import from `timeout.ts` (no callers). Targeted vitest: `tests/unit/ai`. `pnpm check:full` passed.
- [x] **Slice 4 — Bucket B server actions:** Removed dead exports `updateTaskProgressAction`, `getPlanScheduleForPage` from `src/app/plans/[id]/actions.ts`; `updateModuleTaskProgressAction` from `src/app/plans/[id]/modules/[moduleId]/actions.ts`. Dropped orphan `scheduleSuccess` / `scheduleError`, `ScheduleAccessResult`, and related tests in `plan-access-types.spec.ts`. Stopped re-exporting `setTaskProgress` from `task-progress-action-deps.ts` (only batch path remains). Targeted vitest: `tests/unit/app/plans/actions.spec.ts`, `tests/unit/api/plan-access-types.spec.ts`. `pnpm check:type` passed. `pnpm check:knip` no longer lists those symbols (full knip still exits non-zero for deferred buckets). `pnpm build` failed locally with `EnvValidationError: LOCAL_PRODUCT_TESTING cannot be enabled in production` during page data collection — env/config, not this slice.

### Review note

- **Knip:** Unused exports dropped ~47 → ~37; unused exported types ~63 → ~61 (run `pnpm check:knip` for current list). Remaining items are mostly Bucket D/E/F (session pipeline, auth/db boundaries, billing, PDF, tests/fixtures).
- **Deferred:** Broad barrels (`effort.ts` re-export), billing/webhook/session entrypoints unchanged per risk rules.

- [x] **Slice 5 — Bucket D parser/helpers + session-adjacent types (non-deferred):** De-exported module-local types/classes that Knip flagged without external importers:
  - `AttemptCapReader` in `src/features/ai/generation-policy.ts`
  - `ModelResolutionErrorCode` in `src/features/ai/model-resolution-error.ts`
  - `StreamModelResolution`, `StreamModelValidationError` in `src/features/plans/session/model-resolution.ts`
  - `SafeMarkPlanFailedDeps` in `src/features/plans/session/stream-cleanup.ts`
  - `StreamingError` class in `src/features/plans/session/usePlanGenerationSession.ts` (only used internally by `createStreamingError`; no `instanceof` callers)
  - `RetryStatus` in `src/hooks/useRetryGeneration.ts`
  - `StreamingError` type + `StartGenerationOptions` in `src/hooks/useStreamingPlanGeneration.ts` (`isStreamingError` still exported; predicate return type now structural)
  - Deferred per risk rules: `plan-generation-session.ts`, `stream-emitters.ts`, `stream-outcomes.ts` entrypoints remain untouched.
  - Targeted vitest: `tests/unit/ai`, `tests/unit/hooks`, `tests/unit/api/model-validation.spec.ts`, `tests/unit/features/plans/session` — 460 tests pass.
  - `pnpm check:type` passed. Knip: unused exported types 61 → 53; all eight target symbols no longer reported.

- [x] **Slice 6 — Bucket E (local boundary internals only):** De-exported or removed symbols with no cross-module consumers; deferred entrypoint/alias surfaces per `plan.md` §5.
  - **E1 — lib:** `isAttemptErrorLike` (`error-normalization.ts`); `ApiErrorResponse`, `isFailureClassification` (`error-response.ts`); `ValidDateInput` (`relative-time.ts`); `stableSerialize` (`attempts-input.ts`); `JobsTransaction`, `lockJobAndCheckTerminal` (`jobs/shared.ts`).
  - **E2 — billing/shared:** `BillingSnapshotNotFoundError`, `BillingAccountSnapshot` (`account-snapshot.ts`); `LocalPriceId`, `LOCAL_STRIPE_DISPLAY_AMOUNTS` (`local-catalog.ts`); `getAllowedCheckoutPriceIds` (`price-catalog.ts`); removed unused `CreateCheckoutResponse` / `CreatePortalResponse` aliases and schema imports (`validation/stripe.types.ts`); removed dead `PaidSubscriptionTier` / `PAID_SUBSCRIPTION_TIERS` (`billing.types.ts`); deleted `resetLocalStripeMockForTests` (`local-stripe.ts`).
  - **E3 — plans lifecycle:** `CreationLifecycleLabel`, `CreationGateResult` (`creation-pipeline.ts`); `PlanWriteClient` (`plan-operations.ts`).
  - **Tests / checks:** `pnpm vitest run tests/unit/api/error-response.spec.ts`; `pnpm vitest run tests/integration/stripe/account-snapshot.spec.ts`; `pnpm check:type` (post-slice and final). `pnpm check:knip`: unused exports ~37 → ~28, unused exported types ~53 → ~42; Bucket E local targets cleared.
  - **Deferred (unchanged):** `src/lib/api/auth.ts`, `src/lib/api/context.ts` (+ `RequestContext` still knip-flagged), `src/lib/db/service-role.ts`, `src/lib/logging/request-context.ts`, `src/features/billing/stripe-webhook-processor.ts` (`applyStripeWebhookEvent`), `src/features/jobs/regeneration-worker.ts` (`processNextRegenerationJob`).
  - **Build:** `pnpm build` still fails locally during page data collection with `EnvValidationError: LOCAL_PRODUCT_TESTING cannot be enabled in production` (env), not this slice.

- [x] **Slice 7 — Bucket F (PDF + test/script/smoke surfaces):** Per `plan.md` Bucket F: narrowed exports, removed dead code only.
  - **F1 — PDF runtime:** Internalized `canonicalizePdfExtractedContent`, `consumePdfExtractionProof` (`pdf-extraction-proof.ts`); `DEFAULT_EXTRACTION_RESPONSE_CAPS` (`structure.ts`); dropped `MalwareScanLogger` / `MalwareScanResult` re-exports from `malware-scanner.ts` (use `malware-scanner.types.ts`); `AvMockScenario` module-local (`mock-av-provider.ts`); removed dead `PdfValidationResult` / `PdfValidationInput` / `PdfValidationLimits` (`types.ts`); `PdfProvenance` / `PreparedPlanInput` module-local (`pdf-origin.ts`); `pdfExtractedSectionSchema` non-exported (`pdf-validation.schemas.ts`); hook internals + `PDF_EXTRACTION_TIMEOUT_MS` / `buildPdfTruncationNotice` non-exported (`usePdfExtraction.ts`).
  - **F2 — fixtures/helpers:** Removed `seedMaxAttemptsForPlan` (`tests/fixtures/attempts.ts`); trimmed `tests/fixtures/pricing.ts` to exported `createStripeTierMap` only (dropped unused tier-config helpers); `DeferredPromise` non-exported (`deferred-promise.ts`); `SubscriptionTier` module-local (`subscription.ts`).
  - **F3 — smoke + runner:** `applySmokeMigrations` non-exported (`db-pipeline.ts`); `SmokeAppMode` module-local (`mode-config.ts`); `PlanInput` / `HeadingName` module-local (`tests/playwright/smoke/fixtures.ts`); `buildMinimalPdfBuffer` module-local (`pdf-fixture.ts`); `CommandRunOptions` / `VitestRunOptions` module-local (`scripts/tests/shared/vitest-runner.ts`).
  - **Checks:** `pnpm check:type` OK. `pnpm vitest run tests/unit/pdf tests/unit/security tests/unit/hooks/usePdfExtraction.spec.tsx tests/integration/security tests/integration/pdf-extract.spec.ts tests/integration/api/plans-stream.spec.ts` OK (F1). `pnpm vitest run tests/unit tests/integration` OK (F2). `pnpm test:unit` OK (F3 vitest-runner). `pnpm check:knip`: unused exports **28 → 16**, unused exported types **42 → 21**; no Bucket F paths left in report (remaining = deferred plan.md §5: session/auth/scheduling/etc.).
  - **Smoke:** `pnpm test:smoke` failed in agent env: `execSync('pnpm db:migrate')` → `/bin/sh: pnpm: command not found` (PATH in subprocess). Re-run smoke locally where `pnpm` is on PATH.
  - **Build:** `pnpm build` still hits `EnvValidationError: LOCAL_PRODUCT_TESTING cannot be enabled in production` during page data collection (`.env.local`), unchanged.

- [x] **Slice 8 — Group 2 (same-file exports):** Dropped `export` from file-local helpers/types: `manual-plan-form-payload.ts` (`convertPlanFormToOnboardingValues`, `ManualCreatePayloadResult`, `ManualCreatePayloadError`); `schedule-api.ts` (`SCHEDULE_FETCH_ERROR_CODE`, `ScheduleFetchError`); `tasks.ts` (`setTaskProgress`); `env/shared.ts` (`isNonProductionRuntimeEnv`); `placeholder-content.ts` (`PlaceholderContentOptions`); `cleanup.ts` (`CleanupStuckPlansDependencies`); `retry-policy.ts` (`RetryDecision`); `plan-generation-session.ts` (four session param interfaces + `createPlanGenerationSessionResponse`); `stream-emitters.ts` (`LifecycleGenerationStreamParams`); `stream-outcomes.ts` (`StreamingHelperDependencies`).

- [x] **Slice 9 — Group 3 (dead re-exports + constant):** `src/shared/constants/effort.ts`: `normalizeEffort` and `NormalizedEffortResult` module-local; removed dead barrel `src/features/plans/effort.ts` — sole consumer `tests/unit/utils/truncation-effort.spec.ts` now imports `@/shared/constants/effort`. `stream-outcomes.ts`: removed redundant `export type { ErrorLike, GenerationError }`. `src/features/ai/constants.ts`: removed unused `RETRY_BACKOFF_MS` (+ JSDoc). Biome format pass on a few dirty-tree files flagged by `check:full` (`local-catalog.ts`, `pdf/types.ts`, `useRetryGeneration.ts`, `tests/fixtures/attempts.ts`).

- [x] **Slice 10 — Group 4 (orphaned shared types):** Removed `IsoDateString` from `ai-provider.types.ts`. Removed unused `User`, `TaskResource`, `TaskWithResources` from `db.types.ts` (dropped unused `TaskResourceWithResource` import).

- [x] **Slice 11 — Group 1 (safe deferred: auth/context/worker/session):** `requireUser` module-local in `auth.ts`; `readHeader` + `RequestContext` module-local in `context.ts`; `processNextRegenerationJob` module-local; `createPlanGenerationSessionResponse` already slice 8.

- [x] **Slice 12 — Group 1 (webhook + dead session helpers):** `applyStripeWebhookEvent` module-local in `stripe-webhook-processor.ts`. Deleted unused `emitCancelledEvent` (`stream-emitters.ts`), `handleSuccessfulGeneration` (`stream-outcomes.ts`) and trimmed imports. `emitModuleSummaries` module-local (was only used inside `executeLifecycleGenerationStream`).

- [x] **Slice 13 — `getAuthUserId` (public API contract):** Kept export; added TSDoc `@public` so Knip treats it as intentional surface for OAuth/security flows (no `knip.jsonc` ignore entry).

### Final review (2026-04-18)

- **Knip:** `pnpm check:knip` → **0** unused exports / **0** unused exported types (down from 16 / 21 before this pass).
- **Types / lint:** `pnpm check:type` and `pnpm check:full` pass.
- **Tests:** Targeted vitest (AI, plans actions, plan-access-types, session, completion-metrics, stripe webhook, regeneration worker, auth, request-context, db-runtime, truncation-effort); `pnpm test:changed` pass.
- **Build:** `pnpm build` not re-run here — known `LOCAL_PRODUCT_TESTING` / production env validation during page collection remains out of scope for this cleanup.
- **Commits:** Slices 1–7 were uncommitted at handoff; this session completes Slices 8–13 on top — consider one or more `chore(knip): …` commits for the whole knip pass (user preference).
