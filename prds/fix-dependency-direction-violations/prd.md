# PRD: Fix Dependency Direction Violations

## Problem Statement

The codebase was recently restructured into a three-layer architecture: `src/shared/` (leaf) ← `src/lib/` (infrastructure) ← `src/features/` (domain). However, 9+ files in the infrastructure layer (`src/lib/`) still import from the domain layer (`src/features/`), violating the dependency direction contract. Additionally, `src/types/` exists as a legacy location that should be consolidated into `src/shared/types/`.

These violations mean that:

- Changes to domain modules (AI models, billing logic, PDF types) can break infrastructure modules (config, schema, DB queries) unexpectedly.
- The layering is not enforceable via tooling because violations already exist.
- Developers cannot trust that modifying a feature module is safe from cascading breakage into the infrastructure layer.
- Testing infrastructure modules in isolation requires pulling in domain dependencies.

## Solution

Establish a clean dependency graph by:

1. Creating the `src/shared/` leaf layer (`types/` and `constants/`) to hold cross-cutting types and constants that both `lib/` and `features/` need.
2. Consolidating `src/types/` into `src/shared/types/`.
3. Extracting shared constants from `features/ai/` into `src/shared/constants/`.
4. Removing every `lib/ → features/` import by restructuring, injecting dependencies, or moving shared items to the leaf layer.
5. Fixing two feature-to-infrastructure concern leaks where feature modules import HTTP-specific constructs from `lib/api/`.

After this work, the dependency graph strictly follows: `src/shared/` ← `src/lib/` ← `src/features/`.

## User Stories

1. As a developer modifying AI model configurations, I want confidence that my changes do not break environment configuration loading, so that I can iterate on model settings without worrying about cascading failures.
2. As a developer working on PDF feature types, I want the database schema to not depend on my feature module, so that schema migrations do not require importing feature code.
3. As a developer adding a new failure classification variant, I want the type definition to live in a shared leaf layer, so that all consumers (AI, API, metrics, mappers) import from one canonical location without circular risk.
4. As a developer modifying generation policy constants, I want the DB query layer to access these constants from a shared location, so that query modules do not depend on the AI feature module.
5. As a developer testing DB query functions in isolation, I want query modules to have no imports from `features/`, so that I can test them without pulling in AI or billing domain logic.
6. As a developer working on the billing feature, I want `src/lib/db/usage.ts` to not import from my module, so that infrastructure and domain concerns are properly separated.
7. As a developer maintaining rate limiting, I want `pdf-rate-limit.ts` to receive tier information via parameters rather than importing billing domain logic, so that rate limiting remains infrastructure-level code.
8. As a developer working on the AI feature module, I want model resolution errors to use domain-appropriate error types instead of HTTP-specific `AppError`, so that the AI module does not depend on HTTP concerns.
9. As a developer extending the orchestrator, I want the orchestrator type definitions to declare abstract operation interfaces rather than being structurally coupled to DB function signatures via `typeof import()`, so that changes to DB query signatures do not break AI type definitions.
10. As a developer onboarding to the project, I want a clear, enforceable layering contract, so that I can understand which modules are safe to import from any given layer.
11. As a developer running the linter, I want import restriction rules that enforce the dependency direction contract, so that violations are caught at development time rather than discovered through breakage.
12. As a developer consolidating shared types, I want all cross-cutting types to live under `src/shared/types/` instead of having a separate `src/types/` directory, so that the project has one canonical leaf layer.

## Implementation Decisions

### New `src/shared/` Layer

- Create `src/shared/types/` to house cross-cutting type definitions consumed by both `lib/` and `features/`.
- Create `src/shared/constants/` to house cross-cutting constants consumed by both `lib/` and `features/`.
- `src/shared/` is the bottom of the dependency graph. Files in `src/shared/` must not import from `src/lib/` or `src/features/`. They may import from third-party libraries (e.g., `zod`) and from each other.

### Consolidate `src/types/` into `src/shared/types/`

- Move all files from `src/types/` into `src/shared/types/`, preserving their names.
- This includes: `client.ts`, `client.types.ts`, `db.ts`, `db.types.ts`, `images.d.ts`, `react-activity.d.ts`.
- Update the `@/types/` path alias (if one exists) or update all import paths to `@/shared/types/`.
- Delete `src/types/` after migration.

### Fix: `config/env.ts` → `features/ai/` (Violations 1-2)

`src/lib/config/env.ts` imports `AI_DEFAULT_MODEL`, `isValidModelId` from `features/ai/ai-models.ts` and `DEFAULT_ATTEMPT_CAP` from `features/ai/constants.ts`.

**Resolution:** Extract these constants and the validator to `src/shared/constants/ai-models.ts` (for model ID list, default model, validator function) and `src/shared/constants/generation.ts` (for `DEFAULT_ATTEMPT_CAP`). Both `config/env.ts` and `features/ai/` import from `shared/constants/` instead.

The AI module's `ai-models.ts` should import and re-export from `shared/constants/ai-models.ts` for anything it adds on top (model metadata, tier mappings), keeping the model ID list and validation at the leaf layer.

### Fix: `db/schema/tables/plans.ts` → `features/pdf/context.types` (Violation 3)

The schema file imports `PdfContext` from `features/pdf/context.types` for a `jsonb` column type annotation.

**Resolution:** Use a generic `jsonb` type annotation (or `unknown`) in the schema definition. The `PdfContext` type validation and casting should happen at the feature layer when reading/writing this column. This follows the principle that the schema layer describes database structure, not application-level type semantics.

### Fix: `db/schema/tables/plans.ts` → `db/queries/types/plans.types.ts` (Violation 4)

The schema imports `GenerationAttemptStatus` (a simple string union: `'in_progress' | 'success' | 'failure'`) from the query types layer.

**Resolution:** Move `GenerationAttemptStatus` to `src/lib/db/enums.ts` alongside other enum definitions. This restores the correct direction: schema depends on enums (same layer), queries depend on schema.

### Fix: `db/queries/attempts.ts` → `features/ai/` (Violations 5-6)

`attempts.ts` imports `isRetryableClassification` from `features/ai/failures.ts` and `ATTEMPT_CAP`, `getPlanGenerationWindowStart`, `PLAN_GENERATION_LIMIT` from `features/ai/generation-policy.ts`.

**Resolution:**

- `isRetryableClassification` is a pure 10-line function on `FailureClassification`. Since `FailureClassification` is moving to `src/shared/types/`, move `isRetryableClassification` to `src/shared/types/` as well (co-located with its type) or to a `src/shared/constants/failure-classification.ts`.
- `ATTEMPT_CAP`, `PLAN_GENERATION_LIMIT`, `PLAN_GENERATION_WINDOW_MINUTES`, `getPlanGenerationWindowStart` are generation policy constants. Move them to `src/shared/constants/generation.ts`. Both the DB query layer and `features/ai/generation-policy.ts` import from there. `features/ai/generation-policy.ts` may become a thin re-export or can add feature-specific logic on top.

### Fix: `db/queries/helpers/attempts-helpers.ts` → `features/ai/` (Violation 7)

`attempts-helpers.ts` imports `PLAN_GENERATION_WINDOW_MS` from `features/ai/generation-policy.ts`.

**Resolution:** Resolved by the same constant extraction to `src/shared/constants/generation.ts` described above.

### Fix: `db/usage.ts` → `features/billing/` (Violation 8)

`src/lib/db/usage.ts` (57 lines) imports `incrementUsage` from `features/billing/usage.ts`, coupling infrastructure DB operations to billing domain logic.

**Resolution:** Remove the billing import from `db/usage.ts`. The function should perform only the database write (inserting/updating usage metrics rows). The caller (at the feature layer) is responsible for orchestrating both the DB write and the billing integration. If `db/usage.ts` becomes trivially thin after removing the billing call, consider inlining its logic into the callers.

### Fix: `api/pdf-rate-limit.ts` → `features/billing/` (Violation 9)

`src/lib/api/pdf-rate-limit.ts` imports `resolveUserTier`, `TIER_LIMITS`, and `SubscriptionTier` from `features/billing/usage`.

**Resolution:** Apply dependency injection. The rate limiting functions should accept the user's tier and tier limits as parameters rather than resolving them internally. The API route handler (which lives at the feature/app layer) resolves the tier and passes it down. `SubscriptionTier` type and `TIER_LIMITS` constant can move to `src/shared/constants/` or `src/shared/types/` since tier definitions are cross-cutting.

### Fix: `features/ai/model-resolver.ts` → `lib/api/errors` (Concern Leak 1)

The AI module imports `AppError` (an HTTP-status-aware error class) from `lib/api/errors` to wrap provider factory failures.

**Resolution:** The model resolver should throw a domain-specific error (e.g., `ModelResolutionError extends Error`) defined within `features/ai/`. The API route layer catches this and maps it to the appropriate HTTP response. The AI module should not know about HTTP status codes.

### Fix: `features/ai/types/orchestrator.types.ts` structural coupling (Concern Leak 2)

The orchestrator types use `typeof import('@/lib/db/queries/attempts').reserveAttemptSlot` (and similar) to type the injected attempt operations. This creates structural coupling: if the DB function signature changes, the AI type definitions break.

**Resolution:** Define abstract operation interfaces within `features/ai/types/orchestrator.types.ts` that describe what the orchestrator needs (e.g., `ReserveAttemptSlot: (planId: string, db: DbClient) => Promise<AttemptReservation>`). The DB module's functions must conform to these interfaces, but the AI module does not reference them. The wiring happens at the call site (route handler or worker), not in the type definitions.

### ESLint Enforcement

After all violations are fixed, add or update ESLint import restriction rules to enforce:

- `src/shared/**` must not import from `src/lib/**` or `src/features/**`
- `src/lib/**` must not import from `src/features/**`
- `src/features/**` may import from `src/lib/**` and `src/shared/**`

This prevents future regressions.

## Testing Decisions

### What makes a good test for this work

This PRD is a pure refactoring effort: no behavior should change. Tests should verify that:

- Existing behavior is preserved (all existing tests continue to pass without modification, except for import path updates).
- The dependency direction contract holds (verified by ESLint rules, not unit tests).

### Modules that need test updates

- **No new tests should be written for this PRD.** The work is moving code between locations and updating import paths. If existing tests import from relocated modules, those import paths must be updated.
- **ESLint rule verification:** After adding import restriction rules, run the linter to confirm zero violations. This is the primary "test" for this work.

### Prior art

- Existing ESLint configuration already blocks `@/lib/db/service-role` imports in certain paths (documented in the codebase). The new layer-enforcement rules follow the same pattern.

## Out of Scope

- **Breaking up god modules** (`billing/usage.ts`, `attempts-helpers.ts`, `openrouter.ts`). These are addressed in a separate PRD.
- **Restructuring the plans domain module** or moving additional logic into `features/plans/`. Addressed in a separate PRD.
- **Dead code removal.** Addressed in a separate PRD.
- **Behavioral changes to any module.** This PRD is strictly about import path restructuring and dependency direction enforcement.
- **Changing API contracts, response shapes, or database schemas.** The `GenerationAttemptStatus` move to `db/enums.ts` is a type relocation, not a schema change.

## Further Notes

### Ordering guidance

The violations can be addressed in any order, but a suggested sequence that minimizes intermediate breakage:

1. Create `src/shared/types/` and `src/shared/constants/` directories.
2. Consolidate `src/types/` → `src/shared/types/` (update all imports project-wide).
3. Extract shared constants (`ai-models`, `generation`, `failure-classification`, `tier-limits`).
4. Fix schema layer violations (PdfContext, GenerationAttemptStatus).
5. Fix query layer violations (attempts, attempts-helpers, usage).
6. Fix API layer violations (pdf-rate-limit).
7. Fix feature concern leaks (model-resolver, orchestrator types).
8. Add ESLint enforcement rules.

### Items resolved by prior restructure

The following issues identified during the architecture audit have already been resolved by the recent `lib/` → `features/` migration:

- **`api/schedule.ts` misplaced in API layer** — moved to `features/scheduling/schedule-api.ts`.
- **`api/plans/` containing domain logic** — moved to `features/plans/api/`.
- **`plans/` module pathologically thin** — grew from 2 files / 91 lines to 13 files / 1,662 lines.
- **`effort.ts` containing domain logic in utils** — moved to `features/plans/effort.ts`.
- **Duplicate `getStatusCode()` in openrouter.ts and router.ts** — resolved (only exists in `router.ts` now).
- **`mappers/` creating coupling hub** — split into co-located `db/queries/mappers.ts`, `features/plans/detail-mapper.ts`, and `features/plans/create-mapper.ts`.
- **`metrics/` inverted dependency** — moved to `features/plans/metrics.ts`.

### Risk assessment

This is low-risk work. Each violation fix is a mechanical operation (move definition, update imports). The primary risk is missing an import path update, which will be caught by the TypeScript compiler. No runtime behavior changes.
