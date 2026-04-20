# 308 — Consolidate plan stream model resolution policy

Source: GitHub issue [#308](https://github.com/saldanaj97/atlaris/issues/308).

## Acceptance Criteria

- [ ] `src/features/plans/session/model-resolution.ts` remains the one
      canonical implementation of stream model-resolution policy.
- [ ] The canonical module explicitly `export`s the stable public surface:
      `resolveStreamModelResolution()`, `StreamModelResolution`, and
      `StreamModelValidationError`.
- [ ] Runtime and tests import the same implementation; no test continues to
      target a route-local duplicate while production uses the session
      helper.
- [ ] The route-tree copy at
      `src/app/api/v1/plans/stream/model-resolution.ts` is **deleted
      outright** (no re-export seam; no production caller exists).
- [ ] The canonical semantics are preserved from the session-boundary copy:
      the final-branch predicate stays `validationError !== undefined` with
      its clarifying comment. No behavior change ships.
- [ ] Invalid-override logging is covered against the canonical module via
      `vi.spyOn(logger, 'warn')` on the singleton from `@/lib/logging/logger`.
      The helper's public API is **not** widened with an optional logger
      param.
- [ ] Helper assertions live in
      `tests/unit/features/plans/session/model-resolution.spec.ts`. The
      other five describe blocks in `tests/unit/api/model-validation.spec.ts`
      (query-param parsing, `isValidModelId` logic, `resolveModelForTier`
      tier-gating, preferences schema, `isValidModelId` integration) remain
      in place.
- [ ] Route-owned tests stay focused on HTTP/preflight behavior rather than
      duplicating session-policy assertions.
- [ ] `.plans/003-deepen-session-boundary/todos.md` follow-up note
      (~lines 79–83) is cleared or ticked with a back-reference to #308.
- [ ] `rg 'plans/stream/model-resolution'` returns zero hits in `src/`,
      `tests/`, and `docs/` after the change (only `.plans/*` narrative
      allowed).
- [ ] `pnpm test:changed` and `pnpm check:full` pass before the issue
      closes.

## Phases

### Phase 0 — Confirm the canonical contract

- [ ] Re-read issue #308 and `plan.md` "Design decisions".
- [ ] Confirm `resolveStreamModelResolution()` signature stays unchanged.
- [ ] Confirm `StreamModelResolution` + `StreamModelValidationError` become
      exported.
- [ ] Confirm deletion (not re-export) of the route copy.
- [ ] Confirm logger coverage via `vi.spyOn(logger, 'warn')`, not DI.
- [ ] Run sanity greps and confirm only the expected producers/consumers:
      - [ ] `rg "plans/stream/model-resolution" src tests docs`
      - [ ] `rg "resolveStreamModelResolution" src tests`

### Phase 1 — Write canonical tests first

- [ ] Create `tests/unit/features/plans/session/model-resolution.spec.ts`.
- [ ] Import from `@/features/plans/session/model-resolution`.
- [ ] Assert: valid query override → `query_override` with `modelOverride`.
- [ ] Assert: invalid query override + saved preference →
      `saved_preference` with `validationError` preserved.
- [ ] Assert: invalid query override + no saved preference →
      `query_override_invalid`.
- [ ] Assert: no query override, no saved preference → `tier_default`.
- [ ] Assert: no query override, saved preference present →
      `saved_preference`.
- [ ] Assert: invalid override emits `logger.warn` with
      `{ tier, suppliedModel, reason }` via `vi.spyOn(logger, 'warn')`;
      restore the spy per test.
- [ ] Run the new spec alone; confirm all pass against the current session
      module before any deletion.

### Phase 2 — Consolidate implementation + imports

- [ ] In `src/features/plans/session/model-resolution.ts`:
      - [ ] Add `export` to `StreamModelResolution`.
      - [ ] Add `export` to `StreamModelValidationError`.
      - [ ] Leave function body, final-branch predicate, and comment
            unchanged.
- [ ] Delete `src/app/api/v1/plans/stream/model-resolution.ts`.
- [ ] Edit `tests/unit/api/model-validation.spec.ts`:
      - [ ] Remove the `resolveStreamModelResolution` import.
      - [ ] Remove the `describe('Stream model resolution helper', ...)`
            block (~lines 76–135).
      - [ ] Leave the five unrelated describe blocks intact.
      - [ ] Rename the top-level describe if it no longer matches file
            contents (e.g. `Model validation helpers (preferences + tier
            gating)`).
- [ ] Verify no other file imports the deleted route path:
      - [ ] `rg '@/app/api/v1/plans/stream/model-resolution'`

### Phase 3 — Validate

- [ ] `pnpm vitest run tests/unit/features/plans/session/model-resolution.spec.ts`
- [ ] `pnpm vitest run tests/unit/api/model-validation.spec.ts`
- [ ] `pnpm vitest run tests/unit/features/plans/session`
- [ ] Sanity grep: `rg 'plans/stream/model-resolution'` returns hits only in
      `.plans/*` narrative.
- [ ] `pnpm test:changed`
- [ ] `pnpm check:full`

### Phase 4 — Close out

- [ ] Walk every acceptance criterion above; tick only what is verified.
- [ ] Remove or tick the duplicate-cleanup note at
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

Planning complete. Do not implement from this file until the user
explicitly starts execution.
