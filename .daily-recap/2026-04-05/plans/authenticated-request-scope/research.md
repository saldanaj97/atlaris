# Research: Authenticated Request Scope

## Scope

This document captures the verified current-state research needed before deeper interface design or implementation planning for candidate `#1` from the architecture-deepening review: authenticated request scope.

## Verified Thesis

The current design is not broken because it lacks helpers. It is broken because several helpers jointly represent one runtime concern:

- resolve auth identity
- provision or fetch the DB user row
- create an RLS-scoped DB client
- install request context
- expose `getDb()`
- clean up the dedicated connection

That concern is still split across multiple caller-facing entry points with different semantics. The split creates caller ceremony, hides runtime-only constraints behind ambient APIs such as `getDb()`, and still leaks implementation rules into tests.

The earlier framing overstated the public surface area. The active caller-facing boundary is smaller than it first appeared, but the architectural problem is still real.

## Key Evidence

### Core implementation cluster

- `src/lib/api/auth.ts`
- `src/lib/api/context.ts`
- `src/lib/db/runtime.ts`
- `src/lib/db/rls.ts`

### Verified caller-facing surface

Active wrappers with external callers:

- `withAuth` — 1 caller
- `withAuthAndRateLimit` — 19 callers
- `withServerActionContext` — 7 callers
- `withServerComponentContext` — 7 callers

Co-located composition helper with external callers:

- `withErrorBoundary` — 22 callers

Focused escape hatch:

- `getEffectiveAuthUserId` — 1 external caller (`src/app/page.tsx`) for redirect-only identity checks

Internal-only helpers with no external callers:

- `getAuthUserId`
- `requireCurrentUserRecord`
- `requireUser`

Exported dead code:

- `getCurrentUserRecordSafe` — 0 external callers

### Concrete friction

1. The request-scope boundary still hides runtime behavior behind wrapper choice and ambient DB access.
   - `withServerComponentContext()` resolves the user and installs request context.
   - `getDb()` only succeeds in non-test runtime when request context exists.
   - Historical proof: the authenticated pricing-page regression on `2026-04-01` happened because the page used `getCurrentUserRecordSafe()` instead of `withServerComponentContext()`.
   - Current-state nuance: that specific misuse path no longer has active callers because `getCurrentUserRecordSafe()` has 0 callers, but the exported function still preserves the old foot-gun unless it is removed or clearly deprecated.

2. `getDb()` is the biggest migration boundary.
   - `getDb()` has 43 call sites across the codebase.
   - In tests, it returns the service-role client.
   - In non-test runtime, it throws without request context.
   - Some modules default to `getDb()`, while others require explicit `dbClient` or injected dependencies.
   - Any refactor that changes the ambient DB contract will have a wide blast radius even if the wrapper names barely change.

3. Test-only behavior is split across multiple contracts.
   - `withAuth()` has a test path that skips RLS setup.
   - `withServerComponentContext()` has a test path that skips request-context setup.
   - `getDb()` has a test path that returns `serviceDb` regardless of request context.
   - The next design has to decide whether those branches converge into one test contract or remain intentionally different.

4. The auth module exports orthogonal composition helpers from the same file.
   - `withErrorBoundary()` has 22 callers.
   - That helper is not itself the authenticated-request-scope problem, but any refactor of `src/lib/api/auth.ts` has to account for its caller surface and avoid conflating auth-boundary design with error-boundary composition.

5. Some tests intentionally encode primitive choice.
   - The pricing-page unit tests assert that `withServerComponentContext()` is used and `getCurrentUserRecordSafe()` is not.
   - That is not an ideal long-term seam, but it is currently a justified regression guard because the wrong primitive already caused a production-visible failure.

6. Not every direct helper call is a smell.
   - The home page calls `getEffectiveAuthUserId()` directly for redirect-only logic.
   - It does not need a user row, request context, or authenticated DB access.
   - That is a valid escape hatch, not evidence that every server component needs the same wrapper treatment.

## Planning Implications

- The refactor cannot be scoped as “rename wrappers.” That would preserve the same ambient-contract ambiguity.
- The next plan must explicitly decide whether the future boundary is centered on:
  - a request-scope runner,
  - an explicit authenticated-session object,
  - or a constrained cleanup of today’s wrapper family.
- The valid escape hatch (`getEffectiveAuthUserId()`) must stay distinct from the request-scope boundary instead of being treated as the same problem.
- The plan must explicitly decide whether to remove, deprecate, or retain exported dead code such as `getCurrentUserRecordSafe()`.
- The test-runtime story is in scope. Leaving `getDb()` behavior split across production and multiple `isTest` branches will keep the architecture lying to developers.
- Migration planning must separate the auth-scope problem from co-located but orthogonal helpers such as `withErrorBoundary()`.
- The next artifact should resolve the decision tree, migration order, and validation strategy instead of extending open-ended research.
