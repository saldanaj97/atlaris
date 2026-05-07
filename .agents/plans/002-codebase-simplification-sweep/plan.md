# Codebase simplification sweep (findings archive)

Captured from parallel explore + consolidation (no implementations yet). Paths relative to repo root unless noted.

## Scope / gaps

- **Covered:** `src/app`, `src/features/plans`, `src/lib` + `src/shared` + `src/hooks`, `src/components`, `tests/` (integration + unit + playwright + security where noted).
- **Thin / missing:** Deep pass on non-plans `src/features/` (AI, scheduling, navigation) was partial in original run.
- **Not swept:** Root `scripts/`, `.github/`, other infra unless future pass adds them.

---

## Execution progress

- [x] Phase 0 — Baseline and guardrails captured (`check:type`, `test:unit:changed`, `test:changed`, `check:full`)
- [x] Slice 1.1 — Calendar date rule
- [x] Slice 1.2 — Attempt cap source
- [x] Slice 1.3 — Failure classification source
- [x] Slice 1.4 — Session and regeneration input wiring
- [x] Slice 1.5 — Plan session file decomposition
- [x] Slice 2.1 — API error failure taxonomy
- [x] Slice 2.2 — Route handler middleware naming
- [x] Slice 2.3 — Env boolean parsing docs/names
- [x] Slice 2.4 — Shared client type boundary
- [ ] Phase 3 — App and UI cleanup
- [ ] Phase 4 — Component primitive cleanup
- [ ] Phase 5 — Test suite cleanup
- [ ] Phase 6 — Edge boundary

### Completed slice notes

- Phase 0 baseline:
  - `git status --short`: planning package was untracked before implementation.
  - `pnpm check:type`: passed.
  - `pnpm test:unit:changed`: passed with no changed unit test files.
  - `pnpm test:changed`: passed with no changed unit/integration test files.
  - `pnpm check:full`: passed.
- Slices 1.1–1.5:
  - Added one plans-owned calendar date helper and routed session/regeneration dates through it.
  - Moved shared plan-generation field wiring to a small plans helper and moved session create-result/AppError mapping plus session input builders out of `plan-generation-session.ts`.
  - Replaced selector attempt-cap drift with `getGenerationAttemptCap()`.
  - Replaced manual failure-classification checks with the canonical shared classification set.
  - Moved direct plan-failure adapter construction behind `stream-cleanup` so the session boundary no longer instantiates the persistence adapter directly.
  - Validation so far: `pnpm check:type` and targeted unit tests passed.
- Slices 2.1–2.4:
  - `error-response` now uses the canonical shared failure-classification helper.
  - Renamed route-handler wrappers from `lib/api/middleware.ts` to `lib/api/route-wrappers.ts`; `src/proxy.ts` behavior was not touched.
  - Clarified permissive env boolean parsing and renamed the strict AI boolean parser.
  - Removed direct `lib/db/queries/types/*` imports from `shared/types/client.types.ts` and derived `PlanStatus` from `PLAN_STATUSES`.
  - Validation so far: `pnpm check:type` and targeted unit tests passed.

---

## Cleanup by zone

Each subsection is one zone. Rows sorted **High → Med → Low–Med → Low** within the zone.

### Plans (`src/features/plans`)

| Location | Opportunity | Sev |
|----------|-------------|-----|
| `session/plan-generation-session.ts` vs `regeneration-orchestration/process.ts` | Calendar/date validation differs (regex vs `Date` parse + ISO round-trip) → drift / inconsistent UX | High |
| `read-projection/selectors.ts` vs `detail-status.ts` / `summary-projection.ts` | `DEFAULT_ATTEMPT_CAP` hardcoded in selectors vs config-aware `getGenerationAttemptCap()` elsewhere | High |
| `session/plan-generation-session.ts` | Boundary + SSE + retries + helpers in one file (651 LOC at verification) | Med |
| `regeneration-orchestration/process.ts` | Job pipeline + validation + input builder + outcomes one module | Med |
| `read-projection/selectors.ts` vs `summary-projection.ts` | Parallel `derivePlanReadStatus` / summary branching shape | Med |
| `lifecycle/service.ts` | Nested reservation failure branches | Med |
| `session/plan-generation-session.ts` (unhandled path) | `new PlanPersistenceAdapter(dbClient)` vs factory lifecycle elsewhere | Med |
| `session/model-resolution.ts` vs `lifecycle/adapters/generation-adapter.ts` | Two resolution stacks (stream/query vs tier adapter) | Med |
| `read-projection/detail-status.ts` (`toStatusClassification`) | Manual allowlist may drift vs `FailureClassification` / DB | Med |
| `session/plan-generation-session.ts` (`throwCreatePlanResultError`) | Nested AppError mapping | Med |
| Session vs process “build generation input” | Parallel field wiring | Med |
| `ISO_DATE_PATTERN` | Duplicated in session + process | Low |
| `read-projection/service.ts` | Duplicate entrypoints to `listPlanSummaries` (commented) | Low |
| `read-projection/client.ts` | Pass-through re-export only | Low |
| `lifecycle/ports.ts` | Repeated section header comments | Low |
| `session/stream-emitters.ts` (disconnect) vs `regeneration-orchestration/process.ts` (discriminant handling) | Similar stream/worker outcome-maintenance patterns; inspect before extracting because this is not direct duplicate logic | Low |
| `session/stream-cleanup.ts` (`maybeExtractCause`) | Broad object branch | Low |

### Billing (`src/features/billing`)

| Location | Opportunity | Sev |
|----------|-------------|-----|
| `stripe-commerce/factory.ts` | Eager vs lazy boundary helpers are deliberate but indirect; document route-selection convention if billing route wiring is touched | Low |

### App (`src/app`)

| Location | Opportunity | Sev |
|----------|-------------|-----|
| `(app)/plans/[id]/modules/[moduleId]/components/LessonAccordionItem.tsx` | Monolith (~500+ LOC): config maps, placeholders, accordion in one file | High |
| `(app)/plans/[id]/components/PlanPendingState.tsx` | Monolith (~500 LOC) | High |
| `(app)/settings/profile/components/ProfileForm.tsx` | Monolith (~490+ LOC) | High |
| Error UX (plans list vs `plans/error.tsx`) | Plans list “Your Plans” vs error “Learning Plans”; dashboard title/template duplicated vs errors | Med |
| Error boundaries (plans, dashboard, settings, modules) | Mixed patterns: `PlanRouteErrorContent` full-screen vs `SettingsErrorContent` vs inline alerts | Med |
| `(app)/layout.tsx` | `force-dynamic` entire app shell | Med |
| `(app)/plans/[id]/page.tsx` | `generateMetadata` ignores `params` → all IDs same SEO | Med |
| `(marketing)/pricing/page.tsx` | Imports `ManageSubscriptionButton` from app settings — marketing coupled to billing impl | Med |
| Route strings (many files under `src/app`) | Hardcoded `"/plans"`, `"/plans/new"` parallel to `ROUTES` | Med |
| `(app)/plans/.../TaskStatusButton.tsx` vs `(app)/plans/[id]/components/UpdateTaskStatusButton.tsx` | Duplicate toggle logic, different chrome only | Med |
| `PlanRouteErrorContent` vs `PlanDetailPageError` vs `ModuleDetailPageError` | Overlapping error copy / recovery patterns | Med |
| `(app)/settings/` | Only billing + ai have `error.tsx`; profile/integrations/notifications bubble | Med |
| `(marketing)/` sections (e.g. `HowItWorksSection`) + `(marketing)/pricing/page.tsx` | Large route/section files (overlap with oversized components above) | Med |
| `(marketing)/landing/components/index.ts`, barrels, `LandingAnalyticsWrapper.tsx` | Barrels obscure graph; Hero vs FinalCta wrappers nearly identical | Low |
| `(app)/plans/new/components/CreatePlanPageClient.tsx`, `(app)/plans/layout.tsx` | Thin files / shallow layout hops | Low |
| `(app)/plans/[id]/page.tsx` | `if (!id)` likely dead for `[id]` | Low |
| `(app)/plans/[id]/modules/[moduleId]/page.tsx` | Asymmetric guards (`moduleId` checked, `planId` asymmetry noted) | Low |
| Various `error.tsx` + `Error.tsx` | Some comments repeat TypeScript; remove only comments that add no route/error behavior context | Low |
| `(app)/plans/error.tsx` + `(app)/dashboard/error.tsx` | Same Tailwind alert class string duplicated | Low |
| List/detail/page modules | Repeated Suspense/skeleton route-shell scaffolding; keep if convention is useful, extract only if it reduces local route noise | Low |
| Dashboard / detail / billing / plans client components | `${ROUTES.AUTH.SIGN_IN}?redirect_url=…` repeated | Low |
| `(app)/analytics/` | No segment `error.tsx` vs siblings | Low |

### Components (`src/components`)

| Location | Opportunity | Sev |
|----------|-------------|-----|
| `shared/nav/DesktopHeader.tsx` + `MobileHeader.tsx` | Duplicated glass / pricing conditional classes | Med |
| UI kit broadly (`components/ui/*`) | No `forwardRef` — inputs/buttons/card may not match ref-forwarding expectations | Med |
| `shared/SiteHeader.tsx` | Both headers mount; each `usePathname()` — duplicate work + duplicated chrome | Low–Med |
| `shared/SiteFooter.tsx` | Repeated Link class strings | Low |
| `shared/nav/DesktopNavigation.tsx` vs `MobileNavigation.tsx` | Desktop lacks `aria-current`; mobile has it | Low |
| `shared/ComingSoonAlert.tsx`; `card` / `empty` titles | Heading semantics can be weak by default; small cleanup target when touching shared empty/alert primitives | Low |

### Lib (`src/lib`)

| Location | Opportunity | Sev |
|----------|-------------|-----|
| `lib/api/error-response.ts` vs shared failure types (`@/shared/types/...`) | Duplicate `FAILURE_CLASSIFICATIONS` vs `FAILURE_CLASSIFICATION_SET` → taxonomy drift | Med |
| `lib/api/middleware.ts` | Name says “middleware” but wraps route handlers — clashes with edge `proxy.ts` mentally | Med |
| `lib/config/env/shared.ts` (`toBoolean`) vs `lib/config/env/ai.ts` (`parseOptionalBooleanFlag`) | Overlapping bool parsing with different contracts (permissive fallback vs strict validation); clarify names/docs before any consolidation | Med |

### Shared (`src/shared`)

| Location | Opportunity | Sev |
|----------|-------------|-----|
| `shared/types/client.types.ts` importing `lib/db/queries/types` | “Shared” depends on DB query types — boundary / mental model mismatch | Med |
| `shared/types/client.ts` vs `client.types.ts` | `PLAN_STATUSES` literals vs `PlanStatus` union — derive one from other | Low |

### Edge (`src/proxy.ts`)

| Location | Opportunity | Sev |
|----------|-------------|-----|
| `proxy.ts` | Thick single file (auth, CSP, correlation id, maintenance, dev bypass) — split-only-if-refactoring candidate | Low–Med |

### Tests (`tests/`)

| Location | Opportunity | Sev |
|----------|-------------|-----|
| `integration/features/plans/session/respond-create-stream.spec.ts` + `respond-retry-stream.spec.ts` | Duplicated fixtures, fake lifecycle builders, streaming helpers | High |
| `unit/features/plans/lifecycle/lifecycle-consolidation.spec.ts` vs `service.spec.ts` | Overlapping `createMockPorts` / port graphs | High |
| `security/rls.policies.spec.ts` | ~1165 LOC single matrix | High |
| `unit/ai/providers/openrouter.spec.ts` | ~945 LOC + giant inline fixtures | High |
| `integration/api/*.spec.ts` (currently 6+ files) | Repeated `vi.mock('@/lib/auth/server')` pattern | Med |
| `integration/api/plans.regenerate.spec.ts` | Heavy route/orchestration mock surface; re-check against `plans.regenerate.boundary.spec.ts` before moving coverage | Med |
| Session specs vs project type | Create stream is mostly mocks inside integration; retry is hybrid DB + mocks — naming/scope mismatch | Med |
| Large specs (`unit/mappers/planQueries.spec.ts`, `lifecycle/process-generation.spec.ts`, `hooks/usePlanStatus.spec.tsx`, Stripe route specs, etc.) | Split / segment candidates; re-verify named files before planning a slice | Med |
| `playwright/smoke/auth.launch-blockers.spec.ts` | `test.setTimeout(180_000)` masks slowness | Med |
| `unit/components/ManageSubscriptionButton.spec.tsx` | `setTimeout` + `waitFor` ordering sensitivity | Med |
| `integration/stripe/usage.spec.ts` | Fixed `setTimeout(10)` | Low |
| Stripe tests | Repeated magic `timeout: 10_000` on waits | Low |

---

## Highest leverage clusters (cross-zone)

1. **Unify date + attempt-cap rules** — Plans (+ App stream entrypoints indirectly).
2. **Split mega UI** — App components + overlapping marketing sections.
3. **Deduplicate tests** — Tests zone (+ Plans behavior under test).
4. **Single sources** — Lib (errors/classifications), App (ROUTES/error UI), Plans (read status).

---

## Follow-up passes (optional)

- Deep sweep: `src/features/ai`, `scheduling`, `navigation` (non-plans).
- `scripts/`, `.github/`, tooling configs.
- `src/app/api/**/*` duplicate handler patterns.
