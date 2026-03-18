# PRD: Break Up God Modules

## Problem Statement

Three files in the codebase have grown far beyond manageable size, mixing multiple responsibilities and accumulating excessive external dependencies. These "god modules" create several concrete problems:

1. **`src/lib/db/queries/helpers/attempts-helpers.ts` (530 lines, 10 external module dependencies)** — Mixes input sanitization, PDF provenance hashing, attempt metadata construction, effort normalization, rate-limit window queries, RLS context management, and a 140-line transactional persistence function. The 10 external dependencies span AI types, generation policy, billing validation, config, logging, crypto, and API context. Any change to an unrelated concern (e.g., effort normalization constants) forces re-reading 530 lines to understand blast radius.

2. **`src/features/ai/providers/openrouter.ts` (611 lines)** — Mixes SDK client construction, request/response type definitions, response shape validation (~130 lines), stream chunk parsing, Sentry span lifecycle management (~110 lines), and error classification. A developer fixing a response validation bug must navigate the entire provider class and its inline type system. The validation logic alone (`validateNonStreamingResponse` and its helpers) is self-contained and testable in isolation but cannot be tested without importing the entire 611-line provider module.

3. **`src/features/billing/usage.ts` (~500 lines after PRD 2)** — Even after PRD 2 extracts plan lifecycle functions, the remaining file still mixes tier resolution, monthly usage metrics CRUD, atomic transactional quota enforcement, and decrement/rollback operations. The atomic quota functions (`atomicCheckAndIncrementUsage`, `atomicCheckAndIncrementPdfUsage`) each contain ~80-100 lines of transactional locking and error handling that is structurally identical but not shared. This refactor has now been completed and the transitional barrel file has since been removed.

These god modules cause:

- **High cognitive load** — Developers must mentally parse hundreds of lines to find the 20-line function they need to change.
- **Excessive test coupling** — Unit tests for a pure function (e.g., `sanitizeInput`) must import a module that also exports a 140-line database transaction.
- **Dependency fan-in** — `attempts-helpers.ts` pulls in 10 external modules; any change to those modules makes this file a candidate for re-testing.
- **Review friction** — PRs touching these files are hard to review because unrelated functions share the same diff.

## Prerequisites

- **PRD 2 (Complete Plan Domain Consolidation)** should execute first or concurrently, since it reduces `billing/usage.ts` from 850 to ~500 lines by extracting plan lifecycle functions. The split described here for `billing/usage.ts` applies to the post-PRD-2 state.

## Solution

Split each god module into cohesive, single-responsibility files. Each new file has:

- A clear, singular purpose
- Fewer external dependencies than the original
- Independent testability (you can test one file without pulling in the entire module)

The module-split work aims to avoid behavioral changes. This branch also includes a small API contract hardening alongside the refactor: PDF-origin plan creation now requires `pdfProofVersion`, and the OpenAPI docs reflect that stricter contract. During migration, public exports may be preserved temporarily via re-exports, but the intended end state is direct imports from focused modules.

## User Stories

1. As a developer fixing a bug in PDF provenance hashing, I want the relevant code isolated in its own file (~60 lines), so that I only need to understand input types and crypto, not database transactions.
2. As a developer debugging OpenRouter response validation failures, I want the validation logic in a dedicated file, so that I can read and test it without navigating the entire provider class.
3. As a developer writing unit tests for `sanitizeInput`, I want to import it from a module that does not also export `persistSuccessfulAttempt` (which requires a real database), so that my unit test has no transitive DB dependencies.
4. As a developer reviewing a PR that changes rate-limit retry-after computation, I want the diff to show only the 50-line rate-limit helper file, not a 530-line god module.
5. As a developer modifying billing quota enforcement, I want atomic check-and-increment functions in their own file, so that changes to usage metrics CRUD do not create merge conflicts with quota logic.

## Implementation Details

### 1. Split `attempts-helpers.ts` (530 lines → 4 files)

The current file contains four distinct responsibility clusters. Each becomes its own file under `src/lib/db/queries/helpers/`:

#### `attempts-input.ts` (~190 lines)

Input preparation, sanitization, and metadata construction. Pure functions with no database operations.

**Functions moved:**

- `sanitizeInput(input)` — Truncates topic/notes to max lengths
- `toPromptHashPayload(planId, userId, input, sanitized)` — Builds deterministic hash payload
- `getPdfProvenance(input)` — Extracts PDF provenance data (extraction hash, proof version, context digest)
- `buildMetadata(params)` — Constructs the `AttemptMetadata` object from all preparation results
- `stableSerialize(value)` — Deterministic JSON serialization for hashing

**Private helpers that move with their public consumers:**

- `getPdfContextDigest(input)` — SHA-256 of serialized PDF context
- `hasPdfProvenanceInput(input)` — Type guard for PDF provenance fields

**External dependencies (4 — down from 10):**

- `@/lib/crypto/hash` — `hashSha256`
- `@/lib/db/queries/helpers/truncation` — `truncateToLength`
- `@/shared/constants/learning-plans` — `TOPIC_MAX_LENGTH`, `NOTES_MAX_LENGTH`
- `@/shared/types/ai-provider.types` — `GenerationInput` (type only)

**Consumers:**

- `src/lib/db/queries/attempts.ts` — imports `sanitizeInput`, `toPromptHashPayload`, `getPdfProvenance`, `buildMetadata`

#### `attempts-persistence.ts` (~200 lines)

Database transaction for successful attempt finalization and module normalization.

**Functions moved:**

- `persistSuccessfulAttempt(params)` — The 140-line transaction that deletes old modules, inserts new modules/tasks, updates attempt status, and updates plan generation state
- `normalizeParsedModules(modulesInput)` — Normalizes module/task minutes via effort normalization, returns normalized data + flags
- `assertAttemptIdMatchesReservation(attemptId, preparation)` — Validation guard
- `isAttemptsDbClient(db)` — Type guard for AttemptsDbClient

**Private helpers that move:**

- `ATTEMPTS_DB_METHODS` constant — Used by `isAttemptsDbClient`

**External dependencies (4):**

- `@/lib/db/schema` — Table references (`modules`, `tasks`, `generationAttempts`, `learningPlans`)
- `@/lib/db/service-role` — `serviceDb` (for RLS context identity comparison)
- `@/features/plans/effort` — `normalizeModuleMinutes`, `normalizeTaskMinutes`, `aggregateNormalizationFlags`
- `@/features/ai/types/parser.types` — `ParsedModule` (type only)

**Consumers:**

- `src/lib/db/queries/attempts.ts` — imports `persistSuccessfulAttempt`, `normalizeParsedModules`, `assertAttemptIdMatchesReservation`
- `src/features/ai/orchestrator.ts` — imports `isAttemptsDbClient`

#### `attempts-rate-limit.ts` (~55 lines)

Rate-limit window statistics query and retry-after computation.

**Functions moved:**

- `selectUserGenerationAttemptWindowStats(params)` — DB query counting user's generation attempts in the rate-limit window
- `computeRetryAfterSeconds(oldestAttemptCreatedAt, now)` — Pure computation of retry-after seconds

**Private helpers that move:**

- `userAttemptsSincePredicate(userId, since)` — SQL WHERE clause builder

**External dependencies (2):**

- `@/lib/db/schema` — `generationAttempts`, `learningPlans`
- `@/shared/constants/generation` — `PLAN_GENERATION_WINDOW_MS`

**Consumers:**

- `src/lib/db/queries/attempts.ts` — imports `computeRetryAfterSeconds`, `selectUserGenerationAttemptWindowStats`
- `src/lib/api/rate-limit.ts` — imports `selectUserGenerationAttemptWindowStats`

#### `attempts-helpers.ts` (~90 lines — retained, reduced)

Provider error inspection and structured logging. These are cross-cutting utilities used during both success and failure finalization.

**Functions that stay:**

- `getProviderErrorStatus(attemptErr)` — Extracts HTTP status from provider error shapes (private, used by `isProviderErrorRetryable`)
- `isProviderErrorRetryable(attemptErr)` — Determines if a provider error is retryable based on HTTP status
- `logAttemptEvent(event, payload)` — Structured logging for attempt success/failure events

**External dependencies (3):**

- `@/lib/api/context` — `getCorrelationId`
- `@/lib/config/env` — `appEnv`
- `@/lib/logging/logger` — `logger`

**Consumers:**

- `src/lib/db/queries/attempts.ts` — imports `isProviderErrorRetryable`, `logAttemptEvent`

### 2. Split `openrouter.ts` (611 lines → 2 files)

#### `openrouter-response.ts` (~230 lines) — NEW

Response parsing, validation, and stream processing utilities. All functions are pure or operate on generic data shapes — none depend on the OpenRouter SDK or Sentry.

**Functions and types moved:**

- `TextPart`, `StreamDeltaLike`, `StreamChoiceLike`, `StreamEventLike` — Type definitions for response shapes
- `isObjectRecord(value)` — Generic type guard
- `isAsyncIterable(value)` — Type guard for async iterables
- `parseContent(content)` — Extracts text from string or TextPart array
- `extractChunkText(event)` — Extracts text from a stream event
- `normalizeUsage(usage)` — Normalizes snake_case/camelCase usage fields
- `USAGE_TOKEN_FIELDS` — Constant for usage field validation
- `isTextPartArray(value)` — Type guard for TextPart arrays
- `isUsageShape(value)` — Type guard for usage objects
- `describeResponseValue(value)` — Debug description for validation errors
- `createInvalidShapeError(fieldPath, expected, actual)` — Creates typed validation error
- `validateNonStreamingResponse(response)` — Full non-streaming response validation
- `getStatusCodeFromError(error)` — Extracts HTTP status from error shapes
- `streamFromEvents(params)` — Converts async iterable of events to ReadableStream<string>

**External dependencies (2):**

- `@/features/ai/providers/errors` — `ProviderInvalidResponseError`
- `@/features/ai/streaming/utils` — `asyncIterableToReadableStream`

**Consumers:**

- `src/features/ai/providers/openrouter.ts` — imports all functions needed by `OpenRouterProvider.generate()`
- Test files — may import validation functions directly for unit testing

#### `openrouter.ts` (~380 lines — retained, reduced)

The `OpenRouterProvider` class, SDK construction, and Sentry-instrumented generation.

**What stays:**

- `OpenRouterClient` type export
- `OpenRouterProviderConfig` type export
- `OpenRouterProvider` class (constructor + `generate` method)
- Sentry span lifecycle management (within `generate`)
- Timeout constants (`OPENROUTER_DEFAULT_TIMEOUT_MS`, `OPENROUTER_TIMEOUT_EXTENSION_MS`)

**External dependencies (unchanged from current file minus the ones moved out):**

- `@openrouter/sdk` — `OpenRouter`
- `@sentry/nextjs` — Sentry span instrumentation
- `@/features/ai/prompts` — prompt building
- `@/features/ai/providers/errors` — `ProviderError`
- `@/features/ai/providers/openrouter-response` — NEW import for extracted utilities
- `@/features/ai/streaming/utils` — `toStream`
- `@/features/ai/timeout` — timeout constants
- `@/lib/config/env` — `openRouterEnv`
- `@/lib/logging/logger` — `logger`

**Consumers (unchanged):**

- `src/features/ai/providers/router.ts` — imports `OpenRouterProvider`
- Tests — import `OpenRouterProvider`, `OpenRouterClient`, `OpenRouterProviderConfig`

### 3. Split `billing/usage.ts` (~500 lines after PRD 2 → 3 files)

This split applies to the post-PRD-2 state of the file, after plan lifecycle functions have been extracted.

#### `billing/tier.ts` (~25 lines) — NEW

Tier resolution. A single function with minimal dependencies.

**Functions moved:**

- `resolveUserTier(userId, dbClient?)` — Resolves user's subscription tier from the database
- `getUserTier` alias (if it still exists after PRD 2)

**External dependencies (2):**

- `@/lib/db/runtime` — `getDb`
- `@/lib/db/schema` — `users` table

**Consumers (currently importing from `billing/usage`):**

- `src/features/plans/api/preflight.ts`
- `src/features/jobs/regeneration-worker.ts`
- `src/lib/api/pdf-rate-limit.ts`
- `src/app/api/v1/plans/[planId]/retry/route.ts`
- `src/app/api/v1/plans/from-pdf/extract/route.ts`
- `src/app/api/v1/plans/[planId]/regenerate/route.ts`

#### `billing/usage-metrics.ts` (~175 lines) — NEW

Monthly usage metrics CRUD operations. All operations that create, read, or increment usage metric records.

**Functions moved:**

- `getCurrentMonth()` — Returns current month string
- `getOrCreateUsageMetrics(userId, month, dbClient?)` — Gets or creates monthly usage row
- `ensureUsageMetricsExist(userId, month, tx)` — Ensures row exists within transaction
- `incrementUsage(userId, dbClient?)` — Increments monthly generation count
- `incrementUsageInTx(userId, month, tx)` — Transaction-scoped increment
- `incrementPdfPlanUsage(userId, dbClient?)` — Increments monthly PDF plan count
- `incrementPdfUsageInTx(userId, month, tx)` — Transaction-scoped PDF increment
- `getUsageSummary(userId, dbClient?)` — Returns full usage summary for display
- `decrementUsageColumn(userId, columnName, dbClient?)` — Generic column decrement
- `decrementPdfPlanUsage(userId, dbClient?)` — Decrements PDF plan count
- `decrementRegenerationUsage(userId, dbClient?)` — Decrements regeneration count

**External dependencies (3):**

- `@/lib/db/runtime` — `getDb`
- `@/lib/db/schema` — `usageMetrics`, `users` tables
- `@/lib/logging/logger` — `logger`

**Consumers:**

- `src/lib/db/usage.ts` — `incrementUsage`
- `src/app/api/v1/user/subscription/route.ts` — `getUsageSummary`
- `src/app/api/v1/plans/stream/helpers.ts` — `incrementUsage`
- Various route files — decrement functions

#### `billing/quota.ts` (~200 lines) — NEW

Atomic transactional quota enforcement. Functions that perform check-then-increment within a transaction to prevent race conditions.

**Functions moved:**

- `atomicCheckAndIncrementUsage(userId, dbClient?)` — Atomic regeneration quota check + increment
- `atomicCheckAndIncrementPdfUsage(userId, dbClient?)` — Atomic PDF quota check + increment

**Deprecated functions (move here, then remove in PRD 4 if no consumers):**

- `checkRegenerationLimit(userId)` — Deprecated non-atomic regeneration limit check
- `checkExportLimit(userId)` — Deprecated non-atomic export limit check
- `checkPdfPlanQuota(userId)` — Deprecated non-atomic PDF quota check

**External dependencies (4):**

- `@/lib/db/runtime` — `getDb`
- `@/lib/db/schema` — `usageMetrics`, `users` tables
- `@/lib/logging/logger` — `logger`
- `./usage-metrics` — `ensureUsageMetricsExist`, `getCurrentMonth`, etc.
- `./tier` — `resolveUserTier`
- `./tier-limits` — `TIER_LIMITS`
- `./errors` — `UsageMetricsLockError`

**Consumers:**

- `src/app/api/v1/plans/[planId]/regenerate/route.ts` — `atomicCheckAndIncrementUsage`
- `src/app/api/v1/plans/from-pdf/extract/route.ts` — `atomicCheckAndIncrementPdfUsage`
- `src/features/plans/api/pdf-origin.ts` — `atomicCheckAndIncrementPdfUsage`

#### `billing/usage.ts` — transitional barrel, then delete

After all functions are extracted, `billing/usage.ts` can temporarily:

- Become a barrel re-export file (~20 lines) that re-exports from `tier.ts`, `usage-metrics.ts`, and `quota.ts`. This preserves backward compatibility while the split lands.

Then, as a follow-up, delete `billing/usage.ts` entirely and update all remaining consumers to import from the specific sub-modules.

**Outcome:** That follow-up has now landed. The temporary barrel served as a migration bridge, and `src/features/billing/usage.ts` has been deleted after all consumers moved to direct imports.

## Migration Strategy

### Order of Operations

1. **`attempts-helpers.ts` first** — Most impactful split (530 lines, 10 deps). Three consumers to update. Keep the split behavioral-neutral.
2. **`openrouter.ts` second** — Self-contained within `features/ai/providers/`. Two consumers to update.
3. **`billing/usage.ts` third** — Depends on PRD 2 completing first. Use a temporary barrel re-export only if it helps land the split safely, then remove it.

### Per-Split Execution

Each split follows the same pattern:

1. Create the new file(s) with the extracted functions. Preserve JSDoc and inline comments.
2. Update the original file to import from the new files (or delete the moved code).
3. If using a temporary barrel, update the original file's exports first, then follow with a direct-import cleanup that removes the barrel.
4. Run `pnpm type-check` to verify no type errors.
5. Run `pnpm test:changed` to verify no test failures.
6. Verify the original file's line count matches expectations.

### Consumer Impact

| Split                 | Production files to update                                          | Test files to update     |
| --------------------- | ------------------------------------------------------------------- | ------------------------ |
| `attempts-helpers.ts` | 3 (`attempts.ts`, `rate-limit.ts`, `orchestrator.ts`)               | Check for direct imports |
| `openrouter.ts`       | 1 (`router.ts`)                                                     | 1 (`openrouter.spec.ts`) |
| `billing/usage.ts`    | transitional barrel first, then ~16 production/test import rewrites | 5+ test files            |

## Verification

For each split:

1. `pnpm type-check` passes with zero errors.
2. `pnpm lint` passes (no unused imports, no circular dependency warnings).
3. `pnpm test:changed` passes for affected files.
4. Post-split line counts match expectations:
   - `attempts-helpers.ts`: ~90 lines (down from 530)
   - `openrouter.ts`: ~380 lines (down from 611)
   - `billing/usage.ts`: deleted after consumer import cleanup (down from ~500)
5. No new external dependencies introduced — each new file uses a subset of the original's dependencies.
6. All public exports maintain identical signatures and return types.

## Out of Scope

- Behavioral changes to any extracted function.
- Changing the `serviceDb` identity comparison pattern in `attempts-persistence.ts` (tracked in PRD 1 as a broader concern).
- Further splitting `openrouter.ts`'s Sentry span management (~110 lines in the `generate` method). This is a potential follow-up but the class is cohesive at ~380 lines.
- Splitting or restructuring test files. Tests update import paths only.
- Removing deprecated billing functions (`checkRegenerationLimit`, `checkExportLimit`, `checkPdfPlanQuota`). Deferred to PRD 4.
