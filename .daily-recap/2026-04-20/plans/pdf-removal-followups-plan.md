# PDF Removal Follow-ups Plan

Context: the PDF-removal refactor (branch `chore/remove-pdf`, migration `0027_windy_agent_zero`) shipped a large set of code and schema deletions. Code review surfaced a handful of follow-ups. This plan sequences them into small, independently shippable slices so nothing blocks the MVP cutover while still closing the loop on the issues flagged in review.

## Goals

1. De-risk the schema cutover (migration ordering, data coercion, rolling-deploy safety).
2. Remove the dead/legacy code surfaced by the PDF cleanup.
3. Lock down the new, narrower contracts with lightweight regression tests so the enum/column can't silently widen again.
4. Fix stale documentation so a future agent doesn't re-introduce PDF concepts.

## Non-goals

- Re-introducing any PDF feature behind a flag.
- Consolidating unrelated architectural debt (e.g. the long-standing `streaming.types.ts` vs `session-events.ts` duplication is **in scope** as cleanup, but anything beyond event types is not).
- Changing billing meter semantics. Phase-1 metered-reservation core stays as-is.

## Execution order (high-level)

| Slice | Theme | Ships | Risk |
| ----- | ----- | ----- | ---- |
| F.1 | Deploy-safety release gate | Code only (no schema change) | Low |
| F.2 | Migration hardening (0027) | Revised SQL + migration test | Medium |
| F.3 | Boundary regression tests | New tests only | Low |
| F.4 | Dead-code & doc cleanup | Deletions + doc edits | Low |
| F.5 | Streaming event type consolidation | Refactor | Low |
| F.6 | Small UI/type simplifications | Refactor | Low |

Slices F.1 and F.2 have an ordering constraint: **F.1 must be deployed to production before F.2's migration runs.** The remaining slices have no ordering constraint between them.

---

## Slice F.1 — Deploy-safety release gate

### Why

Rolling deploys or hot failovers between the old binary (which could still write `origin:'pdf'` or read `extracted_context`) and the new schema would 500. We want a release that is **wire-compatible with the pre-migration DB** but no longer produces or consumes PDF artefacts. Today's `main` branch is *almost* that — worth confirming and fencing.

### Scope

- Audit the API/data boundary to confirm no runtime code path today:
  - writes `origin='pdf'` to `learning_plans`,
  - reads or asserts on `extracted_context`,
  - references `pdf_plans_generated`.
- Add a narrow API-boundary rejection test (see F.3) so a regression can't slip in.
- Publish an operational runbook entry: "deploy this release; wait for all pods to roll; then run 0027".

### Acceptance criteria

- A search for `extracted_context`, `pdfPlansGenerated`, and `'pdf'` (as an origin literal) in `src/**/*.{ts,tsx}` returns zero runtime matches (migrations and `openapi-origin-parity.spec.ts` are the only intentional hits).
- `docs/development/deploy.md` (or wherever the deploy runbook lives; create a short note if absent) calls out the two-phase release explicitly, including: deploy app → verify → run `drizzle-kit migrate` / equivalent.
- No code changes required beyond documentation if the audit is clean.

### Risks / rollback

- If the audit finds a lingering reader/writer, fix it **before** merging F.2. Rollback is a no-op (docs only).

### Out of scope

- Feature-flagging PDF. The feature is fully removed; we just want ordering discipline.

---

## Slice F.2 — Migration hardening

### Why

The current `0027_windy_agent_zero.sql` is destructive, silently coerces origin provenance, and rebuilds `idx_learning_plans_user_origin` twice. On a large `learning_plans` table this wastes deploy budget and discards information we can cheaply preserve.

### Changes

1. **Reorder the column-type dance to rebuild the index once:**
   - `DROP INDEX idx_learning_plans_user_origin`
   - drop default
   - `ALTER COLUMN origin SET DATA TYPE text`
   - `UPDATE learning_plans SET origin='manual' WHERE origin='pdf'`
   - `DROP TYPE plan_origin`
   - `CREATE TYPE plan_origin AS ENUM('ai','template','manual')`
   - `ALTER COLUMN origin SET DATA TYPE plan_origin USING origin::plan_origin`
   - `ALTER COLUMN origin SET DEFAULT 'ai'::plan_origin`
   - `CREATE INDEX idx_learning_plans_user_origin ON learning_plans (user_id, origin)`
2. **Capture provenance before coercion.** Add a tiny inline telemetry step that emits row count to the migration log, e.g.:
   ```sql
   DO $$ DECLARE n int;
   BEGIN
     SELECT count(*) INTO n FROM learning_plans WHERE origin = 'pdf';
     RAISE NOTICE 'migration 0027: coercing % pdf-origin plans to manual', n;
   END $$;
   ```
   This is log-only, zero cost, and gives operators a visible count without a new audit table.
3. **Decision: do we preserve provenance in a new column?** Default is *no* for MVP (keeps schema small). Revisit only if product wants a "legacy PDF plans" report. Document the decision in the migration comment so it is not rediscovered later.
4. Keep the `DROP COLUMN extracted_context` and `DROP COLUMN pdf_plans_generated` in the same migration file. Do not split.

### New tests

- `tests/integration/db/migration-0027.spec.ts`:
  - Seed a `learning_plans` row with `origin='pdf'` (via raw SQL against a fresh test DB where the old enum still exists, or via a fixture branch that loads schema at an earlier revision).
  - Run the migration harness.
  - Assert: row's `origin === 'manual'`, column `extracted_context` does not exist, `usage_metrics.pdf_plans_generated` does not exist.
  - Assert the new enum values are exactly `['ai','template','manual']` (sorted).
- If setting up the pre-migration state is prohibitively complex inside the existing harness, fall back to a pure-SQL snapshot test that exercises only the `UPDATE` + `ALTER TYPE` steps against a synthetic fixture schema.

### Acceptance criteria

- `pnpm test:integration -- migration-0027` passes locally and in CI.
- Migration notice prints a coercion count.
- `explain (analyze, buffers)` on a representative `learning_plans` query still uses `idx_learning_plans_user_origin` after migration (manual validation on a staging restore).

### Risks / rollback

- **If the integration harness can't restore the pre-migration enum**, degrade to a README note ("validated manually on staging restore on <date>") and ship the reorder + NOTICE without the automated test. Do not block F.2 on this.
- Rollback is restore-from-backup. This is a one-way door; F.1 must precede it.

---

## Slice F.3 — Boundary regression tests

### Why

The origin enum and `extracted_context` removal are not defended by tests at the HTTP layer. One misplaced schema edit could re-widen silently.

### New tests

1. **API boundary rejects `origin:'pdf'`**
   - File: `tests/unit/features/plans/validation/learningPlans.spec.ts` (or the closest existing Zod parsing spec).
   - Assert `createLearningPlanSchema.safeParse({...validBase, origin: 'pdf'}).success === false`.
   - Assert `...origin: 'ai'` still parses.
2. **Plan response DTO never includes `extractedContext`**
   - Extend the existing `plans-list-pagination` assertion style: pick the plan-detail DTO test and assert `not.toHaveProperty('extractedContext')` on the returned object.
3. **OpenAPI + DB enum parity**
   - Already covered by `tests/unit/api/openapi-origin-parity.spec.ts`. Confirm it still runs in CI; no new test required.

### Acceptance criteria

- Both new specs fail if `origin: 'pdf'` is re-added to the Zod schema or DB enum.
- Spec for `extractedContext` fails if the field is re-exposed on the plan DTO.

### Risks / rollback

- None; tests only.

---

## Slice F.4 — Dead-code & documentation cleanup

### Why

Knip already flags `atomicCheckAndIncrementUsage` and `decrementRegenerationUsage` as unused. Two docs still describe PDF artefacts.

### Changes

1. Delete `atomicCheckAndIncrementUsage` from `src/features/billing/quota.ts`. If the only remaining export is `selectUserSubscriptionTierForUpdate` (re-exported from `metered-reservation`), consider inlining that re-export at call sites and removing the `quota.ts` wrapper module entirely — but only if it stays a drop-in replacement.
2. Delete `decrementRegenerationUsage` from `src/features/billing/usage-metrics.ts`. The metered-reservation path owns decrement via `compensateMeteredReservation`.
3. Update `src/lib/db/AGENTS.md` line ~139: drop the `extracted_context` / PdfContext note from the `learning_plans` row in the "Key Tables" section.
4. Update `docs/testing/db-test-patterns.md` line ~330: remove `extractedContext: null` from the `createTestPlan` example so it matches the current fixture.
5. Re-run `pnpm check:knip` and confirm the unused-file/export count for the PDF removal is zero. Other pre-existing Knip warnings (unrelated) are out of scope.

### Acceptance criteria

- `pnpm check:knip` reports no unused exports owned by billing/quota/usage-metrics.
- `rg 'extracted_context|PdfContext|pdfPlansGenerated' -- src docs` returns only migration artefacts.
- `pnpm check:type` and `pnpm test:unit` still pass.

### Risks / rollback

- If `atomicCheckAndIncrementUsage` turns out to be imported by a test helper that Knip missed (rare), restore it and note why.

---

## Slice F.5 — Consolidate streaming event types

### Why

`src/features/ai/types/streaming.types.ts` and `src/features/plans/session/session-events.ts` duplicate `PlanStartEvent`, `ModuleSummaryEvent`, `ProgressEvent`, `CompleteEvent`, `ErrorEvent`, `CancelledEvent` almost verbatim. The PDF removal required keeping both in sync by hand. Consolidation was deferred; now is the natural moment.

### Changes

1. Pick one source of truth. Recommendation: keep `src/features/plans/session/session-events.ts` because the session module is the feature owner; the AI-level `streaming.types.ts` is a leftover from when events were defined near the provider.
2. Replace `StreamingEvent` (from `ai/types/streaming.types.ts`) with a type-only re-export of `PlanGenerationSessionEvent`, aliased if needed for call-site stability, or migrate call sites to the canonical name.
3. Delete the duplicated per-event types from the losing module.
4. Verify `src/features/ai/streaming/schema.ts` Zod schema still reflects the canonical type; run the schema-vs-type parity test if one exists, or add a simple `expectType`-style assertion.

### Acceptance criteria

- Only one file exports `PlanStartEvent` and siblings.
- `pnpm check:type`, `pnpm check:lint`, `pnpm check:circular`, `pnpm test:unit` all pass.
- No call sites import from the deleted module (Grep confirms).

### Risks / rollback

- Imports across many files — use a single `StrReplace` per import path to minimise churn. Prefer keeping names stable even if the module path changes.

---

## Slice F.6 — Small UI/type simplifications

### Why

The PDF removal narrowed several types but left defensive code that no longer adds value.

### Changes

1. `src/app/plans/[id]/components/PlanPendingState.tsx`:
   - Drop the `origin as 'ai' | 'manual' | 'template'` cast and the `?? 'AI'` fallback in `formatOrigin`. The input type is already `ClientPlanDetail['origin']` which is exactly `'ai' | 'manual' | 'template' | null | undefined`.
   - Keep the `if (!origin) return 'AI';` guard since `null`/`undefined` are still possible from server responses.
2. Audit for any other `as 'ai' | 'manual' | 'template' | 'pdf'` or `origin === 'pdf'` residue in the client tree (`rg "'pdf'" src/app src/components`). Delete what is found.

### Acceptance criteria

- `pnpm check:type` passes.
- Visual sanity check of the plan pending page: Origin badge still reads "AI" for AI plans.

### Risks / rollback

- None; tight, localised changes.

---

## Validation gate

After all slices, run once at the tip of the follow-up branch:

- `pnpm check:type`
- `pnpm check:lint`
- `pnpm check:knip`
- `pnpm check:circular`
- `pnpm test:unit`
- `pnpm test:integration -- migration-0027` (F.2 only)
- Grep sweep: `rg -i pdf src tests docs` — confirm only intentional historical references remain (migration snapshots, the parity test, this plan doc).

## Open questions

1. Should the migration `RAISE NOTICE` in F.2 be upgraded to a structured ops event (Sentry / our `record*` helpers)? Default answer: no — the migration runs once and the NOTICE is sufficient evidence. Confirm with ops before landing.
2. Is there a staging DB with real `origin='pdf'` rows we can dry-run 0027 against before prod? If yes, add a checklist entry; if no, the F.2 test carries the burden.
3. Is the `quota.ts` wrapper worth keeping as a stable import surface even after deleting `atomicCheckAndIncrementUsage`? If a future meter lands we may want the seam back; but keeping a module with a single re-export is also fine to delete and restore later.
