# Detailed Lesson Content MVP

GitHub issue: https://github.com/saldanaj97/atlaris/issues/328

## Acceptance Criteria

- [ ] Module detail no longer shows placeholder prose for ready generated lessons.
- [ ] The app keeps the existing module/task model; no subtask table is added.
- [ ] Lesson content is generated lazily by unlocked module, not during initial plan creation.
- [ ] Missing lesson content requires an explicit user action before provider generation starts.
- [ ] Generated content is persisted and reused on refresh.
- [ ] The server validates exact task coverage before persisting generated content.
- [ ] Tier/model gating uses the existing AI model resolver/provider path.
- [ ] Lesson generation has its own tiered usage meter.
- [ ] Free-model usage is protected by hard quotas and high-cost route limiting.
- [ ] Locked modules do not trigger generation.
- [ ] Failed generation leaves a retryable state without corrupting existing content.
- [ ] Final validation includes targeted tests, `pnpm test:changed`, and `pnpm check:full`.

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

- [ ] Add an authenticated route for module lesson generation.
- [ ] Return typed states for ready, generating, failed, quota denied, not found, unauthorized, and provider failure.
- [ ] Keep the route thin and delegate generation work to the feature boundary.
- [ ] Ensure no service-role client is used in user-facing route code.

### Step 5 - Read Projection And UI

- [ ] Extend module detail read model with task lesson content and module generation status.
- [ ] Replace placeholder-content happy path with generated content rendering.
- [ ] Add explicit missing/generate, generating, ready, failed, and quota-denied UI states.
- [ ] Keep the missing/generate state clear that one click generates and caches the whole module batch.
- [ ] Keep resources and task progress controls visible with generated content.
- [ ] Keep module context visible during generation so the page does not feel blank or stalled.
- [ ] Ensure locked lessons/modules do not request content.

### Step 6 - Tests

- [ ] Unit test prompt/parser success and invalid output cases.
- [ ] Unit test content block rendering states.
- [ ] Unit test module detail read projection.
- [ ] DB/integration test persistence and ownership behavior.
- [ ] API contract test success, cached success, quota denied, failure, and unauthorized paths.
- [ ] Test idempotency/concurrency around duplicate generation requests.
- [ ] Run targeted changed tests.
- [ ] Run `pnpm test:changed`.
- [ ] Run `pnpm check:full`.

## Review

### Notes

- Research confirmed the app has modules and tasks, not subtasks.
- Research confirmed placeholder lesson content is generated client-side from `placeholder-content.ts`.
- Research confirmed schema source of truth is under `supabase/schema`.
- OpenRouter free-model limits make upfront bulk generation the wrong MVP strategy.
- Recommended MVP is explicit user-triggered module-batch generation with cached persistence.

### Follow-Ups

- [ ] Decide exact free/starter/pro lesson-generation limits.
- [ ] Decide whether paid tiers unlock paid models immediately or only higher limits at first.
