# Plan: Consolidate plan stream model resolution policy (issue #308)

Source: GitHub issue [#308](https://github.com/saldanaj97/atlaris/issues/308).

## Goal

Remove the duplicate plan-stream model-resolution implementation so one
session-owned policy module defines stream model selection for both runtime and
tests.

This change should make the code easier to trust without broadening scope:

- keep the canonical policy under `src/features/plans/session/`
- align runtime and tests on that one implementation
- preserve the existing session-copy semantics and logging behavior
- delete the route-tree duplicate outright

**Framing:** this is a **structural / single-source-of-truth cleanup, not a
bug fix**. The two copies' final-branch predicates
(`validationError !== undefined` vs `suppliedModel !== undefined`) are
behaviorally equivalent on every input today. Implementation should preserve
the session copy's predicate and its clarifying comment, and must **not** ship
any "behavior fix" reworded around a phantom divergence.

## Current state summary

- Runtime session orchestration already imports the session-owned helper from
  `src/features/plans/session/model-resolution.ts` via
  `src/features/plans/session/plan-generation-session.ts:22`.
- A second near-copy exists at
  `src/app/api/v1/plans/stream/model-resolution.ts`.
- The route handler `src/app/api/v1/plans/stream/route.ts` does **not** import
  the local helper; only the unit test
  `tests/unit/api/model-validation.spec.ts:2` does. There is therefore **no
  production caller** requiring a compatibility re-export.
- The two helpers differ in their final fallback condition:
  `validationError !== undefined` versus `suppliedModel !== undefined`. Control
  flow proves they are equivalent today — the route copy's predicate is just
  less self-documenting.
- Neither copy currently `export`s the `StreamModelResolution` result type;
  consolidation will add that export so tests and future callers can bind to a
  named contract.
- This duplication was already flagged as future cleanup in
  `.plans/003-deepen-session-boundary/todos.md:79-83`; closing #308 clears that
  note.

## Expected files touched

### Canonical implementation (modify)

- `src/features/plans/session/model-resolution.ts` — add `export` to
  `StreamModelResolution` and `StreamModelValidationError` types; keep runtime
  logic and comment unchanged.

### Duplicate (delete)

- `src/app/api/v1/plans/stream/model-resolution.ts` — delete outright.

### Runtime caller verification (verify only)

- `src/features/plans/session/plan-generation-session.ts` — already imports
  from `./model-resolution`; no edit expected.
- `src/app/api/v1/plans/stream/route.ts` — does not import the helper; no edit
  expected.

### Tests

- `tests/unit/api/model-validation.spec.ts` — remove the single
  `describe('Stream model resolution helper', ...)` block (~lines 76–135) and
  the now-unused `resolveStreamModelResolution` import. Leave the other five
  describe blocks (query-param parsing, `isValidModelId` logic,
  `resolveModelForTier` tier-gating, preferences schema, `isValidModelId`
  integration) untouched. Retarget the top-level describe name if the file
  stops making helper assertions.
- `tests/unit/features/plans/session/model-resolution.spec.ts` — **create
  new**. Contains the helper assertions plus logger-warn coverage, imported
  from `@/features/plans/session/model-resolution`.

### Follow-up breadcrumb (clean up)

- `.plans/003-deepen-session-boundary/todos.md` — remove or tick the
  "duplicate `model-resolution.ts` ... flagged as a future cleanup" note
  (~lines 79–83).

## Design decisions (committed)

1. **Delete the route file outright.** No re-export seam. Zero production
   callers; zero reason to keep a compatibility path.
2. **Export the result types.** Add `export type StreamModelResolution` and
   `export type StreamModelValidationError` to the canonical file so tests can
   bind to named types.
3. **Logger assertion via `vi.spyOn`.** Do **not** widen the helper's API with
   an optional `logger` DI param. Tests `vi.spyOn(logger, 'warn')` on the
   imported singleton from `@/lib/logging/logger` and restore the spy per
   test.
4. **Move only the helper describe block** out of
   `tests/unit/api/model-validation.spec.ts`. The other five describe blocks
   test unrelated concerns and stay in their current file.
5. **Preserve the session copy's final-branch predicate verbatim**
   (`validationError !== undefined`) with its clarifying comment. No
   rewordings.

## Implementation steps

### Phase 0 — Confirm the canonical contract

1. Re-read issue #308 and this plan's "Design decisions". Confirm:
   - `resolveStreamModelResolution()` signature stays as-is.
   - `StreamModelResolution` and `StreamModelValidationError` become exported.
   - Delete the route copy outright.
   - Use `vi.spyOn(logger, 'warn')` for logger coverage.
2. Sanity check that no other caller exists:

   ```bash
   rg "plans/stream/model-resolution" src tests docs
   rg "resolveStreamModelResolution" src tests
   ```

   Expected producers: the two `model-resolution.ts` files + one consumer
   (`plan-generation-session.ts`) + one test
   (`tests/unit/api/model-validation.spec.ts`).

### Phase 1 — Write canonical tests first (TDD-style)

1. Create `tests/unit/features/plans/session/model-resolution.spec.ts` with
   imports from `@/features/plans/session/model-resolution`. Mirror the
   existing helper assertions in `tests/unit/api/model-validation.spec.ts`:
   - valid query override → `query_override` with `modelOverride` set
   - invalid query override + saved preference → `saved_preference` and
     validation metadata is preserved
   - invalid query override + no saved preference →
     `query_override_invalid`
   - no query override, no saved preference → `tier_default`
   - no query override, saved preference present → `saved_preference`
2. Add one new assertion that the existing spec lacks: invalid override
   emits a `logger.warn` call with `{ tier, suppliedModel, reason }`. Use
   `vi.spyOn(logger, 'warn')` and restore per test.
3. Run the new spec alone; confirm it passes against the **current** session
   module before touching anything else.

### Phase 2 — Export types, delete the duplicate, retarget callers

1. Add `export` to both type declarations in
   `src/features/plans/session/model-resolution.ts`:

   ```ts
   export type StreamModelResolution = { ... };
   export type StreamModelValidationError = { reason: string };
   ```

   Keep the final-branch predicate (`validationError !== undefined`) and its
   comment unchanged.
2. Delete `src/app/api/v1/plans/stream/model-resolution.ts`.
3. Edit `tests/unit/api/model-validation.spec.ts`:
   - Remove the `import { resolveStreamModelResolution } from '@/app/api/v1/plans/stream/model-resolution'` line.
   - Remove the entire `describe('Stream model resolution helper', ...)`
     block (~lines 76–135).
   - Keep the remaining five describe blocks untouched.
   - If the top-level `describe('Model Validation (API Layer)', ...)` name
     now misrepresents the file, rename to something like
     `Model validation helpers (preferences + tier gating)`.

### Phase 3 — Validate

1. Run the new spec:

   ```bash
   pnpm vitest run tests/unit/features/plans/session/model-resolution.spec.ts
   ```

2. Run the trimmed legacy spec:

   ```bash
   pnpm vitest run tests/unit/api/model-validation.spec.ts
   ```

3. Run any affected plans-stream route tests:

   ```bash
   pnpm vitest run tests/unit/features/plans/session
   ```

4. Post-consolidation grep sanity (expected: zero hits in `src/`, `tests/`,
   `docs/`):

   ```bash
   rg 'plans/stream/model-resolution'
   ```

   Only acceptable hits are inside `.plans/308-*` or `.plans/003-*` narrative
   text.

5. `pnpm test:changed`.
6. `pnpm check:full`.

### Phase 4 — Close out issue + breadcrumbs

1. Walk each acceptance criterion in
   `.plans/308-consolidate-plan-stream-model-resolution/todos.md` and tick
   only what is verified.
2. Remove the follow-up note at
   `.plans/003-deepen-session-boundary/todos.md:79-83` referring to the
   `model-resolution.ts` duplicate (or mark it done with a back-reference to
   #308).
3. Close issue #308 only after merge and after all acceptance criteria are
   ticked.

## Out of scope

- Redesigning the model-selection policy itself.
- Changing how tiers, saved preferences, or provider lookup work outside this
  consolidation.
- Moving the policy out of the session boundary.
- Broader plan-stream route refactors unrelated to the duplicate helper.
- Widening the helper's public API with DI params (logger, tier validator,
  etc.).
