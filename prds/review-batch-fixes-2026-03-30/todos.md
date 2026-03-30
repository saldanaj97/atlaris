# Review Batch Fixes

## Scope

- [x] Workstream 1: Fix integrations route/UI findings.
- [x] Workstream 2: Fix AI settings UI, preferences validation, and plans stream model-resolution findings.
- [x] Workstream 3: Fix OpenRouter, provider-cost, and env validation findings.
- [x] Workstream 4: Fix DB usage schema/mapping, pricing snapshot, lifecycle usage wiring, and related test-fixture findings.

## Workstream 1

- [x] Verify and harden `src/app/api/v1/integrations/status/route.ts`.
- [x] Verify and harden integrations settings UI in `src/app/settings/integrations/components/*`.
- [x] Update integrations unit/integration tests.

## Workstream 2

- [x] Extract plans stream model resolution into a pure helper and update logging sites.
- [x] Simplify user preferences validation and AI settings UI behavior/copy.
- [x] Refactor model selector save flows and tighten typing/fallback handling.
- [x] Update plans-stream, model-preferences, model-validation, and selector tests.

## Workstream 3

- [x] Align OpenRouter cost contract/types with runtime behavior.
- [x] Harden OpenRouter response parsing and provider cost conversions.
- [x] Tighten env parsing/boolean fallback behavior.
- [x] Update OpenRouter, provider-cost, and env tests.

## Workstream 4

- [x] Re-verify each requested finding against the current owned files before editing.
- [x] Tighten DB usage schema constraints and record-usage typing/comments.
- [x] Add pricing snapshot runtime validation and related type/schema improvements.
- [x] Refactor usage-recording seams for better dependency injection and typed tests.
- [x] Update usage DB, lifecycle, fixtures, and helper tests.
- [x] Document any intentionally unmodified migration/read-boundary items that fall outside owned files.

## Review

- [x] Run targeted verification for each workstream.
- [x] Run formatting/lint/type-check/test commands for touched files.
- [x] Summarize deviations, risks, and follow-ups.

## Workstream 4 Review Notes

- Added schema-level non-negative checks for `inputTokens`, `outputTokens`, and `costCents` in `src/lib/db/schema/tables/usage.ts`.
- Kept the persisted `costCents` name unchanged after verification: the schema, DB column (`cost_cents`), and current callers are already aligned, so a rename here would be a no-op at best and a migration/API churn risk at worst.
- Added runtime parsing for `modelPricingSnapshot` plus stricter shared snapshot schema semantics.
- Reworked usage-recording tests to inject dependencies instead of module-mocking the adapter surface.
- Fixed the nested fixture override bug by deep-merging `ProviderMetadata.usage` overrides.
- Did not edit migration files or non-owned production read paths; the new DB checks are present in the schema definition, but rollout through a migration remains outstanding outside this owned file set.
