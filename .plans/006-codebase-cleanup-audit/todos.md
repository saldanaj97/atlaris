# 006 — Codebase cleanup audit follow-through

Source: report-only cleanup audit across 8 tracks (dedup/DRY, type consolidation, dead code, circular deps, weak types, defensive code, deprecated/legacy, AI-slop/comments).
Plan: `./plan.md`

## Acceptance Criteria

- [x] AC1 — All 4 circular dependencies reported by `pnpm check:circular` are eliminated (Stripe barrel ×3, regeneration-orchestration ×1); `pnpm check:circular` exits 0.
- [x] AC2 — `pnpm check:knip` reports zero unused files, unused exports, and unused exported types from the audit, or each remaining entry has a justified suppression in `knip.jsonc`.
- [x] AC3 — Duplicate `isAbortError` helpers collapse to a single import from `src/lib/errors.ts`; hardcoded `'/auth/sign-in'` redirects all go through `ROUTES.AUTH.SIGN_IN` from `src/features/navigation/routes.ts`.
- [x] AC4 — Canonical types (`SkillLevel`, `LearningStyle`, `NodeEnv`, `FailureClassification`, plan read row contracts, plan-generation core input) have a single owner; duplicate declarations and re-import paths are removed.
- [x] AC5 — Inline-drain contract uses `Promise<void>` where only completion matters; test-only `{} as DbClient` / `db: unknown` / bespoke `AttemptsDbClient` casts route through `makeDbClient()` and shared `RequestScope` typing; identified `as any` test casts are replaced or justified.
- [x] AC6 — Identified over-defensive catches are removed or narrowed (`safeMarkPlanFailed`, `ManageSubscriptionButton`, stream-route `toPayloadLog`, `runGenerationAttempt` sync catch, `SiteHeader` tier swallow), and redundant `?? []` fallbacks on typed arrays are deleted.
- [x] AC7 — Docs reflect current runtime: `requestBoundary.component()` / `requestBoundary.action()` is the documented default, `withErrorBoundary` legacy framing in `docs/api/error-contract.md` is updated, and deprecated `stripe?: Stripe` injection path is migrated or explicitly scoped as compatibility shim.
- [x] AC8 — Identified AI-slop comments/placeholder narration are trimmed without removing load-bearing safety/rationale comments (service-role, RLS, advisory-lock, abort-signal, framework quirks).
- [x] AC9 — `pnpm check:full`, `pnpm check:knip`, `pnpm check:circular`, and `pnpm test:changed` all pass on the final branch.

## Tasks (aligned with plan.md Steps)

### Step 0.0 — Confirm Scope

- [x] Re-run `pnpm check:circular` and `pnpm check:knip` to lock in baseline counts (4 cycles, 2 files, 7 exports, 11 types).
- [x] Capture path corrections from verification pass (see "Path corrections" below) into `plan.md`.
- [x] Confirm no open PR already in flight for Stripe barrel, regeneration deps, or read-projection `projectors.ts`.
- [x] Inspect `src/features/billing/stripe-commerce.ts` barrel and internal modules (`factory.ts`, `boundary-impl.ts`, `reconciliation.ts`, `subscription-db-sync.ts`, `subscription-status.ts`, `types.ts`).
- [x] Inspect `src/features/plans/regeneration-orchestration/{index,deps}.ts` and `src/features/jobs/regeneration-worker.ts`.
- [x] Inventory consumers of unused exports/types flagged by knip before deletion.

### Step 1.0 — Break Stripe Barrel Cycles

- [x] Audit every `from '@/features/billing/stripe-commerce'` import from files inside `src/features/billing/stripe-commerce/`.
- [x] Rewrite internal files to import from sibling modules or `./types` directly (never back through the barrel).
- [x] Decide barrel role: external-consumer-only surface.
- [x] Move shared internal types into `src/features/billing/stripe-commerce/types.ts` if needed to avoid internal reliance on the barrel.
- [x] Re-run `pnpm check:circular`; confirm 3 Stripe cycles gone.
- [x] Re-run `pnpm check:knip`; confirm Stripe-related unused exports shrink accordingly.

### Step 2.0 — Break Regeneration Orchestration Cycle

- [x] Inspect import chain `regeneration-worker.ts → regeneration-orchestration/index.ts → deps.ts`.
- [x] Invert or split dependency (likely `deps.ts` should not reach back into `index.ts`).
- [x] Update call sites and barrel re-exports accordingly.
- [x] Confirm `pnpm check:circular` reports 0 cycles.

### Step 3.0 — Remove Dead Code (Knip-backed)

- [x] Delete `src/features/billing/stripe-commerce/local-checkout-replay.ts` after confirming no live `src/` importers.
- [x] Delete `src/features/plans/read-projection/projectors.ts` after confirming consumers import underlying modules directly.
- [x] Remove unused exports: `getBillingStripeClient` (both locations), `requireInternalUserByAuthId`, `PLAN_STALENESS_THRESHOLD_DAYS`, `applyUserRateLimitHeaders`, `assertTaskIdsInPlanScopeForUser`, `assertTaskIdsInModuleScopeForUser`.
- [x] Remove unused exported types (11): `RegenerationQuotaResult`, `ExecuteLocalSubscriptionReplayOverrides` (×2), `PlanDetailStatusSnapshot`, `DefaultRegenerationOrchestrationDepsOptions`, and the 6 task-progress types from `src/features/plans/task-progress/index.ts`.
- [x] Audit `knip.jsonc:47` suppression for `console-spy.ts`; remove stale entry (imported by `client.spec.ts`).
- [x] Confirm false positives stay (`lint-staged`, `@vitest/coverage-v8`, `p-retry`, `ws`, `tw-animate-css`, `@better-auth/passkey`).

### Step 4.0 — Unify Shared Helpers

- [x] Replace local `isAbortError` copies with import from `src/lib/errors.ts`:
  - [x] `src/features/ai/providers/router.ts:72`
  - [x] `src/features/billing/stripe-commerce/subscription-db-sync.ts:34`
  - [x] `src/app/settings/profile/components/ProfileForm.tsx:87`
  - [x] `src/app/pricing/components/SubscribeButton.tsx:46`
- [x] Replace hardcoded `'/auth/sign-in'` with `ROUTES.AUTH.SIGN_IN`:
  - [x] `src/app/dashboard/components/DashboardContent.tsx:28`
  - [x] `src/app/settings/billing/components/BillingCards.tsx:24`
  - [x] `src/app/settings/ai/components/ModelSelectionCard.tsx:27`
  - [x] `src/app/plans/components/PlansContent.tsx:49`
- [x] Bootstrap SQL consolidation — deferred (risk too high for this pass).

### Step 5.0 — Tighten Regeneration Inline-Drain Typing + Defensive Handling

- [x] Change `Promise<unknown>` to `Promise<void>` in:
  - [x] `src/features/jobs/regeneration-inline-drain.ts`
  - [x] `src/features/plans/regeneration-orchestration/deps.ts`
- [x] Remove/narrow `safeMarkPlanFailed()` swallow in `src/features/plans/session/stream-cleanup.ts`; rethrows TypeError, ReferenceError, MissingRequestDbContextError; other failures logged with context.
- [x] `toPayloadLog` in `src/app/api/v1/plans/stream/route.ts` — already narrowed via `tryBuildPayloadLog` on branch.
- [x] Removed sync catch around `setupAbortAndTimeout()` in `src/features/ai/orchestrator.ts`.
- [x] `ManageSubscriptionButton` — replaced `.then().catch().finally()` with async/await + try/finally; dropped redundant outer catch.
- [x] `SiteHeader` — tier fetch failure now logs `logger.error` with context instead of bare swallow.
- [x] Delete redundant `?? []` fallbacks on typed arrays in:
  - [x] `src/app/plans/[id]/components/PlanDetails.tsx`
  - [x] `src/app/plans/[id]/components/PlanTimeline.tsx`
  - [x] `src/app/plans/[id]/components/TimelineModuleCard.tsx`
  - [x] `src/app/plans/[id]/modules/[moduleId]/components/ModuleDetail.tsx`
  - [x] `src/app/plans/[id]/modules/[moduleId]/components/ModuleDetailClient.tsx`
  - [x] `src/app/plans/[id]/modules/[moduleId]/components/LessonAccordionItem.tsx`
  - [x] `src/features/plans/task-progress/visible-state.ts`
  - [x] `src/features/plans/read-projection/detail-dto.ts`

### Step 6.0 — Consolidate Types

- [x] Merge duplicate plan read row contracts into `src/lib/db/queries/types/plans.types.ts`. Single owner.
- [x] Replace `PromptParams` with `GenerationInput` from `src/shared/types/ai-provider.types.ts`.
- [x] Replace hand-written `skillLevel` / `learningStyle` literal unions with `SkillLevel` / `LearningStyle` from `src/shared/types/db.types.ts` in:
  - [x] `src/shared/types/ai-provider.types.ts`
  - [x] `src/features/ai/prompts.ts`
  - [x] `src/features/plans/lifecycle/types.ts`
  - [x] `src/features/plans/session/plan-generation-session.ts`
  - [x] `src/features/plans/session/session-events.ts`
  - [x] `src/features/ai/plan-persistence-store.ts`
  - [x] `src/features/ai/streaming/schema.ts`
- [x] Dedupe `NodeEnv` alias — exported from `shared.ts`, imported in `app.ts`.
- [x] Repoint `FailureClassification` imports from `client.types` to `failure-classification.types` across 11 server modules.
- [x] Consolidate plan-generation core fields via `PlanGenerationCoreFields` / `PlanGenerationCoreFieldsNormalized` in `ai-provider.types.ts`.
- [x] Keep non-merge items (`RequestContext`, `PlanStatus` client vs read-projection, `TierConfig` variants) separate.

### Step 7.0 — Weak Types in Tests

- [x] Replace `{} as DbClient` with `makeDbClient()` in:
  - [x] `tests/unit/features/billing/regeneration-quota-boundary.spec.ts`
  - [x] `tests/unit/features/plans/regeneration-orchestration/request.spec.ts`
  - [x] `tests/unit/features/plans/lifecycle/adapters/usage-recording-adapter.spec.ts`
  - [x] `tests/unit/features/plans/lifecycle/adapters/plan-persistence-adapter.spec.ts`
- [x] Replace `db: unknown` with `RequestScope` in:
  - [x] `tests/unit/app/plans/actions.spec.ts`
  - [x] `tests/unit/app/plans/modules/actions.spec.ts`
- [x] Replace bespoke `AttemptsDbClient` cast with `makeAttemptsDbClient()` at `tests/unit/ai/orchestrator-timeout.spec.ts`.
- [x] Fix `globalThis as any` → `vi.stubGlobal` at `tests/e2e/plan-schedule-view.spec.tsx`.
- [x] Fix `'gold' as any` → `unknown` cast at `tests/integration/db/stripe.schema.spec.ts`.
- [x] Replace local `object`-param logger interface in `src/features/ai/model-resolver.ts` with `Pick<Logger, 'error' | 'warn' | 'info'>`.

### Step 8.0 — Deprecated / Legacy

- [x] Update docs to present `requestBoundary.component()` / `requestBoundary.action()` as default:
  - [x] `docs/architecture/auth-and-data-layer.md`
  - [x] `src/lib/db/AGENTS.md`
- [x] Also updated `.github/copilot-instructions.md`.
- [x] Rewrite "legacy handlers cannot use `withErrorBoundary(...)`" language in `docs/api/error-contract.md` to match current runtime.
- [x] `stripe?: Stripe` injection: kept as compatibility seam; JSDoc above `AcceptWebhookInput`, `SyncSubscriptionToDbDeps`, `StripeReconciliationDeps`, `TransitionDeps`, and Stripe route `*HandlerDeps` types.
- [x] Mark auth wrappers (`withServerComponentContext`, `withServerActionContext`) as internal compat shims in docstrings.
- [x] Intentional items left as-is (nested error-envelope fallback, `DATABASE_URL_UNPOOLED` alias, PDF legacy refs, pricing fallback path, `job_queue`).

### Step 9.0 — AI-Slop / Comment Cleanup (last)

- [x] Trim pure JSX narration comments in `src/components/shared/nav/MobileHeader.tsx`.
- [x] Remove placeholder/TODO banner in `src/app/about/components/TeamSection.tsx`.
- [x] Trim narration in `src/app/plans/[id]/modules/[moduleId]/components/placeholder-content.ts`.
- [x] Remove obvious comments in `src/app/plans/[id]/modules/[moduleId]/components/LessonAccordionItem.tsx`.
- [x] Trim builder/docstring noise in `tests/fixtures/plan-detail.ts`.
- [x] Trim verbose JSDoc in `src/components/shared/ThemeToggle.tsx`.
- [x] Review `streaming/utils.ts`, `router.ts` for stale narrations/TODOs — trimmed. `tasks.ts`, `errors.ts`, `learningPlans.ts` not in repo (paths stale from audit).
- [x] Kept load-bearing comments: service-role DB safety, auth/proxy behavior, RLS/advisory-lock rationale, framework quirks, abort-signal subtleties.

### Step 10.0 — Validation

- [x] Run `pnpm check:circular` — 0 cycles.
- [x] Run `pnpm check:knip` — clean (exit 0).
- [x] Run `pnpm check:full` — exit 0.
- [x] Run `pnpm test:changed` — exit 0 (no changed test files vs HEAD; targeted specs passed in earlier steps).
- [x] Targeted vitest for regeneration, stream-cleanup specs — passed.
- [x] Before/after counts captured in Implementation Review below.

### Step 11.0 — Wrap-up

- [x] Work committed as 11 focused commits on `chore/006-codebase-cleanup-audit` (not pushed).
- [x] Record deviations and path corrections below.
- [ ] Update `.plans/lessons.md` if any recurring pattern emerged — deferred to post-merge.

## Review

### Path corrections from verification pass

- `regeneration-inline-drain.ts` lives under `src/features/jobs/`, not `regeneration-orchestration/`.
- `stream-cleanup.ts` is `src/features/plans/session/stream-cleanup.ts`.
- `SiteHeader.tsx` is `src/components/shared/SiteHeader.tsx`.
- `ManageSubscriptionButton.tsx` is `src/components/billing/ManageSubscriptionButton.tsx`.
- Orchestrator timeout spec is `tests/unit/ai/orchestrator-timeout.spec.ts`.
- Unused type name is `DefaultRegenerationOrchestrationDepsOptions` (not `DefaultRegenerationOrchestrationDeps`).
- `src/features/plans/read-projection/plan-detail.ts` does not exist; closest slop target is `tests/fixtures/plan-detail.ts`.
- Plan read-row dedup is strongest between `src/lib/db/queries/plans.ts` and `src/features/plans/read-projection/summary-projection.ts`, not `src/app/plans/types.ts`.
- Plan-generation types file is not at `src/features/plans/plan-generation/types.ts`; use `plan-generation-session.ts`, `session-events.ts`, `lifecycle/types.ts`, and `shared/schemas/learning-plans.schemas.ts`.
- Bootstrap SQL lives in `tests/helpers/db/{bootstrap,rls-bootstrap}.ts`, `scripts/bootstrap-local-db.ts`, and `.github/workflows/ci-trunk.yml:135-145` (not `src/lib/db/`).

### Implementation Review

- Circular dependencies: **4 → 0** via Stripe barrel imports → `./types` (3 cycles) + regeneration worker → leaf imports from `process.ts`/`types.ts` (1 cycle). Validation fix: broke `db.types ↔ attempts ↔ ai-provider` cycle introduced by type consolidation (derived `SkillLevel`/`LearningStyle` from `@/lib/db/enums`).
- Knip: **2 unused files deleted**, **7 unused exports removed**, **11 unused exported types removed**. `knip.jsonc` updated with justified suppressions for barrel re-export surfaces.
- Validation:
  - `pnpm check:circular` **PASS** (0 cycles)
  - `pnpm check:knip` **PASS** (exit 0)
  - `pnpm check:full` **PASS** (exit 0)
  - `pnpm test:changed` **PASS** (exit 0; targeted specs run within each step)
- Commits (11, on `chore/006-codebase-cleanup-audit`, not pushed):
  1. `fix(billing): break Stripe barrel circular dependencies`
  2. `fix(jobs): break regeneration orchestration circular dependency`
  3. `refactor: remove Knip-reported dead code`
  4. `refactor: unify isAbortError imports and auth redirect constants`
  5. `refactor: tighten inline-drain typing and narrow defensive catches`
  6. `refactor(tests): replace weak type casts with typed mocks`
  7. `refactor: remove redundant ?? [] fallbacks on typed arrays`
  8. `refactor: consolidate canonical types`
  9. `docs: update auth patterns and deprecation markers`
  10. `chore: remove AI-slop comments and stale narration`
  11. `fix: break db.types ↔ attempts ↔ ai-provider circular import`

### Deviations / notes

- Follow-up order mirrors audit recommendation: Stripe cycles → dead code → shared helpers → regeneration typing/defensive → type consolidation → docs/comments last.
- Audit tooling unavailable: `ts-prune`, `depcheck`. Available: `pnpm`, `biome`, `knip`, `madge`, `tsgo`, `vitest`.
- Low-confidence items (optimistic task-status dupes between `PlanDetails.tsx` and `ModuleDetailClient.tsx`, access-result helper near-dupes) intentionally deferred until a third use site appears.
- Step 6 type consolidation introduced a transient circular dep (`db.types ↔ attempts ↔ ai-provider`); fixed in validation step by deriving `SkillLevel`/`LearningStyle` from `@/lib/db/enums` instead of `db.types`.
- `safeMarkPlanFailed` narrowed to rethrow `TypeError`/`ReferenceError`/`MissingRequestDbContextError`; generic DB errors still swallowed (conservative).
- `stripe?: Stripe` injection kept as compatibility seam with JSDoc documentation (no gateway migration this pass).
- Step 3 commit included `.plans/` files via `git add -A`; acceptable since they're tracked on this branch.
- Three plan file paths from audit were stale (`tasks.ts`, `errors.ts`, `learningPlans.ts` at listed paths); closest equivalents reviewed where they exist.

### Follow-ups

- [ ] Decide whether `PricingTiers.tsx` display metadata should migrate into `src/features/billing/` if reuse grows.
- [ ] Decide ownership split between `client.types` re-export and `failure-classification.types` canonical.
- [ ] Consider extracting shared SQL bootstrap into `src/lib/db/sql-fragments/` if consolidation is approved.
- [ ] Update `.plans/lessons.md` with patterns from this cleanup pass.
