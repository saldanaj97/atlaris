# Plan

## Step 1.0 - Confirm findings and ownership

1. Re-verify each requested finding against the current code before editing.
2. Split the review list into disjoint workstreams so parallel agents avoid file overlap.
3. Keep production changes and their matching tests in the same workstream when practical.

## Step 1.1 - Workstream 1: Integrations

1. Update `src/app/api/v1/integrations/status/route.ts` to:
   - import and use the server logger,
   - type provider with the schema enum type, and
   - add structured success/error logging with try/catch.
3. Update integrations settings UI to:
   - validate status API payloads with Zod,
   - drive OAuth redirects from `integration.provider`, and
   - guard `IntegrationCard` button behavior when callbacks are absent.
4. Update affected integrations tests to use stable semantic queries and cover new behavior.

## Step 1.2 - Workstream 2: AI settings and plans stream resolution

1. Extract the inline model-resolution logic from `src/app/api/v1/plans/stream/route.ts` into a pure helper returning `{ modelOverride?, resolutionSource, suppliedModel? }`.
2. Keep logging in the route and add focused unit/integration coverage for resolution priority and successful stream completion.
3. Replace `z.union([... , z.null()])` with `.nullable()` in preferences validation.
4. Refactor AI settings UI components to:
   - harden error parsing/logging,
   - remove redundant save-flow duplication,
   - tighten null checks/return types/type aliases,
   - warn on unknown tier defaults, and
   - simplify user-facing copy.
5. Update affected tests to use derived model constants and less brittle assertions.

## Step 1.3 - Workstream 3: OpenRouter, provider cost, and env

1. Replace the thin `openrouter-cost-contract` module with a real contract surface or inline the constant if that is cleaner after verification.
2. Align OpenRouter runtime parsing with typed fields, including array exclusion for `usageObjectPresent` and clearer commentary where streaming/non-streaming behavior differs.
3. Harden `microusdIntegerToBigint` and add coverage for invalid numeric inputs.
4. Tighten env number/boolean normalization to reject non-finite numeric strings and treat empty-string booleans as missing when a fallback is provided.
5. Update OpenRouter/env/provider-cost tests to reflect the hardened behavior.

## Step 1.4 - Workstream 4: DB usage schema, pricing snapshot, lifecycle tests

1. Add consistent non-negative DB checks for usage numeric columns.
2. Simplify nullable typing in `src/lib/db/usage.ts`, document partial-usage provider-cost behavior, and verify whether the requested `costCents` rename is actually warranted or would be an unsafe semantic/schema expansion.
3. Add runtime validation for `modelPricingSnapshot` at read boundaries and improve snapshot typing/schema semantics.
4. Introduce better dependency-injection seams for usage-recording helpers/adapters so tests do not rely on brittle module mocks and unsafe casts.
5. Fix related fixture/test issues, including deep merge behavior, reusable DB helpers, and lifecycle coverage for partial/missing-field usage.

## Validation Steps

1. Run `pnpm test:changed` after the code changes settle.
2. Run targeted Vitest commands for touched suites when failures need isolation.
3. Run `pnpm lint:changed` and `pnpm type-check` if the touched surface or failures justify it.

## Issue Verification and Closure

1. Walk the original review list and confirm each item is either fixed, already satisfied, or intentionally left unchanged with justification.
2. Summarize the split by workstream, files changed, verification commands, and any remaining risks.
