# PDF Removal Follow-ups

- [x] Add deploy-order runbook note for the code-first then migration cutover.
- [x] Harden migration `0027_windy_agent_zero` and cover the legacy-PDF coercion path.
- [x] Add boundary regression tests for origin parsing and DTO shape.
- [x] Remove dead billing exports and stale PDF references in docs/examples.
- [x] Consolidate duplicate streaming event types under `session-events.ts`.
- [x] Simplify leftover plan origin UI handling after PDF removal.

## Review

- Implemented against the existing PDF-removal branch state instead of recreating the broader removal work.
- Left unrelated working-tree changes untouched.
- Validation run included targeted specs plus repo-level checks required by this workspace.
