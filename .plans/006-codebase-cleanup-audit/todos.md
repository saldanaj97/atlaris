# 006 — Codebase cleanup audit follow-through

Source: report-only cleanup audit across 8 tracks (dedup/DRY, type consolidation, dead code, circular deps, weak types, defensive code, deprecated/legacy, AI-slop/comments).
Plan: `./plan.md`

## Acceptance Criteria

- [ ] AC1 — All 4 circular dependencies reported by `pnpm check:circular` are eliminated (Stripe barrel ×3, regeneration-orchestration ×1); `pnpm check:circular` exits 0.
- [ ] AC2 — `pnpm check:knip` reports zero unused files, unused exports, and unused exported types from the audit, or each remaining entry has a justified suppression in `knip.jsonc`.
- [ ] AC3 — Duplicate `isAbortError` helpers collapse to a single import from `src/lib/errors.ts`; hardcoded `'/auth/sign-in'` redirects all go through `ROUTES.AUTH.SIGN_IN` from `src/features/navigation/routes.ts`.
- [ ] AC4 — Canonical types (`SkillLevel`, `LearningStyle`, `NodeEnv`, `FailureClassification`, plan read row contracts, plan-generation core input) have a single owner; duplicate declarations and re-import paths are removed.
- [ ] AC5 — Inline-drain contract uses `Promise<void>` where only completion matters; test-only `{} as DbClient` / `db: unknown` / bespoke `AttemptsDbClient` casts route through `makeDbClient()` and shared `RequestScope` typing; identified `as any` test casts are replaced or justified.
- [ ] AC6 — Identified over-defensive catches are removed or narrowed (`safeMarkPlanFailed`, `ManageSubscriptionButton`, stream-route `toPayloadLog`, `runGenerationAttempt` sync catch, `SiteHeader` tier swallow), and redundant `?? []` fallbacks on typed arrays are deleted.
- [ ] AC7 — Docs reflect current runtime: `requestBoundary.component()` / `requestBoundary.action()` is the documented default, `withErrorBoundary` legacy framing in `docs/api/error-contract.md` is updated, and deprecated `stripe?: Stripe` injection path is migrated or explicitly scoped as compatibility shim.
- [ ] AC8 — Identified AI-slop comments/placeholder narration are trimmed without removing load-bearing safety/rationale comments (service-role, RLS, advisory-lock, abort-signal, framework quirks).
- [ ] AC9 — `pnpm check:full`, `pnpm check:knip`, `pnpm check:circular`, and `pnpm test:changed` all pass on the final branch.

## Tasks (aligned with plan.md Steps)

### Step 0.0 — Confirm Scope

- [ ] Re-run `pnpm check:circular` and `pnpm check:knip` to lock in baseline counts (4 cycles, 2 files, 7 exports, 11 types).
- [ ] Capture path corrections from verification pass (see "Path corrections" below) into `plan.md`.
- [ ] Confirm no open PR already in flight for Stripe barrel, regeneration deps, or read-projection `projectors.ts`.
- [ ] Inspect `src/features/billing/stripe-commerce.ts` barrel and internal modules (`factory.ts`, `boundary-impl.ts`, `reconciliation.ts`, `subscription-db-sync.ts`, `subscription-status.ts`, `types.ts`).
- [ ] Inspect `src/features/plans/regeneration-orchestration/{index,deps}.ts` and `src/features/jobs/regeneration-worker.ts`.
- [ ] Inventory consumers of unused exports/types flagged by knip before deletion.

### Step 1.0 — Break Stripe Barrel Cycles

- [ ] Audit every `from '@/features/billing/stripe-commerce'` import from files inside `src/features/billing/stripe-commerce/`.
- [ ] Rewrite internal files to import from sibling modules or `./types` directly (never back through the barrel).
- [ ] Decide barrel role: external-consumer-only surface.
- [ ] Move shared internal types into `src/features/billing/stripe-commerce/types.ts` if needed to avoid internal reliance on the barrel.
- [ ] Re-run `pnpm check:circular`; confirm 3 Stripe cycles gone.
- [ ] Re-run `pnpm check:knip`; confirm Stripe-related unused exports shrink accordingly.

### Step 2.0 — Break Regeneration Orchestration Cycle

- [ ] Inspect import chain `regeneration-worker.ts → regeneration-orchestration/index.ts → deps.ts`.
- [ ] Invert or split dependency (likely `deps.ts` should not reach back into `index.ts`).
- [ ] Update call sites and barrel re-exports accordingly.
- [ ] Confirm `pnpm check:circular` reports 0 cycles.

### Step 3.0 — Remove Dead Code (Knip-backed)

- [ ] Delete `src/features/billing/stripe-commerce/local-checkout-replay.ts` after confirming no live `src/` importers.
- [ ] Delete `src/features/plans/read-projection/projectors.ts` after confirming consumers import underlying modules directly.
- [ ] Remove unused exports: `getBillingStripeClient` (both locations), `requireInternalUserByAuthId`, `PLAN_STALENESS_THRESHOLD_DAYS`, `applyUserRateLimitHeaders`, `assertTaskIdsInPlanScopeForUser`, `assertTaskIdsInModuleScopeForUser`.
- [ ] Remove unused exported types (11): `RegenerationQuotaResult`, `ExecuteLocalSubscriptionReplayOverrides` (×2), `PlanDetailStatusSnapshot`, `DefaultRegenerationOrchestrationDepsOptions`, and the 6 task-progress types from `src/features/plans/task-progress/index.ts`.
- [ ] Audit `knip.jsonc:47` suppression for `console-spy.ts`; remove stale entry (imported by `client.spec.ts`).
- [ ] Confirm false positives stay (`lint-staged`, `@vitest/coverage-v8`, `p-retry`, `ws`, `tw-animate-css`, `@better-auth/passkey`).

### Step 4.0 — Unify Shared Helpers

- [ ] Replace local `isAbortError` copies with import from `src/lib/errors.ts`:
  - [ ] `src/features/ai/providers/router.ts:72`
  - [ ] `src/features/billing/stripe-commerce/subscription-db-sync.ts:34`
  - [ ] `src/app/settings/profile/components/ProfileForm.tsx:87`
  - [ ] `src/app/pricing/components/SubscribeButton.tsx:46`
- [ ] Replace hardcoded `'/auth/sign-in'` with `ROUTES.AUTH.SIGN_IN`:
  - [ ] `src/app/dashboard/components/DashboardContent.tsx:28`
  - [ ] `src/app/settings/billing/components/BillingCards.tsx:24`
  - [ ] `src/app/settings/ai/components/ModelSelectionCard.tsx:27`
  - [ ] `src/app/plans/components/PlansContent.tsx:49`
- [ ] Evaluate whether to consolidate bootstrap SQL fragments (`tests/helpers/db/bootstrap.ts`, `tests/helpers/db/rls-bootstrap.ts`, `scripts/bootstrap-local-db.ts`, `.github/workflows/ci-trunk.yml:135-145`) into a shared SQL module; defer if risk too high.

### Step 5.0 — Tighten Regeneration Inline-Drain Typing + Defensive Handling

- [ ] Change `Promise<unknown>` to `Promise<void>` in:
  - [ ] `src/features/jobs/regeneration-inline-drain.ts` (L8, L27, L41)
  - [ ] `src/features/plans/regeneration-orchestration/deps.ts` (L82, L98, L101)
- [ ] Remove/narrow `safeMarkPlanFailed()` swallow in `src/features/plans/session/stream-cleanup.ts:37-44`; let real lifecycle errors surface or rethrow classified.
- [ ] Remove unnecessary try/catch around `toPayloadLog(parsedBody)` in `src/app/api/v1/plans/stream/route.ts:60-86`.
- [ ] Revisit `runGenerationAttempt()` sync catch around `setupAbortAndTimeout()` in `src/features/ai/orchestrator.ts:81-95`.
- [ ] Fix or justify `ManageSubscriptionButton` outer catch at `src/components/billing/ManageSubscriptionButton.tsx:242-252`.
- [ ] Fix `SiteHeader` swallowing tier fetch errors at `src/components/shared/SiteHeader.tsx:45-56`.
- [ ] Delete redundant `?? []` fallbacks on typed arrays in:
  - [ ] `src/app/plans/[id]/components/PlanDetails.tsx:40`
  - [ ] `src/app/plans/[id]/components/PlanTimeline.tsx:40,44`
  - [ ] `src/app/plans/[id]/components/TimelineModuleCard.tsx:175`
  - [ ] `src/app/plans/[id]/modules/[moduleId]/components/ModuleDetail.tsx:18`
  - [ ] `src/app/plans/[id]/modules/[moduleId]/components/ModuleDetailClient.tsx:40`
  - [ ] `src/app/plans/[id]/modules/[moduleId]/components/LessonAccordionItem.tsx:195`
  - [ ] `src/features/plans/task-progress/visible-state.ts` (multiple lines)
  - [ ] `src/features/plans/read-projection/detail-dto.ts:128,129,136`

### Step 6.0 — Consolidate Types

- [ ] Merge duplicate plan read row contracts: `src/lib/db/queries/plans.ts` (L37-65) ↔ `src/features/plans/read-projection/summary-projection.ts` (L21-43) ↔ `src/shared/types/db.types.ts` (L68-85). Keep single owner.
- [ ] Replace `PromptParams` in `src/features/ai/prompts.ts:6-14` with `GenerationInput` from `src/shared/types/ai-provider.types.ts:1-8`.
- [ ] Replace hand-written `skillLevel` / `learningStyle` literal unions with `SkillLevel` / `LearningStyle` from `src/shared/types/db.types.ts:11-12` in:
  - [ ] `src/shared/types/ai-provider.types.ts:4-6`
  - [ ] `src/features/ai/prompts.ts:9-10`
  - [ ] `src/features/plans/lifecycle/types.ts:21-23,31-33,71-73`
  - [ ] `src/features/plans/session/plan-generation-session.ts:62-64`
  - [ ] `src/features/plans/session/session-events.ts:7-8`
  - [ ] `src/features/ai/plan-persistence-store.ts:30-32`
  - [ ] `src/features/ai/streaming/schema.ts:7`
- [ ] Dedupe `NodeEnv` alias (`src/lib/config/env/shared.ts:39` ↔ `src/lib/config/env/app.ts:14`).
- [ ] Repoint `FailureClassification` imports from `@/shared/types/client.types` to canonical `@/shared/types/failure-classification.types` across the 13 server modules identified.
- [ ] Consolidate plan-generation core fields (topic, skillLevel, weeklyHours, learningStyle, startDate, deadlineDate) across `plan-generation-session.ts`, `session-events.ts`, `lifecycle/types.ts`, `shared/schemas/learning-plans.schemas.ts` into one source.
- [ ] Keep non-merge items (`RequestContext`, `PlanStatus` client vs read-projection, `TierConfig` variants) separate and document.

### Step 7.0 — Weak Types in Tests

- [ ] Replace `{} as DbClient` with `makeDbClient()` in:
  - [ ] `tests/unit/features/billing/regeneration-quota-boundary.spec.ts:13`
  - [ ] `tests/unit/features/plans/regeneration-orchestration/request.spec.ts:12`
  - [ ] `tests/unit/features/plans/lifecycle/adapters/usage-recording-adapter.spec.ts:13`
  - [ ] `tests/unit/features/plans/lifecycle/adapters/plan-persistence-adapter.spec.ts:26`
- [ ] Replace `db: unknown` with `RequestScope` (from `src/lib/api/request-boundary.ts:21`) in:
  - [ ] `tests/unit/app/plans/actions.spec.ts:78,115,144`
  - [ ] `tests/unit/app/plans/modules/actions.spec.ts:72,108`
- [ ] Replace bespoke `AttemptsDbClient` cast with shared helper at `tests/unit/ai/orchestrator-timeout.spec.ts:19-29`.
- [ ] Fix `globalThis as any` at `tests/e2e/plan-schedule-view.spec.tsx:36`.
- [ ] Fix `'gold' as any` at `tests/integration/db/stripe.schema.spec.ts:51`.
- [ ] Replace local `object`-param logger interface in `src/features/ai/model-resolver.ts:33-37` with real logger method types.

### Step 8.0 — Deprecated / Legacy

- [x] Update docs to present `requestBoundary.component()` / `requestBoundary.action()` as default:
  - [x] `docs/architecture/auth-and-data-layer.md:24-25,45-65`
  - [x] `src/lib/db/AGENTS.md:35-36`
- [x] Also updated `.github/copilot-instructions.md` (per plan step 9.0).
- [x] Rewrite "legacy handlers cannot use `withErrorBoundary(...)`" language in `docs/api/error-contract.md:42` to match current runtime.
- [x] `stripe?: Stripe` injection: kept as compatibility seam; JSDoc above `AcceptWebhookInput`, `SyncSubscriptionToDbDeps`, `StripeReconciliationDeps`, `TransitionDeps`, and Stripe route `*HandlerDeps` types. No gateway-only migration in this pass. `tests/integration/stripe/subscriptions.spec.ts:33` covered by `TransitionDeps` doc (no file edit).
- [x] Mark auth wrappers (`withServerComponentContext`, `withServerActionContext`) as internal compat shims in docstrings.
- [ ] Leave intentional items (nested error-envelope fallback, `DATABASE_URL_UNPOOLED` alias, PDF legacy refs, pricing fallback path, `job_queue`).

### Step 9.0 — AI-Slop / Comment Cleanup (last)

- [ ] Trim pure JSX narration comments in `src/components/shared/nav/MobileHeader.tsx:32-47`.
- [ ] Remove placeholder/TODO banner in `src/app/about/components/TeamSection.tsx:8-11`.
- [ ] Trim narration in `src/app/plans/[id]/modules/[moduleId]/components/placeholder-content.ts:21-28`.
- [ ] Remove obvious comments in `src/app/plans/[id]/modules/[moduleId]/components/LessonAccordionItem.tsx:134-135,197,207,231-393`.
- [ ] Trim builder/docstring noise in `tests/fixtures/plan-detail.ts` (audit flagged "read-projection/plan-detail.ts" but that file does not exist).
- [ ] Trim verbose JSDoc in `src/components/shared/ThemeToggle.tsx:8-21`.
- [ ] Review `streaming.ts`, `tasks.ts`, `router.ts`, `errors.ts`, `learningPlans.ts` for stale narrations/TODOs.
- [ ] Keep load-bearing comments: service-role DB safety, auth/proxy behavior, RLS/advisory-lock rationale, framework quirks in `layout.tsx`, abort-signal subtleties.

### Step 10.0 — Validation

- [ ] Run `pnpm check:circular` — expect 0 cycles.
- [ ] Run `pnpm check:knip` — expect audit-listed items gone.
- [ ] Run `pnpm check:full`.
- [ ] Run `pnpm test:changed`.
- [ ] Run targeted vitest for any touched integration specs (regeneration, Stripe, task-progress).
- [ ] Capture before/after counts for report.

### Step 11.0 — Wrap-up

- [ ] Split work into reviewable PRs per step (Stripe cycles, regeneration cycle, dead code, helpers, typing, defensive, docs, comments).
- [ ] Record deviations and path corrections below.
- [ ] Update `.plans/lessons.md` if any recurring pattern emerged.

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

### Deviations / notes

- Follow-up order mirrors audit recommendation: Stripe cycles → dead code → shared helpers → regeneration typing/defensive → type consolidation → docs/comments last.
- Audit tooling unavailable: `ts-prune`, `depcheck`. Available: `pnpm`, `biome`, `knip`, `madge`, `tsgo`, `vitest`.
- Low-confidence items (optimistic task-status dupes between `PlanDetails.tsx` and `ModuleDetailClient.tsx`, access-result helper near-dupes) intentionally deferred until a third use site appears.

### Follow-ups

- [ ] Decide whether `PricingTiers.tsx` display metadata should migrate into `src/features/billing/` if reuse grows.
- [ ] Decide ownership split between `client.types` re-export and `failure-classification.types` canonical.
- [ ] Consider extracting shared SQL bootstrap into `src/lib/db/sql-fragments/` if consolidation is approved.
