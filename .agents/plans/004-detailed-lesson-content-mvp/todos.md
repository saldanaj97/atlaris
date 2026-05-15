# Detailed Lesson Content MVP

GitHub issue: https://github.com/saldanaj97/atlaris/issues/328

## Acceptance Criteria

- [x] Module detail no longer shows placeholder prose for ready generated lessons.
- [x] The app keeps the existing module/task model; no subtask table is added.
- [x] Lesson content is generated lazily by unlocked module, not during initial plan creation.
- [x] Missing lesson content requires an explicit user action before provider generation starts.
- [x] Generated content is persisted and reused on refresh.
- [x] The server validates exact task coverage before persisting generated content.
- [x] Tier/model gating uses the existing AI model resolver/provider path.
- [x] Lesson generation has its own tiered usage meter.
- [x] Free-model usage is protected by hard quotas and high-cost route limiting.
- [x] Locked modules do not trigger generation.
- [x] Failed generation leaves a retryable state without corrupting existing content.
- [x] Final validation includes targeted tests, `pnpm test:changed`, and `pnpm check:full`.

## Tasks

### Step 1 - Schema And Contracts

- [x] Add module-level lesson-generation status/metadata.
- [x] Add task-level detailed lesson content payload.
- [x] Add schema constants/checks for content-size limits where needed.
- [x] Generate/apply Supabase migration.
- [x] Add shared runtime schemas for lesson content blocks and module-batch provider output.

### Step 2 - Generation Boundary

- [x] Build a module lesson-content prompt with plan, module, and ordered task context.
- [x] Add parser validation for exact task ID coverage.
- [x] Add ownership-scoped module/task loading for generation.
- [x] Enforce module lock state server-side before claim, quota, or provider work.
- [x] Add idempotent status transition for missing/failed to generating.
- [x] Reuse existing model resolver/provider factory for provider selection.
- [x] Record provider usage for lesson generation.
- [x] Persist all task lesson payloads and module status in one transaction.
- [x] Preserve/restore failed state on provider or parser failure.

### Step 3 - Quota And Tier Gating

- [x] Add lesson-generation limits to tier constants.
- [x] Add usage metric column or equivalent aggregate for lesson module generations.
- [x] Add reserve/compensate boundary for lesson generation usage.
- [x] Wire high-cost route rate limiting.
- [x] Add an operator kill-switch/config guard for lesson generation.

### Step 4 - API

- [x] Add an authenticated route for module lesson generation.
- [x] Return typed states for ready, generating, failed, quota denied, locked, not found, unauthorized, and provider failure.
- [x] Keep the route thin and delegate generation work to the feature boundary.
- [x] Ensure no service-role client is used in user-facing route code.

### Step 5 - Read Projection And UI

- [x] Extend module detail read model with task lesson content and module generation status.
- [x] Replace placeholder-content happy path with generated content rendering.
- [x] Add explicit missing/generate, generating, ready, failed, and quota-denied UI states.
- [x] Keep the missing/generate state clear that one click generates and caches the whole module batch.
- [x] Keep resources and task progress controls visible with generated content.
- [x] Keep module context visible during generation so the page does not feel blank or stalled.
- [x] Ensure locked lessons/modules do not request content.

### Step 6 - Tests

- [x] Unit test prompt/parser success and invalid output cases.
- [x] Unit test content block rendering states.
- [x] Unit test module detail read projection.
- [x] DB/integration test persistence, ownership, and locked-module behavior.
- [x] API contract test success, cached success, quota denied, locked, failure, and unauthorized paths.
- [x] Test idempotency/concurrency around duplicate generation requests.
- [x] Run targeted changed tests.
- [x] Run `pnpm test:changed`.
- [x] Run `pnpm check:full`.

## Review

### Notes

- Research confirmed the app has modules and tasks, not subtasks.
- Research confirmed placeholder lesson content is generated client-side from `placeholder-content.ts`.
- Research confirmed schema source of truth is under `supabase/schema`.
- OpenRouter free-model limits make upfront bulk generation the wrong MVP strategy.
- Recommended MVP is explicit user-triggered module-batch generation with cached persistence.
- Server-side lock enforcement now returns `409 locked` before claim/quota/provider work for owned modules gated by incomplete prior modules.
- Step 6 validation (2026-05-15): targeted lesson-content unit/integration specs (69 tests), `pnpm test:changed` (80 tests), and `pnpm check:full` — green locally.

### Follow-Ups

- [ ] Decide exact free/starter/pro lesson-generation limits.
- [ ] Decide whether paid tiers unlock paid models immediately or only higher limits at first.
