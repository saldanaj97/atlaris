# Issue #308 Intake Summary

**GitHub Issue:** [saldanaj97/atlaris#308](https://github.com/saldanaj97/atlaris/issues/308)  
**Title:** RFC: consolidate plan stream model resolution policy  
**Status:** Planning  
**Issue Labels:** `enhancement`, `refactor`

## Problem Statement

The plan-stream model resolution policy (the logic that decides which AI model to use for plan generation) exists in **two separate, near-identical copies**:

1. `src/features/plans/session/model-resolution.ts` — owned by session boundary
2. `src/app/api/v1/plans/stream/model-resolution.ts` — owned by route tree

Both implement the same 4-step fallback sequence:
- Extract `?model=` query param
- Validate requested model against subscription tier
- Log and surface validation errors
- Fall back to saved preference → tier default

**The Duplication Risk:** The files are not just conceptually equivalent; they contain cosmetic textual drift in a core policy branch. This consolidation is a **structural trust / single-source-of-truth cleanup, not a bug fix**:

- **Final-branch predicate differs (behaviorally equivalent today):** Session copy uses `validationError !== undefined` to decide `query_override_invalid` vs `tier_default`; route copy uses `suppliedModel !== undefined`. Tracing control flow, these are equivalent on every input: the `if (suppliedModel !== undefined)` block either returns early with `query_override` or sets `validationError`, so at the final return `suppliedModel !== undefined ⇔ validationError !== undefined`. There is **no observable behavior difference today**, but two predicates expressing the same rule invite future drift and make the route copy less self-documenting.
- **Type structuring:** Session copy defines a named local `StreamModelValidationError` type; route copy inlines `{ reason: string }`.
- **Documentation:** Session copy includes a clarifying comment on the final-branch tag; route copy omits it.
- **Type export:** Neither copy currently `export`s `StreamModelResolution`. Callers rely on structural typing of the return value. Consolidation should explicitly export the result type so tests and future callers can bind to a stable, named contract.

**The Trust Problem:** This split creates a test/runtime mismatch:

- **Production code** (`plan-generation-session.ts`) imports **from session/**
- **Unit tests** (`tests/unit/api/model-validation.spec.ts`) import **from route/**

This means CI can validate one implementation while production runs another. A future bug fix or behavior change landing in only one file will silently split tested behavior from runtime behavior.

## Acceptance Criteria

- [ ] Create one canonical `src/features/plans/session/model-resolution.ts` module that owns model resolution policy as a single source of truth.
- [ ] The canonical module explicitly `export`s the stable public surface:
      the `resolveStreamModelResolution()` function, the `StreamModelResolution`
      result type, and the `StreamModelValidationError` metadata type.
- [ ] All production code imports from the canonical session module (verify: `plan-generation-session.ts`).
- [ ] All tests import from the canonical session module.
- [ ] **Delete** the route-tree copy at `src/app/api/v1/plans/stream/model-resolution.ts` outright. No re-export seam is created, because `src/app/api/v1/plans/stream/route.ts` does not import the local helper and only the test file currently references it.
- [ ] Test coverage is consolidated: the stream-resolution assertions move to a session-owned spec (`tests/unit/features/plans/session/model-resolution.spec.ts`); the remaining five unrelated describe blocks in `tests/unit/api/model-validation.spec.ts` (query-param parsing, `isValidModelId` logic, tier-gated validation, preferences schema, `isValidModelId` integration) stay put.
- [ ] Canonical semantics match the session copy (the behaviorally-equivalent `validationError !== undefined` predicate is preserved, with its clarifying comment).
- [ ] Invalid-override logging behavior is exercised against the canonical helper via `vi.spyOn(logger, 'warn')` (no DI widening; the helper keeps its current single-argument shape).
- [ ] The pre-existing follow-up note in `.plans/003-deepen-session-boundary/todos.md` (lines ~79–83) is cleared/removed to reflect that this cleanup has shipped.
- [ ] Post-consolidation sanity: `rg 'plans/stream/model-resolution'` returns no hits in `src/`, `tests/`, or `docs/` other than in this plan's own artifacts.
- [ ] All tests pass: `pnpm test:changed` and `pnpm check:full`.

## Scope & Non-Goals

### In Scope
- Consolidate the duplicate implementations into the session boundary module
- Update all imports (runtime and tests) to use the canonical module
- Delete the route-tree copy
- Ensure the session copy's behavior becomes the explicit, tested contract
- Verify test coverage remains equivalent or improves

### Out of Scope
- Changing the public contract of `resolveStreamModelResolution()` beyond stabilizing it
- Refactoring the internal fallback logic itself (only consolidation, not redesign)
- Moving the canonical module to a different location (session boundary is the correct home)
- Removing or redesigning the validation error metadata

## Likely Plan Artifact Path

`.plans/308-consolidate-plan-stream-model-resolution/`

Files to create:
- `todos.md` — checkable task list
- `plan.md` — detailed implementation phases and verification steps

## Prerequisite Context & Architectural Constraints

### Key Architecture Facts (from `docs/agent-context/learnings.md`)

1. **Plan Session Boundary Ownership:** The session feature boundary owns policy that applies to plan lifecycle orchestration. Model resolution is a session startup policy, so it belongs under `src/features/plans/session/`, not under the route tree at `src/app/api/v1/`.

2. **In-Process Boundary, No Port/Adapter:** Model resolution involves no external I/O. It is a pure in-process decision boundary. No port/adapter indirection is required; the architectural improvement is consolidation and alignment of callers.

3. **Single Source of Truth:** When a policy decision exists in multiple copies, the codebase becomes "shallower and harder to trust" (issue quote). Senior codebases prefer one canonical location and re-exports where needed, not duplicates.

4. **Test/Runtime Parity:** Test and production must import the same module. This prevents CI from validating one implementation while production runs another.

### Existing References

- **Session boundary home:** `src/features/plans/session/` (lines 1-75 in model-resolution.ts)
- **Route tree location (to delete):** `src/app/api/v1/plans/stream/model-resolution.ts` (lines 1-69)
- **Session orchestration consumer:** `src/features/plans/session/plan-generation-session.ts` (line ~36, imports from ./model-resolution)
- **Test consumer:** `tests/unit/api/model-validation.spec.ts` (line 2, imports from @/app/api/v1/plans/stream/model-resolution)
- **Shared validators (no changes):** `src/features/ai/model-resolver.ts` and `src/features/ai/model-preferences.ts`

### Historical Context

- Issue #306 (completed) consolidated Stripe commerce boundary behind one module — similar pattern applies here
- Related PRs #207, #276, #278 show recent refactors around plan lifecycle and billing domain separation

## Implementation Recommendations

1. **Keep the canonical module small:** It should only observe the resolved model, source tag, and validation metadata. Do not expose step-by-step decision process internals.

2. **Stable Public API:** The function signature should remain stable; do not add new params or change the return shape unless explicitly needed. Export additional types only if an actual caller or test needs them.

3. **Document the re-export strategy:** If route-local code must import from a route path for some reason (e.g., deep legacy coupling), make it a re-export only with a comment explaining why.

4. **Test consolidation:** Prefer the minimal path: retarget the existing `tests/unit/api/model-validation.spec.ts` import to the session helper and trim route-layer wording that no longer fits. Splitting the mixed-purpose spec into new session-owned files is optional follow-up work, not required for this issue.

## Related Issues & Patterns

- **Issue #306** (Stripe Commerce Boundary): Similar consolidation of duplicated policy across two module locations. See `.plans/306-issue-306/` for phase-based approach.
- **Learning from `.plans/306-issue-306/`:** Shows how to structure boundary refactors with clear phases and verification steps.

---

**Next Steps for Implementation:**
1. Create `.plans/308-consolidate-plan-stream-model-resolution/todos.md` with checklist
2. Create detailed `.plans/308-consolidate-plan-stream-model-resolution/plan.md` with phases and verification
3. User review of plan before implementation begins
