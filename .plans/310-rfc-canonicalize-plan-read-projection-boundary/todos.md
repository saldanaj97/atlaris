# 310 — RFC: canonicalize plan read projection boundary

Issue: [https://github.com/saldanaj97/atlaris/issues/310](https://github.com/saldanaj97/atlaris/issues/310)
Plan: `./plan.md`

## Acceptance Criteria

- AC1 — A single plan-domain read boundary owns shared list/detail/status/
attempt projection semantics for app and API consumers.
- AC2 — Shared consumers stop importing a mix of `read-service`,
`read-models`, and `status/read-status` to answer one read concern.
- AC3 — Summary/detail/status/attempt outputs keep their current observable
behavior unless a documented compatibility adjustment is explicitly
approved during implementation.
- AC4 — Summary display-status semantics, including the paused/staleness
overlay, are defined once inside the boundary rather than in app helper
files.
- AC5 — Query integration remains in `src/lib/db/queries/plans.ts` and
`src/lib/db/queries/modules.ts` (module detail stays separate per
Step 0.0); the boundary does not absorb raw Drizzle query construction.
- AC6 — Boundary-level tests cover observable read outputs; low-level
helper tests were updated to import the boundary; slim/delete of redundant
tests deferred until a follow-up if still duplicated.
- AC7 — Module-detail scope explicitly resolved pre-implementation:
stays outside v1. See `plan.md` Step 0.0 item 2 and Resolved Decisions.
- AC8 — `pnpm check:full` + `pnpm test:changed` (unit + integration) passed with
Docker/Testcontainers available (2026-04-23).

## Tasks (aligned with plan.md Steps)

### Step 0.0 — Confirm Scope

- Load live issue `#310` and verify the current issue body/title against the
repo.
- Verify the current implementation surface across
`src/features/plans/read-service/`,
`src/features/plans/read-models/`,
`src/features/plans/status/read-status.ts`,
`src/lib/db/queries/plans.ts`,
`src/app/plans/components/plan-utils.ts`, and
`src/app/dashboard/components/activity-utils.ts`.
- **Decision frozen — module detail stays outside v1 boundary.**
`getModuleDetail` does not consume plan-read status/completion today.
Promote to v2 only when module detail needs canonical plan-read truth or
starts mixing with boundary summary/detail on the same surface. See
`plan.md` Step 0.0 item 2.
- **Decision frozen — one-shot migration, no long-lived compat barrel.**
All consumers in Step 4.0 move to the new package in the same PR; any
temporary re-export is removed before review. See `plan.md` Step 0.0
item 3.

### Step 1.0 — Create Boundary Package

- Create `src/features/plans/read-projection/` with a narrow public barrel.
- Add the initial orchestration entrypoints described in `plan.md`
"Proposed Public Surface".
- Keep DB row bundle types internal to the package or sourced from
`src/lib/db/types.ts` (`PlanDbClient`); do not leak Drizzle query-builder types.
- Delete `src/features/plans/read-service/` once consumer migration in
Step 4.0 completes (one-shot migration, no long-lived barrel per
Step 0.0).

### Step 2.0 — Move Projection Semantics Behind The Boundary

- Re-home detail projection logic behind the new boundary:
`buildLearningPlanDetail`, `toClientPlanDetail`,
`buildPlanDetailStatusSnapshot`.
- Re-home attempt projection logic behind the new boundary:
`toClientGenerationAttempts` and attempt normalization rules.
- Re-home summary/lightweight summary projection logic behind the new
boundary:
`buildPlanSummaries`, `buildLightweightPlanSummaries`.
- Keep one canonical generation-read status derivation in the same package
as the projections that consume it (`read-status.ts`).
- Make old helper modules private, local, or deleted once no external
consumer needs them (removed `read-models/`, `status/read-status.ts`).

### Step 3.0 — Canonicalize App-Level Status Consumers

- Add a boundary-owned summary display-status selector that accepts
`summary` plus `referenceDate`.
- Move paused/staleness logic out of
`src/app/plans/components/plan-utils.ts` and into the boundary selector.
- Update `src/app/dashboard/components/activity-utils.ts` to use the same
selector for ranking/filtering decisions.
- Keep dashboard copy/date formatting in the app layer; move only shared
status truth.

### Step 4.0 — Migrate Consumers To One Entry Point

- Update API consumers:
`src/app/api/v1/plans/route.ts`,
`src/app/api/v1/plans/[planId]/route.ts`,
`src/app/api/v1/plans/[planId]/status/route.ts`,
`src/app/api/v1/plans/[planId]/attempts/route.ts`.
- Update app/page consumers:
`src/app/plans/components/PlansContent.tsx`,
`src/app/dashboard/components/DashboardContent.tsx`,
`src/app/plans/[id]/actions.ts`.
- Update app helper consumers:
`src/app/plans/components/plan-utils.ts`,
`src/app/dashboard/components/activity-utils.ts`.
- Remove mixed-layer imports so one read concern no longer requires multiple
plan read modules.

### Step 5.0 — Boundary Tests And Query Coverage

- Add boundary unit coverage for summary, lightweight summary, detail,
status snapshot, attempt history, and display-status derivation
(see `read-projection-display-status.spec.ts`; existing mapper/summary
tests repointed at `read-projection/*`).
- Add display-status selector matrix covering active, generating,
paused<30d, paused≥30d, and failed (canonical) cases in
`read-projection-display-status.spec.ts`.
- Add API response-shape contract tests for the four plan routes
(`GET /api/v1/plans`, `GET /api/v1/plans/:planId`,
`GET /api/v1/plans/:planId/status`,
`GET /api/v1/plans/:planId/attempts`) under
`tests/integration/api/plans/plans-read.contract.spec.ts` (Zod-locked
shapes; run with Testcontainers).
- Keep `tests/integration/db/plans.queries.spec.ts` focused on ownership,
pagination, and query behavior (updated imports to `read-projection`).
- Keep `tests/integration/db/modules.queries.spec.ts` (module detail stays
outside the new boundary per Step 0.0).
- Slim or delete helper-first tests only after boundary-level replacements
are in place (legacy unit tests now target `read-projection/` paths; delete
optional if redundant in a follow-up).

### Step 6.0 — Validation Steps

- Run focused boundary/unit coverage for the new package.
- Run query integration coverage for plans — `plans.queries.spec.ts` +
`plans-read.contract.spec.ts` with Testcontainers (2026-04-23).
- Run `pnpm test:changed` — full green with Docker.
- Run `pnpm check:full`.

### Step 7.0 — Issue Verification & Closure

- Walk each acceptance criterion with direct file/test evidence (evidence
table below).
- Fill the review evidence table below with concrete paths and commands.
- Comment or otherwise capture the evidence on issue `#310` (posted:
[https://github.com/saldanaj97/atlaris/issues/310#issuecomment-4307424609](https://github.com/saldanaj97/atlaris/issues/310#issuecomment-4307424609)).
- Close issue `#310` when the implementing PR is merged to the default branch
(keeps issue open for tracking until then).

## Review

### Deviations / notes

- Plan package created on 2026-04-23 from live issue `#310` plus current source
inspection.
- Repo convention uses `plan.md`; this package intentionally follows that
convention instead of inventing `plans.md`.
- 2026-04-23 audit: removed a phantom reference to `.plans/310-biome-hooks-ci/`
(folder does not exist).
- 2026-04-23 audit: froze module-detail scope (out of v1) and compatibility-
barrel policy (one-shot migration, no long-lived barrel) in Step 0.0.
- 2026-04-23 audit: added API response-shape contract tests to Step 5.0 so AC3
is enforced mechanically rather than by review.
- 2026-04-23: `pnpm test:changed` integration leg initially failed without Docker;
re-ran with Docker — full green.
- 2026-04-24: Step 7.0 — posted verification comment on
[issue #310](https://github.com/saldanaj97/atlaris/issues/310#issuecomment-4307424609).
Issue remains **open** until the implementing PR merges; close then.

### Evidence table (Step 7.0)


| Acceptance Criterion | Evidence                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| AC1                  | `src/features/plans/read-projection/` — `service.ts` orchestration + `projectors.ts` + `index.ts` public API                    |
| AC2                  | `rg read-service|read-models|status/read-status` → no TS sources; app/API use `@/features/plans/read-projection`                |
| AC3                  | `tests/integration/api/plans/plans-read.contract.spec.ts` (Zod); existing API behavior preserved by moving same projection code |
| AC4                  | `selectors.ts` `derivePlanSummaryDisplayStatus`; `plan-utils` delegates; `activity-utils` uses same selector                    |
| AC5                  | `getPlan*Rows` still in `src/lib/db/queries/plans.ts`; `read-projection` calls those functions only                             |
| AC6                  | `read-projection-display-status.spec.ts` + repointed `tests/unit/`** to `read-projection/*`                                     |
| AC7                  | Module detail unchanged; `plan.md` Step 0.0 item 2                                                                              |
| AC8                  | `pnpm check:full` + `pnpm test:changed` (2026-04-23, Docker on)                                                                 |


### Security Review Checklist (plan.md)

- Ownership checks still happen before plan detail/status/attempt data is
exposed (unchanged query layer; same `getPlan*` + null → 404 paths).
- No new service-role read path is introduced where request-scoped DB access
is required (routes still use `getDb()`; no new service-role reads).
- No response shape accidentally leaks internal-only fields during
projection consolidation (code move only; contract spec guards shapes).
- Status normalization still handles unknown classifications/statuses
defensively (`detail-dto.ts` / `detail-status.ts` moved verbatim).
- `src/features/plans/read-service/` is fully deleted before PR review; no
long-lived compatibility barrel ships (enforced by Step 0.0 item 3).

### Validation excerpts

- `pnpm check:full` — pass (2026-04-23).
- `pnpm test:changed` — pass with Docker (unit + integration changed).
- `pnpm exec tsx scripts/tests/run.ts integration tests/integration/api/plans/plans-read.contract.spec.ts tests/integration/db/plans.queries.spec.ts` — pass.

### Follow-ups

- v2 candidate — revisit module-detail inclusion when `getModuleDetail`
needs plan-read status/completion truth or starts mixing with boundary
projections on the same surface.
- 2026-04-24 follow-up planning decision: defer. Current `getModuleDetail`
still lives in `src/lib/db/queries/modules.ts`, is called by the module page
server action and module query tests, and does not consume
`@/features/plans/read-projection`. See
`../313-rfc-consolidate-plan-task-progress-boundary/follow-ups-310-313.md`.
