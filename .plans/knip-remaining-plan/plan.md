# Plan: remaining non-barrel Knip findings

## Scope

This plan covers only the remaining non-barrel Knip findings from `/var/folders/_f/vqtdg0x17jq294z6bpy_pp240000gn/T/copilot-tool-output-1776463554767-eu2cfq.txt` after excluding the user-listed barrel / compat items and the intentionally preserved barrel import `src/features/plans/read-service/index.ts -> getPlanListTotalCount` used by `src/app/api/v1/plans/route.ts`.

Filtered remaining scope:
- 82 unused exports
- 92 unused exported types

No code changes were made while preparing this plan. No tests were run. No build was run.

## 1. Recommended cleanup buckets

### Bucket A — app leaf helpers, labels, and local component prop types (safe-first)
**Why:** these are mostly local helpers or prop/result types exported from app files without evidence of cross-module use.

**Primary files**
- `src/app/dashboard/components/activity-utils.ts`
- `src/app/plans/[id]/helpers.ts`
- `src/app/plans/components/plan-utils.ts`
- `src/app/plans/new/components/usePdfExtractionDraft.ts`
- `src/app/pricing/components/PricingCard.tsx`
- `src/app/pricing/components/PricingTiers.tsx`
- `src/app/settings/ai/components/ModelPreferencesSelector.tsx`
- `src/app/settings/integrations/components/index.ts`
- `src/app/api/v1/plans/stream/model-resolution.ts`

**Typical change shape**
- Remove `export` from file-local helpers, labels, and prop/result types.
- Trim one-line re-exports only when the symbol is not used as a public app-surface convenience export.

### Bucket B — app server-action exports and page-facing action/result helpers (medium risk)
**Why:** Knip flags exported server actions that currently show no importers, but `app/` action files are easy to misread because export surfaces can be tied to page wiring decisions.

**Primary files**
- `src/app/plans/[id]/actions.ts`
- `src/app/plans/[id]/modules/[moduleId]/actions.ts`

**Typical change shape**
- Confirm whether the flagged server actions are actually dead, or intentionally exported for page/action wiring.
- If dead, de-export or delete only after checking the page subtree in the same slice.

### Bucket C — shared runtime constants, schemas, read-model/query types, and env facets (mixed but usually manageable)
**Why:** many findings are overshared internals rather than truly dead code. Most can likely be narrowed without behavior changes, but some sit on shared contracts.

**Primary files**
- `src/shared/constants/ai-models.ts`
- `src/shared/constants/effort.ts`
- `src/shared/constants/pagination.ts`
- `src/shared/constants/retry-policy.ts`
- `src/shared/schemas/scheduling.schemas.ts`
- `src/features/scheduling/types.ts`
- `src/features/plans/read-models/completion-metrics.ts`
- `src/features/plans/read-models/summary.ts`
- `src/features/plans/status/read-status.ts`
- `src/lib/config/env/ai.ts`
- `src/lib/config/env/app.ts`
- `src/lib/config/env/auth.ts`
- `src/lib/config/env/observability.ts`
- `src/lib/config/env/queue.ts`
- `src/lib/config/env/shared.ts`
- `src/lib/db/queries/plans.ts`
- `src/lib/db/queries/types/plans.types.ts`

**Typical change shape**
- De-export local row types, env facet interfaces, and helper constants that are only consumed in-file.
- Leave shared contract types alone unless importer grep is unambiguous.

### Bucket D — AI provider/session internals and streaming helper surfaces (medium-high risk)
**Why:** many findings are clearly internal, but they sit on plan generation, streaming, provider parsing, and retry flows.

**Primary files**
- `src/features/ai/prompts.ts`
- `src/features/ai/providers/openrouter-response.ts`
- `src/features/ai/timeout.ts`
- `src/features/ai/generation-policy.ts` (only non-excluded findings)
- `src/features/ai/model-resolution-error.ts`
- `src/features/plans/session/model-resolution.ts`
- `src/features/plans/session/plan-generation-session.ts` (only non-excluded findings)
- `src/features/plans/session/stream-cleanup.ts`
- `src/features/plans/session/stream-emitters.ts` (only non-excluded findings)
- `src/features/plans/session/stream-outcomes.ts` (only non-excluded findings)
- `src/features/plans/session/usePlanGenerationSession.ts`
- `src/hooks/useRetryGeneration.ts`
- `src/hooks/useStreamingPlanGeneration.ts`

**Typical change shape**
- De-export helpers/types that are only used inside the defining session/provider module.
- Avoid moving logic or merging files during the first cleanup pass.

### Bucket E — auth/api/db/logging boundaries plus billing/jobs entrypoints (risky / defer unless grouped carefully)
**Why:** these symbols sit on live request, worker, webhook, and logging boundaries; some may be intentionally exported aliases.

**Primary files**
- `src/lib/api/auth.ts`
- `src/lib/api/context.ts`
- `src/lib/api/error-normalization.ts`
- `src/lib/api/error-response.ts`
- `src/lib/date/format-local-ymd.ts`
- `src/lib/date/relative-time.ts`
- `src/lib/db/queries/helpers/attempts-input.ts`
- `src/lib/db/queries/jobs/shared.ts` (only non-excluded findings)
- `src/lib/db/service-role.ts`
- `src/lib/logging/request-context.ts`
- `src/features/billing/account-snapshot.ts`
- `src/features/billing/local-catalog.ts`
- `src/features/billing/local-stripe.ts`
- `src/features/billing/price-catalog.ts`
- `src/features/billing/stripe-webhook-processor.ts`
- `src/features/billing/validation/stripe.types.ts`
- `src/features/jobs/regeneration-worker.ts`
- `src/features/plans/lifecycle/creation-pipeline.ts`
- `src/features/plans/lifecycle/plan-operations.ts`
- `src/shared/types/billing.types.ts`

**Typical change shape**
- Start with local types/helpers only.
- Treat alias exports and entrypoint-adjacent helpers as separate mini-slices.

### Bucket F — PDF/extraction legacy surfaces and script/test-only exports (defer-last)
**Why:** PDF is explicitly deprioritized in repo learnings, and several remaining findings only affect hooks, smoke helpers, fixtures, or script utilities that `pnpm build` will not validate.

**Primary files**
- `src/hooks/usePdfExtraction.ts`
- `src/features/pdf/security/pdf-extraction-proof.ts`
- `src/features/pdf/structure.ts`
- `src/features/pdf/security/malware-scanner.ts`
- `src/features/pdf/security/mock-av-provider.ts`
- `src/features/pdf/types.ts`
- `src/features/plans/api/pdf-origin.ts`
- `src/shared/schemas/pdf-validation.schemas.ts`
- `scripts/tests/shared/vitest-runner.ts`
- `tests/fixtures/attempts.ts`
- `tests/fixtures/pricing.ts`
- `tests/helpers/deferred-promise.ts`
- `tests/helpers/smoke/db-pipeline.ts`
- `tests/helpers/smoke/mode-config.ts`
- `tests/helpers/subscription.ts`
- `tests/playwright/smoke/fixtures.ts`
- `tests/playwright/smoke/helpers/pdf-fixture.ts`

**Typical change shape**
- De-export local hook/test/script types and helpers only after explicit importer grep.
- Keep PDF runtime + smoke helpers together when touching them.

## 2. Exact files to inspect per bucket

### Bucket A — app leaf helpers, labels, and local component prop types
Inspect the exporter files above plus these current consumers / neighbors:
- `src/app/dashboard/components/ActivityStreamSidebar.tsx`
- `src/app/dashboard/components/DashboardContent.tsx`
- `src/app/plans/[id]/components/PlanDetailContent.tsx`
- `src/app/plans/[id]/components/PlanDetails.tsx`
- `src/app/plans/[id]/components/PlanTimeline.tsx`
- `src/app/plans/new/components/PdfExtractionPreview.tsx`
- `src/app/plans/new/components/PdfPlanSettingsEditor.tsx`
- `src/app/plans/new/components/PdfSectionsEditor.tsx`
- `src/app/pricing/components/PricingGrid.tsx`
- `src/app/pricing/components/pricing-config.ts`
- `src/app/pricing/page.tsx`
- `src/app/settings/integrations/components/IntegrationGrid.tsx`

### Bucket B — app server-action exports and page-facing action/result helpers
Inspect the exporter files above plus the full page subtree that could own wiring:
- `src/app/plans/[id]/page.tsx`
- `src/app/plans/[id]/components/PlanDetailContent.tsx`
- `src/app/plans/[id]/components/PlanDetails.tsx`
- `src/app/plans/[id]/components/PlanTimeline.tsx`
- `src/app/plans/[id]/modules/[moduleId]/page.tsx`
- `src/app/plans/[id]/modules/[moduleId]/components/ModuleDetailContent.tsx`
- `src/app/plans/[id]/modules/[moduleId]/components/TasksList.tsx`
- `src/app/plans/[id]/server/task-progress-action-deps.ts`

### Bucket C — shared runtime constants, schemas, read-model/query types, and env facets
Inspect the exporter files above plus these current importers / facades:
- `src/app/api/v1/plans/route.ts`
- `src/features/plans/read-service/plan-read-service.ts`
- `src/features/plans/retry-policy.ts`
- `src/features/plans/effort.ts`
- `src/features/ai/providers/router.ts`
- `src/lib/db/queries/helpers/schedule-helpers.ts`
- `src/features/scheduling/distribute.ts`
- `src/features/scheduling/schedule-api.ts`
- `src/lib/config/env.ts`

### Bucket D — AI provider/session internals and streaming helper surfaces
Inspect the exporter files above plus these route/test boundaries:
- `src/features/ai/providers/openrouter.ts`
- `src/app/api/v1/plans/stream/route.ts`
- `src/app/api/v1/plans/[planId]/retry/route.ts`
- `src/app/api/v1/plans/stream/helpers.ts`
- `tests/unit/ai/providers/openrouter.spec.ts`
- `tests/unit/ai/providers/openrouter-response-usage.spec.ts`
- `tests/unit/features/plans/session/*.spec.ts`

### Bucket E — auth/api/db/logging boundaries plus billing/jobs entrypoints
Inspect the exporter files above plus these live consumers:
- `src/lib/db/runtime.ts`
- `src/lib/db/queries/users.ts`
- `src/lib/db/queries/admin/jobs-metrics.ts`
- `src/app/api/v1/stripe/webhook/route.ts`
- `src/app/api/v1/stripe/local/complete-checkout/route.ts`
- `src/app/api/internal/jobs/regeneration/process/route.ts`
- `src/app/api/v1/user/preferences/route.ts`
- `src/features/jobs/queue.ts`
- `tests/unit/stripe/stripe-webhook-processor.spec.ts`
- `tests/unit/jobs/regeneration-worker.spec.ts`
- `tests/unit/api/auth.spec.ts`
- `tests/unit/logging/request-context.spec.ts`

### Bucket F — PDF/extraction legacy surfaces and script/test-only exports
Inspect the exporter files above plus these runtime/smoke consumers:
- `src/app/plans/new/components/PdfCreatePanel.tsx`
- `src/app/api/v1/plans/from-pdf/extract/route.ts`
- `src/features/plans/lifecycle/adapters/pdf-origin-adapter.ts`
- `src/features/pdf/validation/pdf.ts`
- `src/features/pdf/validation/pdf.types.ts`
- `tests/unit/hooks/usePdfExtraction.spec.tsx`
- `tests/playwright/smoke/auth.pdf-settings.spec.ts`
- `tests/playwright/smoke/anon.home.spec.ts`
- `scripts/tests/run.ts`

## 3. Safe-first execution order

1. **Bucket A except the integration barrel convenience export**  
   Start with obviously file-local helpers/props/results in app leaf modules.

2. **Bucket C safe internals only**  
   First pass: pagination helpers, env facet interfaces, query row types, read-model local types, and internal constants that have no cross-file imports.

3. **Bucket B after subtree audit**  
   Only touch `actions.ts` exports after confirming the owning page/components do not rely on those named actions.

4. **Bucket D provider parsing first, session pipeline second**  
   Do `openrouter-response.ts`, `timeout.ts`, `model-resolution-error.ts`, and other parser/helper files before `plan-generation-session.ts`, `stream-emitters.ts`, and `stream-outcomes.ts`.

5. **Bucket E local boundary internals, then entrypoints**  
   Start with local helper/type de-exports; leave `auth.ts`, `service-role.ts`, `request-context.ts`, billing webhook processing, and regeneration worker exports until the end of this bucket.

6. **Bucket F last**  
   PDF/runtime-smoke/test/script surfaces should be last because they cross legacy runtime flows and build-only validation will miss several script/test-only regressions.

## 4. Build-only validation plan

Do **not** run validation now. For the later implementation phase, use this minimum build-only strategy:

1. **Before editing a slice**
   - Re-run Knip and confirm the target symbol is still reported.
   - Grep direct symbol usage first for any item that could be test-only or script-only.

2. **After each runtime slice**
   - Re-run Knip for the touched slice.
   - Run `pnpm build` once for that completed runtime slice.

3. **For Buckets D and E high-risk slices**
   - Batch the route/worker entrypoint and its helper files together.
   - Run one `pnpm build` after the full slice rather than after each tiny file.

4. **Important limitation of build-only validation**
   - `pnpm build` will not validate script/test-only exports in `scripts/**` and `tests/**`.
   - For Bucket F script/test items and any runtime export that is only imported by tests, rely on importer grep during planning and treat those edits as deferred unless validation scope expands.

5. **Final pass**
   - Re-run Knip at the end.
   - The only remaining findings should be intentionally deferred risk items, if any.

## 5. Risks / defer list

Defer unless the implementation slice is explicitly ready and grouped with its consumers:
- `src/features/plans/session/plan-generation-session.ts`
- `src/features/plans/session/stream-emitters.ts`
- `src/features/plans/session/stream-outcomes.ts`
- `src/lib/api/auth.ts`
- `src/lib/api/context.ts`
- `src/lib/db/service-role.ts`
- `src/lib/logging/request-context.ts`
- `src/features/billing/stripe-webhook-processor.ts`
- `src/features/jobs/regeneration-worker.ts`
- `src/hooks/usePdfExtraction.ts`
- `src/features/pdf/**`
- `tests/helpers/smoke/db-pipeline.ts`
- `scripts/tests/shared/vitest-runner.ts`

Specific risk notes:
- `serviceRoleDb` is documented as an intentionally explicit alias even though `db` exists; this may be a naming safeguard, not dead surface.
- `request-context.ts` exports both named and default access patterns today; removing either can silently break route ergonomics.
- App helper exports with test-only consumers will survive `pnpm build` but still break tests.
- PDF code is legacy/deprioritized, but still wired through runtime routes and smoke coverage.

## 6. Open questions

- Are `updateTaskProgressAction`, `getPlanScheduleForPage`, and `updateModuleTaskProgressAction` truly dead, or intentionally kept exported for page/server-action wiring that is not obvious from static imports?
- Should `src/app/settings/integrations/components/index.ts -> IntegrationCard` remain as a convenience barrel export even though direct imports currently dominate?
- Should pricing cleanup leave `PricingTiers.tsx -> TierConfig` alone and treat the duplicate `pricing-config.ts` contract as the actual public surface?
- Are `computeDetailsCardStats` and any similar app helpers intentionally exported only for unit tests? If so, is the desired cleanup to de-export and rewrite tests, or keep them public?
- Should `serviceRoleDb` and `getRequestContext` named aliases be preserved as explicit ergonomic / clarity exports despite Knip?
- Does the team want PDF/test/script-only findings handled in the same cleanup pass, or deferred until validation scope expands beyond build-only checks?
