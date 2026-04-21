# 309 — Deepen Request Auth + Scoped DB Boundary

## Acceptance Criteria

- [x] A request-boundary module owns authenticated actor resolution, request-scoped DB access, and cleanup behavior behind a single consumer-facing API.
- [x] Public consumers can use the new boundary for route, server component, and server action execution without calling `getDb()` directly or reconstructing `{ userId, dbClient }` at each call site.
- [x] The boundary keeps route gating separate from proxy/middleware concerns and preserves request-scoped correlation IDs.
- [x] Existing auth wrappers remain compatible during migration, but new or migrated consumer code prefers the boundary surface.
- [x] Boundary behavior is covered by focused unit tests for authenticated and unauthenticated route/component/action flows.
- [x] Validation covers targeted unit tests and any impacted app tests, then `pnpm test:changed` and `pnpm check:full`.

## Plan

- [x] Phase 0 — Introduce the boundary module and spec
- [x] Phase 1 — Migrate representative server components and server actions to the new scope API
- [x] Phase 2 — Update tests and mocks for the migrated consumers
- [x] Phase 3 — Validate, review changed files, and capture follow-up notes

## Review

- Implemented `src/lib/api/request-boundary.ts` as the consumer-facing request boundary for routes, server components, and server actions.
- Migrated the representative callers in plans, dashboard, pricing, billing, AI settings, and the shared site header to the new boundary.
- Added focused unit coverage for authenticated and unauthenticated route/component/action flows and updated consumer tests to mock the boundary.
- Validation passed with `pnpm test:changed` and `pnpm check:full`.
