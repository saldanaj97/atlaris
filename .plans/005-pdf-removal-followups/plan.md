## Source

Implementation follows `.daily-recap/2026-04-20/plans/pdf-removal-followups-plan.md`.

## Scope

1. Add deploy-order documentation for the PDF-removal cutover.
2. Harden migration `0027_windy_agent_zero` and cover it with an integration test.
3. Add regression coverage for the narrowed plan-origin/schema boundary.
4. Remove dead billing wrappers and stale PDF documentation.
5. Consolidate duplicate streaming event types under the session boundary.
6. Simplify leftover UI origin handling.

## Validation

1. Targeted tests for migration, validation, DTO mapping, and streaming events.
2. Required repo baseline:
   - `pnpm test:changed`
   - `pnpm check:full`
3. Additional follow-up checks from the source plan:
   - `pnpm check:knip`
   - `pnpm check:circular`
   - targeted `rg` sweeps for lingering PDF references
