# Plan: Deepen Request Auth + Scoped DB Boundary

## Summary

Introduce a single request-boundary module that owns authenticated actor resolution, request-scoped DB access, and cleanup. The public surface should make the common case simple for server components, server actions, and routes while keeping the transport/auth plumbing private.

## Key Changes

- Add a boundary module that exposes route/component/action execution against a single request scope.
- Keep the existing auth helpers compatible during migration, but stop using `withServerComponentContext`/`withServerActionContext` in the migrated consumers.
- Give consumers a scope object with `actor`, `db`, `owned`, and `correlationId` so they stop rebuilding the same pair and stop calling `getDb()` directly.
- Leave proxy/middleware concerns outside the boundary; it should not become a second routing layer.

## Test Plan

- Add focused unit coverage for authenticated and unauthenticated route/component/action behavior.
- Update consumer tests that currently mock auth wrappers to mock the boundary instead where the consumer switches to it.
- Run targeted tests for the touched app files, then `pnpm test:changed` and `pnpm check:full`.

## Assumptions

- The boundary can be introduced without deleting the existing auth wrappers immediately.
- Route-rate-limit wrappers can remain where they are if the route does not need to switch in this pass.
- The new scope should expose `owned` access because that removes repeated `{ userId, dbClient }` plumbing across the app.

