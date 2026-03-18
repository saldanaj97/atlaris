# Write Verification for persistSuccessfulAttempt

## Problem

`persistSuccessfulAttempt` in `src/lib/db/queries/helpers/attempts-persistence.ts` has inconsistent write verification. Module insertion and generation attempt update are verified; task insertion and learning plan update are not. Zero-row updates would silently succeed, leaving the system in an inconsistent state.

## Approach

Apply the same `.returning()` + count/existence verification pattern already used for modules and generation attempts to the two unverified operations. Add targeted unit tests for the new verification paths.

## Related Issues

- #280 (PRD)
- #281 (Implementation task)

## Todos

- [x] `write-tests` — Write unit tests for the new verification behavior (task insertion count mismatch, learning plan zero-row update)
- [x] `implement-task-verification` — Add `.returning({ id: tasks.id })` to task insertion and verify count matches `taskValues.length`
- [x] `implement-plan-verification` — Add `.returning({ id: learningPlans.id })` to learning plan update and throw if zero rows updated
- [x] `verify-checks` — Run type-check, lint, and changed tests to confirm everything passes
- [x] `code-review` — Run code review skill and apply any sensible fixes
- [x] `commit-and-close` — Stage only our changes, commit, push, and close both issues

## Notes

- Single file change: `src/lib/db/queries/helpers/attempts-persistence.ts`
- No new dependencies
- Existing integration tests in `tests/integration/db/` exercise the function end-to-end
- Both changes are inside the same transaction, so they share atomicity guarantees
