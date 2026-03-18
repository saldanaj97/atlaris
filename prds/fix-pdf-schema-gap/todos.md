# Fix: PDF Schema Gap (Issue #283)

## Context

Issue #283 reported a contract violation: the OpenAPI response schemas in `src/lib/api/openapi.ts` excluded `'pdf'` from their origin enums while the request schemas and DB enum included it. The code fix was applied in commit `a91338d` — both `learningPlanSchema` (line 39) and `createPlanResponseSchema` (line 72) now include `'pdf'`.

**What remains:** There are no regression tests to prevent this mismatch from recurring. The issue is still OPEN on GitHub.

## Plan

- [x] Verify the code fix is present on `develop` (lines 39, 72 of `openapi.ts` include `'pdf'`)
- [ ] Add regression tests: OpenAPI response origin enum parity with DB `planOrigin` enum
  - Test that `learningPlanSchema` origin enum matches DB `planOrigin` values
  - Test that `createPlanResponseSchema` origin enum matches DB `planOrigin` values
  - Test that request schema origin enum matches DB `planOrigin` values
- [ ] Run checks: lint, typecheck, build, changed tests
- [ ] Code review the changes
- [ ] Commit only the changes from this conversation
- [ ] Close issue #283 with acceptance criteria marked off

## Key Files

| File                                           | Purpose                                          |
| ---------------------------------------------- | ------------------------------------------------ |
| `src/lib/api/openapi.ts`                       | OpenAPI response/request schemas (already fixed) |
| `src/lib/db/enums.ts`                          | DB `planOrigin` enum (source of truth)           |
| `src/shared/schemas/learning-plans.schemas.ts` | Shared request validation schemas                |
| `tests/unit/api/`                              | Target directory for new regression tests        |
