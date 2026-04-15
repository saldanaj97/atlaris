# Slice D — Generation lifecycle consolidation (backend) execution plan

## Problem

Slice D still has generation lifecycle ownership spread across app routes, feature session helpers, lifecycle service internals, AI orchestration, and broad DB query modules. The goal is to consolidate that backend lifecycle without changing SSE contracts, retry semantics, queue behavior, attempt persistence behavior, or regeneration-worker compatibility.

## Approach

Work in the commit order defined by `.plans/prelim-refactor-findings/slice-d-plan.md`:

1. Lock behavior with targeted integration and unit coverage first.
2. Introduce one feature-owned generation session authority and split emission vs cleanup concerns under `src/features/plans/session/`.
3. Thin the create/retry routes to HTTP-only adapters and remove route-layer compatibility leftovers.
4. Narrow `PlanLifecycleService` and the AI orchestrator by extracting internal strategy/helper boundaries while preserving public APIs.
5. Split jobs and attempts persistence modules by responsibility, then finish with the targeted validation set and repo baselines.

## Execution notes

- Treat `src/features/plans/session/stream-session.ts` as the primary donor for session/emission/cleanup extraction.
- Treat `src/app/api/v1/plans/stream/helpers.ts` as transitional leftover compatibility code; delete or reduce it only after parity tests prove no remaining callers.
- Reuse Slice A normalization primitives where fallback wrappers can be narrowed or removed.
- Do not add retry-route model override behavior.
- Keep `processGenerationAttempt()` as the single execution authority for stream, retry, and regeneration worker flows.

## Validation plan

1. Targeted parity and regression commands from the parent Slice D plan.
2. `pnpm check:type`
3. `pnpm check:lint`
4. `pnpm test:changed`
5. `pnpm check:full`

## Tracking

The SQL `todos` / `todo_deps` tables are the execution source of truth for dispatch order. This file mirrors the workstream for humans; update `.plans/003-slice-d-generation-lifecycle-backend/todos.md` at major milestones and after final validation.
