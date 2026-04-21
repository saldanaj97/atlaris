# 308 — Consolidate plan stream model resolution policy

Source: GitHub issue [#308](https://github.com/saldanaj97/atlaris/issues/308).

## Acceptance Criteria

- [x] `src/features/plans/session/model-resolution.ts` remains the one
      canonical implementation of stream model-resolution policy.
- [x] The canonical module explicitly `export`s the stable public surface:
      `resolveStreamModelResolution()`, `StreamModelResolution`, and
      `StreamModelValidationError`.
- [x] Runtime and tests import the same implementation; no test continues to
      target a route-local duplicate while production uses the session
      helper.
- [x] The route-tree copy at
      `src/app/api/v1/plans/stream/model-resolution.ts` is **deleted
      outright** (no re-export seam; no production caller exists).
- [x] The canonical semantics are preserved from the session-boundary copy:
      the final-branch predicate stays `validationError !== undefined` with
      its clarifying comment. No behavior change ships.
- [x] Invalid-override logging is covered against the canonical module via
      `vi.spyOn(logger, 'warn')` on the singleton from `@/lib/logging/logger`.
      The helper's public API is **not** widened with an optional logger
      param.
- [x] Helper assertions live in
      `tests/unit/features/plans/session/model-resolution.spec.ts`. The
      other five describe blocks in `tests/unit/api/model-validation.spec.ts`
      (query-param parsing, `isValidModelId` logic, `resolveModelForTier`
      tier-gating, preferences schema, `isValidModelId` integration) remain
      in place.
- [x] Route-owned tests stay focused on HTTP/preflight behavior rather than
      duplicating session-policy assertions.
- [x] `.plans/003-deepen-session-boundary/todos.md` follow-up note
      (~lines 79–83) is cleared or ticked with a back-reference to #308.
- [x] `rg 'plans/stream/model-resolution'` returns zero hits in `src/`,
      `tests/`, and `docs/` after the change (only `.plans/*` narrative
      allowed).
- [x] `pnpm test:changed` and `pnpm check:full` pass before the issue
      closes.

## Phases

### Phase 0 — Confirm the canonical contract

- [x] Re-read issue #308 and `plan.md` "Design decisions".
- [x] Confirm `resolveStreamModelResolution()` signature stays unchanged.
- [x] Confirm `StreamModelResolution` + `StreamModelValidationError` become
      exported.
- [x] Confirm deletion (not re-export) of the route copy.
- [x] Confirm logger coverage via `vi.spyOn(logger, 'warn')`, not DI.
- [x] Run sanity greps and confirm only the expected producers/consumers:
      - [x] `rg "plans/stream/model-resolution" src tests docs`
      - [x] `rg "resolveStreamModelResolution" src tests`

### Phase 1 — Write canonical tests first

- [x] Create `tests/unit/features/plans/session/model-resolution.spec.ts`.
- [x] Import from `@/features/plans/session/model-resolution`.
- [x] Assert: valid query override → `query_override` with `modelOverride`.
- [x] Assert: invalid query override + saved preference →
      `saved_preference` with `validationError` preserved.
- [x] Assert: invalid query override + no saved preference →
      `query_override_invalid`.
- [x] Assert: no query override, no saved preference → `tier_default`.
- [x] Assert: no query override, saved preference present →
      `saved_preference`.
- [x] Assert: invalid override emits `logger.warn` with
      `{ tier, suppliedModel, reason }` via `vi.spyOn(logger, 'warn')`;
      restore the spy per test.
- [x] Run the new spec alone; confirm all pass against the current session
      module before any deletion.

### Phase 2 — Consolidate implementation + imports

- [x] In `src/features/plans/session/model-resolution.ts`:
      - [x] Add `export` to `StreamModelResolution`.
      - [x] Add `export` to `StreamModelValidationError`.
      - [x] Leave function body, final-branch predicate, and comment
            unchanged.
- [x] Delete `src/app/api/v1/plans/stream/model-resolution.ts`.
- [x] Edit `tests/unit/api/model-validation.spec.ts`:
      - [x] Remove the `resolveStreamModelResolution` import.
      - [x] Remove the `describe('Stream model resolution helper', ...)`
            block (~lines 76–135).
      - [x] Leave the five unrelated describe blocks intact.
      - [x] Rename the top-level describe if it no longer matches file
            contents (e.g. `Model validation helpers (preferences + tier
            gating)`).
- [x] Verify no other file imports the deleted route path:
      - [x] `rg '@/app/api/v1/plans/stream/model-resolution'`

### Phase 3 — Validate

- [x] `pnpm vitest run tests/unit/features/plans/session/model-resolution.spec.ts`
- [x] `pnpm vitest run tests/unit/api/model-validation.spec.ts`
- [x] `pnpm vitest run tests/unit/features/plans/session`
- [x] Sanity grep: `rg 'plans/stream/model-resolution'` returns hits only in
      `.plans/*` narrative.
- [x] `pnpm test:changed`
- [x] `pnpm check:full`

### Phase 4 — Close out

- [x] Walk every acceptance criterion above; tick only what is verified.
- [x] Remove or tick the duplicate-cleanup note at
      `.plans/003-deepen-session-boundary/todos.md:79-83` with a back
      reference to #308.
- [ ] Optional: add a `.daily-recap/<today>/` breadcrumb describing the
      consolidation.
- [ ] Close issue #308 after merge.

## Review

### Planning decisions

- Canonical home = session-boundary module. Model resolution is session
  startup policy, not HTTP transport.
- Consolidation is a structural / trust cleanup, not a bug fix. The two
  copies' final-branch predicates are behaviorally equivalent today; the
  session predicate just expresses the rule more self-evidently.
- Delete the route file outright. `route.ts` does not import the local
  helper; only the test does.
- Export `StreamModelResolution` and `StreamModelValidationError` as part of
  the stable public surface.
- Logger coverage uses `vi.spyOn(logger, 'warn')` — no DI widening of the
  helper's signature.
- Helper tests move to
  `tests/unit/features/plans/session/model-resolution.spec.ts`; the other
  five unrelated describe blocks in
  `tests/unit/api/model-validation.spec.ts` stay put.

### Risks to watch during implementation

- Deleting the route duplicate before the new spec is green would silently
  drop the one describe block that covers helper behavior. Phase 1 must
  land green before Phase 2's deletion.
- `vi.spyOn(logger, 'warn')` must be restored per test (or use
  `beforeEach`/`afterEach`) to avoid leaking a spy into unrelated specs in
  the same vitest worker.
- Renaming the top-level describe in the legacy file may force snapshot /
  reporter regex updates somewhere; sanity-grep for the old describe string
  before renaming.
- Do not reword the `validationError !== undefined` predicate into
  `suppliedModel !== undefined` under the banner of "consistency". They are
  equivalent today, and the session form is the one we keep.

### Status

Implementation landed in-repo; merge + GitHub closure of #308 remains for the
author.
