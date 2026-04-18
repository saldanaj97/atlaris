# Track 2: type-consolidation

## Repo conventions (from audit)

Domain DB types tend to live under `@/shared/types` and `@/lib/db/queries/types`. Features re-export from shared where appropriate. DB `AGENTS.md` points query modules at `lib/db/queries/` and shared DB shapes at `@/shared/types/db.types`.

---

## 1) Research notes (`filepath:line`)

**A. `SubscriptionTier` — canonical vs duplicate**

- Canonical: `src/shared/types/billing.types.ts:1`
- Re-export: `src/features/billing/tier-limits.types.ts:1–5`
- **Duplicate literal definition:** `src/features/ai/types/model.types.ts:11`
- Imports split: e.g. `src/features/plans/session/model-resolution.ts:3` and `src/app/api/v1/plans/stream/model-resolution.ts:3` use `@/features/ai/types/model.types`; pricing uses `@/shared/types/billing.types` (`src/app/pricing/components/PricingTiers.tsx:2`).

**B. Stream model resolution — near-duplicate module + subtle behavior drift**

- `src/features/plans/session/model-resolution.ts:6–74` — `StreamModelResolution`, `StreamModelValidationError`, `resolveStreamModelResolution`
- `src/app/api/v1/plans/stream/model-resolution.ts:6–67` — repeats types/function; inline `{ reason: string }` instead of `StreamModelValidationError`; **differs** in fallback `resolutionSource`: features file uses `validationError !== undefined` (~69–70) vs API uses `suppliedModel !== undefined` (~63–64).

**C. Plan list / summary row types — copy-paste duplicates**

| Concept | `lib/db/queries/plans.ts` | `features/plans/read-models/summary.ts` |
|--------|---------------------------|----------------------------------------|
| Task row | `PlanSummaryTaskRow` ~38–43 | `SummaryTaskRow` ~20–25 |
| Progress row | `PlanProgressStatusRow` ~45 | `ProgressStatusRow` ~27 |
| Lightweight plan row | `LightweightPlanListRow` ~47–58 | `LightweightPlanRow` ~29–40 |
| Module metrics | `LightweightModuleMetricsRow` ~60–66 | `LightweightModuleMetricsRow` ~42–48 |

**D. `DbClient` — many local aliases vs one exported type**

- Exported: `src/lib/db/types.ts:4` (`DbClient`)
- Repeated `type DbClient = ReturnType<typeof getDb>`: e.g. `src/lib/db/queries/plans.ts:35`, `src/lib/db/queries/schedules.ts:14`, `src/features/billing/subscriptions.ts:9`, `src/lib/db/usage.ts:8`, `src/features/billing/account-snapshot.ts:13`, `src/features/pdf/security/pdf-extraction-proof.ts:14`
- Billing also exports: `src/features/billing/tier.ts:9`

**E. PDF section shapes — two families (overlap by design)**

- UI / extraction: `ExtractedSection` in `src/features/pdf/types.ts:38–44`; Zod in `src/shared/schemas/pdf-validation.schemas.ts:13–20`
- API parse: `ExtractionSection` from `src/features/pdf/validation/pdf.types.ts:16` / `pdf.schemas.ts:4–9`
- Client hook: `src/hooks/usePdfExtraction.ts:21–24`

**F. Session streaming errors — duplicate shape + name clash**

- `SessionError`: `src/features/plans/session/usePlanGenerationSession.ts:28–32`
- Same fields as `GenerationError`: `src/hooks/useStreamingPlanGeneration.ts:16–20`
- `StreamingError` **class** in session: `usePlanGenerationSession.ts:44–70`
- `StreamingError` **intersection type** in hook: `useStreamingPlanGeneration.ts:32–39` — same identifier, different meanings.

**G. Job error history — alias (appropriate)**

- `JobErrorHistoryEntry` in `src/shared/types/jobs.types.ts:9`
- DB alias: `src/lib/db/queries/types/jobs.types.ts:29` (`ErrorHistoryEntry = JobErrorHistoryEntry`)

**H. Error normalization layers (related but not identical)**

- `AttemptErrorLike` / `toAttemptError`: `src/lib/api/error-normalization.ts:8–62`
- SSE `ErrorLike` / `GenerationError` union: `src/features/ai/streaming/error-sanitizer.ts:17–27`

---

## 2) Critical assessment

- **Strongest wins:** duplicated plan summary row types — pure maintenance tax.
- **Highest risk:** duplicated `resolveStreamModelResolution` with **different** `resolutionSource` logic — behavioral fork, not just duplication.
- **`SubscriptionTier` in `model.types.ts`:** redundant with `billing.types.ts`; two sources obscure SSOT.
- **`DbClient` aliases:** refactors noisy; consider one import path.
- **PDF types:** intentional strict vs permissive split — document or derive carefully, don’t blind-merge.

---

## 3) Recommendations

**High**

1. Unify stream model resolution: single implementation imported by API + session; test `resolutionSource` matrix.
2. Deduplicate plan read-model row types: one module owns rows; `summary.ts` imports from `plans.ts` or shared `read-models/types.ts`.
3. Remove duplicate `SubscriptionTier`: prefer `@/shared/types/billing.types` (or tier-limits re-export) everywhere.

**Medium**

4. Normalize `DbClient` typing: prefer `@/lib/db/types` (or dedicated RLS vs service-role type).
5. Resolve `StreamingError` / session error naming: share `SessionError`; rename hook’s `StreamingError` **type** to avoid clash with **class**.

**Low**

6. PDF: module note or safe alias linking permissive API output to stricter domain type.
7. Keep `ErrorHistoryEntry` alias — already matches layering.

---

## 4) Summary

Duplicated plan summary metrics rows (`plans.ts` vs `summary.ts`), duplicate `SubscriptionTier` in `model.types.ts`, and **two `resolveStreamModelResolution` implementations with different `resolutionSource` rules** are the headline items. Medium cleanup: central `DbClient`, fix `SessionError` / `GenerationError` / `StreamingError` collision. PDF overlap is by design.
