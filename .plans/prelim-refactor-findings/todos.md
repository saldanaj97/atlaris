# Prelim refactor findings — Slice C implementation todos

## Todos

- [x] Revise `slice-c-plan.md` so it matches the current branch state instead of describing greenfield Slice C work.
- [ ] Finish the remaining read-seam migration work:
  - [x] move the attempts read route onto the feature read service
  - [x] remove the `src/features/plans/status.ts` compatibility wrapper
  - [x] remove the `src/features/plans/read-models/detail.ts` barrel
  - [x] keep list/read semantics shared without duplicate facade behavior
- [x] Update tests and imports to match the final seam layout.
- [x] Run focused Slice C validation, then `pnpm test:changed` and `pnpm check:full`.

## Review

- Completed the remaining Slice C seam cleanup instead of redoing already-landed scaffolding.
- The attempts read route now goes through the feature read service, while the retry route remains on query helpers because it is write/lifecycle-oriented.
- Removed the transitional `status.ts` wrapper and `detail.ts` barrel by moving all remaining imports to the explicit module destinations.
