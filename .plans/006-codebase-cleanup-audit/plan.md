# 006 — Codebase Cleanup Audit Follow-through Plan

Source: `.plans/006-codebase-cleanup-audit/todos.md`  
Owner: implementation agent  
Mode: implementation plan, not another audit

## Goal

Turn the report-only cleanup audit into reviewable code changes that remove confirmed cycles, dead code, duplicate helpers, weak test types, stale docs, and low-value narration without widening scope.

The finished branch must prove:

- `pnpm check:circular` exits 0.
- `pnpm check:knip` has no audit-listed unused files, exports, or exported types unless a remaining entry has a justified suppression in `knip.jsonc`.
- `pnpm check:full` passes.
- `pnpm test:changed` passes, or the review section records an environment-only blocker with exact failure output and a narrower command that passed.

## Current Baseline

Run these before editing and paste the current counts into the `todos.md` Review section if they differ from this plan.

```bash
pnpm check:circular
pnpm check:knip
```

Expected baseline on this plan:

- `pnpm check:circular`: 4 circular dependencies.
- Stripe cycles:
  - `features/billing/stripe-commerce.ts > features/billing/stripe-commerce/factory.ts`
  - `features/billing/stripe-commerce.ts > features/billing/stripe-commerce/factory.ts > features/billing/stripe-commerce/boundary-impl.ts`
  - `features/billing/stripe-commerce.ts > features/billing/stripe-commerce/factory.ts > features/billing/stripe-commerce/boundary-impl.ts > features/billing/stripe-commerce/reconciliation.ts > features/billing/stripe-commerce/subscription-db-sync.ts > features/billing/stripe-commerce/subscription-status.ts`
- Regeneration cycle:
  - `features/jobs/regeneration-worker.ts > features/plans/regeneration-orchestration/index.ts > features/plans/regeneration-orchestration/deps.ts`
- `pnpm check:knip`: 2 unused files, 7 unused exports, 11 unused exported types.

## Non-negotiable Rules

- Do not rename public route paths, API response shapes, database columns, enum values, or auth behavior as part of cleanup.
- Do not delete a Knip entry until current imports are checked with `rg`.
- Do not replace load-bearing comments about service-role access, RLS, advisory locks, abort signals, or framework quirks.
- Do not introduce new barrel imports inside a package's own implementation files.
- Do not broaden this into style churn. If an edit does not map to an acceptance criterion, leave it alone.
- Update `.plans/006-codebase-cleanup-audit/todos.md` as each step finishes. Do not batch all checkmarks at the end.

## Suggested PR Slices

Prefer these slices if this becomes multiple commits or PRs:

1. Stripe barrel cycles.
2. Regeneration cycle and inline-drain typing.
3. Knip-backed dead code.
4. Shared helper and redirect constants.
5. Type consolidation and weak test types.
6. Defensive catch cleanup.
7. Docs and comment cleanup.
8. Final validation and review notes.

Do not start with docs or comments. That is comfort-work. The value is in cycles, dead code, and type correctness.

## Step 0.0 — Confirm Scope And Protect The Worktree

1. Check current branch and dirty files.

```bash
git status --short
```

2. If unrelated files are dirty, leave them alone. Only edit files named by this plan or files that become necessary because type/lint errors prove a direct dependency.

3. Run the two baseline commands.

```bash
pnpm check:circular
pnpm check:knip
```

4. Confirm these files exist before implementation:

```bash
test -f src/features/billing/stripe-commerce.ts
test -f src/features/billing/stripe-commerce/factory.ts
test -f src/features/billing/stripe-commerce/boundary-impl.ts
test -f src/features/billing/stripe-commerce/types.ts
test -f src/features/jobs/regeneration-inline-drain.ts
test -f src/features/jobs/regeneration-worker.ts
test -f src/features/plans/regeneration-orchestration/deps.ts
test -f src/features/plans/regeneration-orchestration/index.ts
test -f src/features/plans/read-projection/projectors.ts
test -f src/features/plans/session/stream-cleanup.ts
```

5. Record any missing file in `todos.md` Review before editing. Missing files mean this plan is stale and needs a narrow adjustment, not guesswork.

## Step 1.0 — Break Stripe Barrel Cycles

### Problem

`src/features/billing/stripe-commerce.ts` is the public Stripe commerce barrel. Internal implementation files currently import types and values back through that public barrel. That creates 3 of the 4 circular dependencies.

### Target Design

- External app/routes/tests may import app-facing API from `@/features/billing/stripe-commerce`.
- Files inside `src/features/billing/stripe-commerce/` must import from sibling modules:
  - `./types` for `StripeCommerceBoundary`, input types, and `SubscriptionStatus`.
  - `./gateway`, `./live-gateway`, `./reconciliation`, etc. for internal values.
- The public barrel must only re-export; it must not become an internal dependency.

### Files To Inspect

```bash
rg -n "from ['\"]@/features/billing/stripe-commerce['\"]|from ['\"]@/features/billing/stripe-commerce/" src/features/billing/stripe-commerce src/app tests
```

### Required Edits

1. In `src/features/billing/stripe-commerce/factory.ts`, replace:

```ts
import type { StripeCommerceBoundary } from '@/features/billing/stripe-commerce';
```

with:

```ts
import type { StripeCommerceBoundary } from '@/features/billing/stripe-commerce/types';
```

2. In `src/features/billing/stripe-commerce/boundary-impl.ts`, replace the import from `@/features/billing/stripe-commerce` with a type-only import from `@/features/billing/stripe-commerce/types`.

The replacement should include:

```ts
import type {
	AcceptWebhookInput,
	BeginCheckoutInput,
	OpenPortalInput,
	StripeCommerceBoundary,
	StripeWebhookResponse,
} from '@/features/billing/stripe-commerce/types';
```

3. In `src/features/billing/stripe-commerce/subscription-status.ts`, replace:

```ts
import type { SubscriptionStatus } from '@/features/billing/stripe-commerce';
```

with:

```ts
import type { SubscriptionStatus } from '@/features/billing/stripe-commerce/types';
```

4. Leave absolute internal imports like `@/features/billing/stripe-commerce/gateway` alone unless lint asks for relative imports. They do not go through the public barrel and do not cause the cycle.

5. Re-run:

```bash
pnpm check:circular
```

Expected result after only this step: 1 remaining cycle, the regeneration cycle.

### Stop Conditions

- If `pnpm check:circular` still reports a Stripe cycle, run:

```bash
rg -n "from ['\"]@/features/billing/stripe-commerce['\"]" src/features/billing/stripe-commerce
```

Every match inside `src/features/billing/stripe-commerce/` is a bug unless it is the public barrel itself.

## Step 2.0 — Break Regeneration Orchestration Cycle

### Problem

Current cycle:

```text
src/features/jobs/regeneration-worker.ts
  -> src/features/plans/regeneration-orchestration/index.ts
  -> src/features/plans/regeneration-orchestration/deps.ts
  -> dynamic import('@/features/jobs/regeneration-worker')
```

`deps.ts` already uses a dynamic import, which is directionally correct, but Madge still reports the edge. The implementation package needs a cycle-free default drain wiring.

### Target Design

- Worker code may call orchestration process/request APIs.
- Orchestration dependency construction must not statically or analyzably import worker code through the orchestration public index.
- Inline drain default should remain lazy and should process one job.
- Normal regenerate API path should not inject custom drain options.

### Required Edits

1. Open:

```bash
sed -n '1,180p' src/features/plans/regeneration-orchestration/deps.ts
sed -n '1,180p' src/features/plans/regeneration-orchestration/index.ts
sed -n '1,220p' src/features/jobs/regeneration-worker.ts
```

2. Keep `RegenerationOrchestrationDeps.inlineDrain.drain` as `() => Promise<void>` after Step 5.0. Do not leave it as `Promise<unknown>`.

3. Fix the worker import first. In `src/features/jobs/regeneration-worker.ts`, do not import from the orchestration public index because the index re-exports `deps.ts`.

Replace:

```ts
import type { ProcessPlanRegenerationJobResult } from '@/features/plans/regeneration-orchestration';
import { processNextPlanRegenerationJob } from '@/features/plans/regeneration-orchestration';
```

with direct leaf imports:

```ts
import { processNextPlanRegenerationJob } from '@/features/plans/regeneration-orchestration/process';
import type { ProcessPlanRegenerationJobResult } from '@/features/plans/regeneration-orchestration/types';
```

4. Re-run `pnpm check:circular`.

If that clears the regeneration cycle, stop. Do not invent a new adapter.

5. If Madge still reports a cycle through `deps.ts` and `regeneration-worker.ts`, then move the inline default drain out of `deps.ts`:

   - Change `createDefaultRegenerationOrchestrationDeps(dbClient, options)` so `options.inlineDrain` is supplied by the app boundary that needs inline draining.
   - Update the regenerate route or caller that needs real inline drain to pass `() => drainRegenerationQueue({ maxJobs: 1 })`.
   - Keep tests injecting a fake drain.
   - Do not add a worker adapter imported by `deps.ts`; `deps.ts -> adapter -> worker -> process -> deps.ts` is still a cycle.

6. Run:

```bash
pnpm check:circular
```

Expected result: 0 cycles.

### Stop Conditions

- Do not solve this by importing orchestration internals into worker modules.
- Do not import `src/features/jobs/regeneration-worker.ts` from any file under `src/features/plans/regeneration-orchestration/` if Madge still sees it.
- If the first implementation does not clear Madge, back it out within this slice and use the app-boundary injection alternative.

## Step 3.0 — Remove Knip-backed Dead Code

### Problem

Knip reports confirmed unused files, exports, and exported types. These should be removed only after checking current consumers.

### Required Consumer Checks

Run these before deleting:

```bash
rg -n "local-checkout-replay|replayLocalSubscriptionCreated" src tests
rg -n "read-projection/projectors|from ['\"].*projectors" src tests
rg -n "getBillingStripeClient" src tests
rg -n "requireInternalUserByAuthId" src tests
rg -n "PLAN_STALENESS_THRESHOLD_DAYS" src tests
rg -n "applyUserRateLimitHeaders" src tests
rg -n "assertTaskIdsInPlanScopeForUser|assertTaskIdsInModuleScopeForUser" src tests
```

If a match is a real consumer, do not delete that symbol. Update the plan Review section and keep the symbol.

### Required Edits

1. Delete unused files if no consumers exist:

```text
src/features/billing/stripe-commerce/local-checkout-replay.ts
src/features/plans/read-projection/projectors.ts
```

2. Remove unused public barrel re-exports:

```text
src/features/billing/stripe-commerce.ts
```

Specifically remove `ExecuteLocalSubscriptionReplayOverrides` and `getBillingStripeClient` exports if they remain unused.

3. In `src/features/billing/stripe-commerce/factory.ts`:

- If only internal callers use `getBillingStripeClient`, stop exporting it.
- If `ExecuteLocalSubscriptionReplayOverrides` is only used internally, make it a local type and do not export it.
- Keep `createStripeCommerceBoundary`, `getStripeCommerceBoundary`, `isLocalStripeCompletionRouteEnabled`, and `executeLocalSubscriptionReplay` exported unless Knip proves otherwise.

4. Remove unused exports from these files:

```text
src/features/plans/api/route-context.ts
src/features/plans/read-projection/selectors.ts
src/lib/api/middleware.ts
src/lib/db/queries/tasks.ts
```

5. Remove unused exported types:

```text
src/features/billing/regeneration-quota-boundary.ts
src/features/plans/read-projection/index.ts
src/features/plans/regeneration-orchestration/deps.ts
src/features/plans/task-progress/index.ts
```

6. Check `knip.jsonc` for stale suppression around `console-spy.ts`. Remove it only if the file is now imported and Knip no longer needs the suppression.

7. Re-run:

```bash
pnpm check:knip
```

Expected result: no audit-listed unused files/exports/types.

### Stop Conditions

- Do not delete package-level index exports just because they look unused to a human. Trust current `pnpm check:knip` plus `rg`.
- If keeping an export intentionally, add a specific `knip.jsonc` suppression with a reason. Do not add broad suppressions.

## Step 4.0 — Unify Shared Helpers And Auth Redirect Constants

### Problem

Several local helpers duplicate `src/lib/errors.ts:isAbortError`, and several server components hardcode `'/auth/sign-in'` instead of using `ROUTES.AUTH.SIGN_IN`.

### Required Edits: `isAbortError`

1. Open the canonical helper:

```bash
sed -n '1,80p' src/lib/errors.ts
```

2. Replace local helper definitions with imports from `@/lib/errors` in:

```text
src/features/ai/providers/router.ts
src/features/billing/stripe-commerce/subscription-db-sync.ts
src/app/settings/profile/components/ProfileForm.tsx
src/app/pricing/components/SubscribeButton.tsx
```

3. If a file already imports from `@/lib/errors`, merge imports instead of adding a duplicate import line.

4. Do not change error messages or user-facing behavior.

### Required Edits: Sign-in Redirects

1. Import `ROUTES` from:

```ts
import { ROUTES } from '@/features/navigation/routes';
```

2. Replace hardcoded redirects in:

```text
src/app/dashboard/components/DashboardContent.tsx
src/app/settings/billing/components/BillingCards.tsx
src/app/settings/ai/components/ModelSelectionCard.tsx
src/app/plans/components/PlansContent.tsx
```

3. Example:

```ts
redirect(ROUTES.AUTH.SIGN_IN);
```

4. Leave test expectations and non-redirect UI links alone unless type/lint or existing conventions require the constant there too.

### Validation

```bash
pnpm check:full
```

If this fails because of import order, run:

```bash
pnpm check:lint:fix
```

Then inspect the diff before continuing.

## Step 5.0 — Tighten Inline-drain Typing And Defensive Handling

### Problem

Inline drains only signal completion. `Promise<unknown>` invites fake value plumbing. Some defensive catch blocks hide errors or make logs less reliable.

### Required Edits: Inline-drain Types

Change `Promise<unknown>` to `Promise<void>` in:

```text
src/features/jobs/regeneration-inline-drain.ts
src/features/plans/regeneration-orchestration/deps.ts
tests/unit/features/plans/regeneration-orchestration/request.spec.ts
```

Rules:

- `inlineInFlightDrains` should be `Set<Promise<void>>`.
- `tryRegisterInlineDrain` should accept `getDrainPromise: () => Promise<void>`.
- `registerInlineDrain` should accept `Promise<void>`.
- `drainSingleRegenerationJob` should return `Promise<void>` and `await` the queue drain result instead of returning it.
- Tests should register `Promise.resolve()` or `async () => undefined`, not `Promise.resolve(value)`.

### Required Edits: Narrow Defensive Catches

Work these one at a time and run nearby tests after each risky change.

1. `src/features/plans/session/stream-cleanup.ts`

- Inspect `safeMarkPlanFailed`.
- If it currently logs and swallows all persistence failures, narrow behavior so expected cleanup failures are logged with context but unexpected lifecycle failures can fail tests or return a visible failure path.
- Update `tests/unit/features/plans/session/stream-cleanup.spec.ts` to encode the intended behavior.

2. `src/app/api/v1/plans/stream/route.ts`

- Inspect the try/catch around `toPayloadLog(parsedBody)`.
- If `toPayloadLog` is pure and cannot throw for `unknown`, remove the catch.
- If it can throw, make `toPayloadLog` total instead by checking objects/arrays safely.

3. `src/features/ai/orchestrator.ts`

- Inspect the sync catch around `setupAbortAndTimeout`.
- Keep the catch only if it adds useful classification or cleanup.
- If it only rewraps impossible sync setup errors, remove it and let setup errors fail normally.

4. `src/components/billing/ManageSubscriptionButton.tsx`

- Inspect the outer catch around portal launch.
- Preserve user-facing error state.
- Remove nested or duplicate catch layers that cannot add information.

5. `src/components/shared/SiteHeader.tsx`

- Inspect tier fetch failure handling.
- Do not silently hide real data failures if the UI can show a neutral fallback plus log.
- Prefer a narrow fallback with logged context over a bare swallow.

### Validation

Run targeted tests for edited areas first:

```bash
pnpm test:unit -- tests/unit/features/plans/session/stream-cleanup.spec.ts
pnpm test:unit -- tests/unit/features/plans/regeneration-orchestration/request.spec.ts
```

Then run:

```bash
pnpm check:full
```

## Step 6.0 — Consolidate Canonical Types

### Problem

Duplicate type declarations make the repo easier to drift and harder to refactor. This step should remove duplicate owners without collapsing types that have different semantics.

### Required Owner Decisions

Use these owners unless the compiler proves a better owner:

- `SkillLevel`, `LearningStyle`: `src/shared/types/db.types.ts`.
- `FailureClassification`: `src/shared/types/failure-classification.types.ts`.
- `NodeEnv`: one owner in `src/lib/config/env/shared.ts`; re-export or import from there in `app.ts`.
- Plan read row contracts: prefer the query/read-projection boundary that owns the DB row shape; do not put raw query rows in UI component files.
- Plan-generation core input fields: prefer a shared schema/type source already used by validation, likely `src/shared/schemas/learning-plans.schemas.ts` plus exported inferred types if available.

### Required Edits

1. Plan read row contracts:

Inspect:

```text
src/lib/db/queries/plans.ts
src/features/plans/read-projection/summary-projection.ts
src/shared/types/db.types.ts
```

Pick one source for the row contract. Recommended:

- Keep raw DB query row types near `src/lib/db/queries/plans.ts` if they describe query output.
- Import those types into `summary-projection.ts` instead of redeclaring the same shape.
- Do not move presentation-only display types into DB query modules.

2. AI generation input:

Inspect:

```text
src/features/ai/prompts.ts
src/shared/types/ai-provider.types.ts
```

If `PromptParams` repeats `GenerationInput`, delete the duplicate and use `GenerationInput`.

3. Skill and learning style literals:

Replace hand-written unions with shared imports in:

```text
src/shared/types/ai-provider.types.ts
src/features/ai/prompts.ts
src/features/plans/lifecycle/types.ts
src/features/plans/session/plan-generation-session.ts
src/features/plans/session/session-events.ts
src/features/ai/plan-persistence-store.ts
src/features/ai/streaming/schema.ts
```

4. `FailureClassification` import path:

Repoint server modules from:

```ts
import type { FailureClassification } from '@/shared/types/client.types';
```

to:

```ts
import type { FailureClassification } from '@/shared/types/failure-classification.types';
```

Do this only for server/internal modules. Leave `client.types.ts` as a client DTO barrel if it still owns client response shapes.

5. `NodeEnv`:

Inspect:

```text
src/lib/config/env/shared.ts
src/lib/config/env/app.ts
```

Keep one exported type. Import it where needed rather than redeclaring.

6. Plan-generation core fields:

Inspect:

```text
src/features/plans/session/plan-generation-session.ts
src/features/plans/session/session-events.ts
src/features/plans/lifecycle/types.ts
src/shared/schemas/learning-plans.schemas.ts
```

Unify repeated field declarations for:

```text
topic
skillLevel
weeklyHours
learningStyle
startDate
deadlineDate
```

Use schema inference or a small shared type only if it avoids real duplication. Do not create an abstraction just to move six fields around if it makes the call sites less readable.

### Explicit Non-merges

Leave these separate unless a failing type check proves otherwise:

- `RequestContext` variants with different runtime meaning.
- `PlanStatus` client DTOs vs read-projection status derivation.
- `TierConfig` variants used for separate config surfaces.

### Validation

```bash
pnpm check:type
pnpm check:full
```

## Step 7.0 — Replace Weak Test Types

### Problem

Tests use casts that erase the contracts they are supposed to protect.

### Required Edits

1. Replace `{} as DbClient` with `makeDbClient()` in:

```text
tests/unit/features/billing/regeneration-quota-boundary.spec.ts
tests/unit/features/plans/regeneration-orchestration/request.spec.ts
tests/unit/features/plans/lifecycle/adapters/usage-recording-adapter.spec.ts
tests/unit/features/plans/lifecycle/adapters/plan-persistence-adapter.spec.ts
```

Look for an existing helper first:

```bash
rg -n "function makeDbClient|const makeDbClient|makeDbClient" tests src
```

If no reusable helper exists, create the smallest local helper in each spec or a shared test helper only if at least three specs need the same shape.

2. Replace `db: unknown` action mocks with `RequestScope` in:

```text
tests/unit/app/plans/actions.spec.ts
tests/unit/app/plans/modules/actions.spec.ts
```

Import:

```ts
import type { RequestScope } from '@/lib/api/request-boundary';
```

Then build a typed fake scope with the minimum fields the action under test reads.

3. Replace bespoke `AttemptsDbClient` cast in:

```text
tests/unit/ai/orchestrator-timeout.spec.ts
```

Use the same `makeDbClient()` pattern or import a shared helper if one exists.

4. Replace:

```text
globalThis as any
```

in:

```text
tests/e2e/plan-schedule-view.spec.tsx
```

Use a typed global augmentation or `vi.stubGlobal` if this is a Vitest/browser global.

5. Replace:

```text
'gold' as any
```

in:

```text
tests/integration/db/stripe.schema.spec.ts
```

Use a typed invalid value helper, `unknown as ValidType` only at the boundary being tested, or call the DB layer through an untyped SQL insert if the test is intentionally proving DB rejection.

6. In `src/features/ai/model-resolver.ts`, replace local object-param logger interface with the real logger method type from `src/lib/logging/logger.ts`.

### Validation

Run edited specs directly where possible:

```bash
pnpm test:unit -- tests/unit/features/billing/regeneration-quota-boundary.spec.ts
pnpm test:unit -- tests/unit/features/plans/regeneration-orchestration/request.spec.ts
pnpm test:unit -- tests/unit/features/plans/lifecycle/adapters/usage-recording-adapter.spec.ts
pnpm test:unit -- tests/unit/features/plans/lifecycle/adapters/plan-persistence-adapter.spec.ts
pnpm test:unit -- tests/unit/app/plans/actions.spec.ts
pnpm test:unit -- tests/unit/app/plans/modules/actions.spec.ts
pnpm test:unit -- tests/unit/ai/orchestrator-timeout.spec.ts
```

Run integration/e2e targeted commands only if those files are edited and the local environment supports them.

## Step 8.0 — Remove Redundant Typed-array Fallbacks

### Problem

Several files use `?? []` after values that should already be typed arrays. That hides contract drift and adds noise.

### Required Edits

Inspect and remove redundant fallbacks in:

```text
src/app/plans/[id]/components/PlanDetails.tsx
src/app/plans/[id]/components/PlanTimeline.tsx
src/app/plans/[id]/components/TimelineModuleCard.tsx
src/app/plans/[id]/modules/[moduleId]/components/ModuleDetail.tsx
src/app/plans/[id]/modules/[moduleId]/components/ModuleDetailClient.tsx
src/app/plans/[id]/modules/[moduleId]/components/LessonAccordionItem.tsx
src/features/plans/task-progress/visible-state.ts
src/features/plans/read-projection/detail-dto.ts
```

Rules:

- Remove `?? []` only when TypeScript says the left side is non-nullish.
- If the left side is genuinely nullable because external data is dirty, keep the fallback and add a short reason only if the reason is not obvious.
- Do not change sorting or rendering order.

### Validation

```bash
pnpm check:type
pnpm check:lint
```

## Step 9.0 — Deprecated And Legacy Docs

### Problem

Docs still frame older auth wrappers and error-boundary language as current defaults.

### Required Edits

1. Update auth/data docs:

```text
docs/architecture/auth-and-data-layer.md
src/lib/db/AGENTS.md
.github/copilot-instructions.md
```

Current documented default should be:

- Server components: `requestBoundary.component()`.
- Server actions: `requestBoundary.action()`.
- `withServerComponentContext()` and `withServerActionContext()` are compatibility shims below the boundary.
- `getEffectiveAuthUserId()` is only for redirect-only identity checks.

2. Update:

```text
docs/api/error-contract.md
```

Remove or rewrite stale language that says legacy handlers cannot use `withErrorBoundary(...)` if the current runtime no longer uses that framing.

3. Deprecated Stripe injection path:

Inspect:

```text
src/app/api/v1/stripe/create-checkout/route.ts
src/app/api/v1/stripe/create-portal/route.ts
src/app/api/v1/stripe/webhook/route.ts
src/features/billing/stripe-commerce/types.ts
src/features/billing/stripe-commerce/reconciliation.ts
src/features/billing/stripe-commerce/subscription-db-sync.ts
tests/integration/stripe/subscriptions.spec.ts
```

Decision rule:

- If `stripe?: Stripe` is only used by tests and can move behind `StripeGateway`, migrate it.
- If removing it would make tests much worse or require broad gateway work, keep it as a compatibility shim and document that scope with a JSDoc above the type, not member-level comments.

### Validation

```bash
pnpm check:full
```

## Step 10.0 — AI-slop And Comment Cleanup

### Problem

Some comments narrate obvious code or preserve placeholder language. Remove them last so real behavior changes are already validated.

### Required Edits

Review and trim:

```text
src/components/shared/nav/MobileHeader.tsx
src/app/about/components/TeamSection.tsx
src/app/plans/[id]/modules/[moduleId]/components/placeholder-content.ts
src/app/plans/[id]/modules/[moduleId]/components/LessonAccordionItem.tsx
tests/fixtures/plan-detail.ts
src/components/shared/ThemeToggle.tsx
src/features/ai/streaming.ts
src/features/ai/tasks.ts
src/features/ai/providers/router.ts
src/lib/errors.ts
src/lib/db/queries/learningPlans.ts
```

Rules:

- Delete comments that restate JSX structure, obvious conditionals, or placeholder/TODO banners with no tracked issue.
- Keep comments explaining security, RLS, service-role usage, abort-signal behavior, API compatibility, framework workarounds, or non-obvious ordering.
- Do not change runtime behavior in this step.

### Validation

```bash
pnpm check:lint
```

## Step 11.0 — Final Validation

Run final commands in this order:

```bash
pnpm check:circular
pnpm check:knip
pnpm check:full
pnpm test:changed
```

If a command fails:

1. Fix failures caused by this work.
2. Re-run the failed command.
3. If failure is environmental, record exact evidence in `todos.md` Review:
   - command
   - failure line
   - why it is environmental
   - narrower command that passed

Do not mark AC9 complete unless all four final commands pass or the user explicitly accepts the recorded environment blocker.

## Step 12.0 — Todo And Review Update

Update `.plans/006-codebase-cleanup-audit/todos.md`:

- Check each completed task.
- Add final before/after counts for circular and Knip.
- Add validation command results.
- Record deviations.
- Record any intentionally deferred item and why.

Use this review format:

```markdown
### Implementation Review

- Circular dependencies: 4 -> 0 via ...
- Knip: removed ...
- Validation:
  - `pnpm check:circular` PASS
  - `pnpm check:knip` PASS
  - `pnpm check:full` PASS
  - `pnpm test:changed` PASS
- Deviations:
  - None, or exact reason.
```

## Known Path Corrections

- `plan.md` is the correct plan path for this package. The old `todos.md` pointer to `plans.md` was stale.
- `src/features/plans/read-projection/plan-detail.ts` does not exist. Use `detail-aggregate.ts`, `detail-status.ts`, `detail-dto.ts`, and `summary-projection.ts`.
- `src/features/plans/plan-generation/types.ts` does not exist. Use `plan-generation-session.ts`, `session-events.ts`, `lifecycle/types.ts`, and `src/shared/schemas/learning-plans.schemas.ts`.
- `src/lib/db/sql-fragments/` does not exist. Bootstrap SQL currently lives in `tests/helpers/db/bootstrap.ts`, `tests/helpers/db/rls-bootstrap.ts`, `scripts/bootstrap-local-db.ts`, and `.github/workflows/ci-trunk.yml`.

## Junior Implementer Checklist

Before calling the work done, answer these with evidence:

- Did `src/features/billing/stripe-commerce/` stop importing from `@/features/billing/stripe-commerce`?
- Did `pnpm check:circular` return 0 cycles?
- Did every deleted Knip symbol have no current consumer?
- Did hardcoded server redirects use `ROUTES.AUTH.SIGN_IN`?
- Did local `isAbortError` helpers disappear where listed?
- Did `Promise<unknown>` become `Promise<void>` only for inline-drain completion paths?
- Did type consolidation preserve separate semantics where this plan says not to merge?
- Did docs now point developers to `requestBoundary.component()` and `requestBoundary.action()`?
- Did comment cleanup avoid security and framework rationale?
- Did `todos.md` reflect completed work and validation?
