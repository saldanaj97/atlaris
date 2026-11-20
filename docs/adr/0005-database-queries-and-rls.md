# ADR 0005: Database queries, locking and RLS usage

- Status: Accepted
- Date: 2026-11-20
- Source: moved here from inline code comments when comments were banned in `src/` (see the `delete-comment` skill). Each entry is the original comment text, grouped by the file it sat in.

## Context

Queries run either on a request-scoped RLS client or on the service-role client, and most write paths rely on transactions, advisory locks or compare-and-set. The reasoning below was kept in code comments across `src/lib/db`.

## Decisions

### `src/lib/db/queries/admin/jobs-metrics.ts`

- `import` — Admin/monitoring queries that bypass RLS via the service-role client. Use these only for internal health checks and monitoring endpoints. Do not import them into user-scoped request flows.
- `dbClient: typeof serviceRoleDb` — Admin monitoring intentionally defaults to the service-role client.

### `src/lib/db/queries/attempts.ts`

- `class ReservationPlanNotFoundError extends Error` — The plan row was missing when a reservation locked it: deleted, never committed, or owned by someone else. Not a provider failure.
- (file or block level) — Server-owned generation persistence: requires explicit dbClient (AttemptsDbClient) in all params. Do not add default getDb() or make dbClient optional. Production callers pass serviceRoleDb from feature-owned generation boundaries after request auth and ownership checks. RLS-scoped clients are one dedicated session opened from POSTGRES_URL_NON_POOLING (createRlsConnection throws without it), so their JWT claims stay set for the whole session and nothing re-applies them inside a transaction (see docs/technical-debt.md). See supabase/AGENTS.md § "RLS Rules".

### `src/lib/db/queries/email-notification-deliveries.ts`

- `const ambiguityStartedAt` — Measure ambiguity from first claim time; reclaim must not reset the window.

### `src/lib/db/queries/email-notification-delivery-runs.ts`

- `const claimEmailNotificationDeliveryRun` — Claims a queued run from inside its workflow entrypoint. The workflow step attaches its own ID; accepting the same ID makes step replays idempotent and closes the start-to-first-step race.
- `async function advanceEmailNotificationDeliveryRun` — Advances exactly one completed page. The workflow ID and previous cursor are both compared so stale/reclaimed workflow attempts cannot double-count work.

### `src/lib/db/queries/generation-quality-issues.ts`

- `async function insertGenerationQualityIssues` — Records quality issues from a generation check or repair pass. Writes are server-owned, so `dbClient` must be the service-role client (or a transaction on it).

### `src/lib/db/queries/helpers/attempts-rate-limit.ts`

- `const countedAttempts` — One statement, so a plan deleted mid-read is counted exactly once.

### `src/lib/db/queries/helpers/jobs-helpers.ts`

- `function isRecord` — Type guard to check if a value is a record object (not null, not array).

### `src/lib/db/queries/helpers/plan-generation-status.ts`

- `async function countPlansContributingToCap` — Count plans that consume the user's plan quota (eligible + in-flight generating). Accepts a DB handle or transaction for atomic check-and-insert.

### `src/lib/db/queries/helpers/plans-helpers.ts`

- `interface LockedOwnedPlanQueryParams` — Parameters for {@link lockOwnedPlanById}. Unlike {@link OwnedPlanQueryParams}, `dbClient` is required because the query uses `.for('update')` which must run on the transaction connection to hold the row lock.

### `src/lib/db/queries/jobs/mutations.ts`

- `async function insertJobRecord` — Inserts a new job into the queue. For plan regeneration jobs with a planId, deduplicates by returning the existing active job id if one is already pending/processing. Uses a transaction with row locks to avoid race conditions. @param params - Job payload: type, planId (nullable), userId, data, priority @param dbClient - Required service-role or request client @returns Enqueue result with job id and whether it was deduplicated @throws Error if plan not found when deduplicating regeneration, or if insert fails
- `delete payloadForRetry.quota;` — The provider-start marker settles the current attempt. A retry gets a fresh attempt and must be allowed to settle exactly once for itself.

### `src/lib/db/queries/lesson-problem-reports.ts`

- `async function upsertLessonProblemReport` — Saves the learner's one report for a lesson in a single statement: the insert selects the task only when it sits in this module and plan, the plan belongs to the learner, the lesson has content, and its version matches the one the learner read; a second report replaces the first (ON CONFLICT). The stored version is the task row's own `lesson_content_updated_at`. JS dates carry milliseconds while Postgres stores microseconds, so the version check truncates the stored value to milliseconds. When nothing is written, one read (same RLS client) classifies why. It only picks the error; it never gates the write.

### `src/lib/db/queries/module-lesson-generation.ts`

- `async function revertModuleLessonGeneratingToNotGenerated` — After `generating` claim, returns row to `not_generated` when work never ran (e.g. flag/quota kill switch). Clears in-flight timestamps and error fields. Keeps lessonGenerationMetadata so status polls can match workflowRunId and stop.
- `async function markModuleLessonProviderStarted` — CAS: merge `providerStartedAt` into owned module JSON metadata while status is `generating`. Throws unless exactly one row matches.
- `async function claimModuleLessonGenerationOrDescribe` — CAS: `not_generated` \| `failed` → `generating` for an owned module row. Surfaces `already_ready`, `in_flight`, and `not_found` without mutating. Requires an owned parent plan with `generationStatus = 'ready'`.
- `async function commitModuleLessonGenerationFailure` — Marks module lesson generation failed without touching task `lesson_content` (own transaction), recording `usage` in it when given, so a retried failure step that finds the module no longer generating records nothing twice.

### `src/lib/db/queries/modules.ts`

- `async function getModuleDetailRows` — Module rows for module-detail read projection (plan-scoped ownership). Requires an explicit request RLS or service-role client.

### `src/lib/db/queries/plan-ai-budget.ts`

- `async function sumUserAiSpendMicrousd` — One user's AI spend in micro-USD since `since`, costed like {@link sumPlanAiSpendMicrousd}. Usage events keep `user_id` when their plan is deleted, so deleting a plan does not reset the total. `plan_research` is left out on purpose: its rows are deleted with the plan, so counting them would let a user reset research spend by deleting a plan. Successful grounded research is therefore not yet in this total; grounded generation stays off through launch (DEV-163, DEV-208).
- `const onFreeTrial` — coalesce keeps a null status false rather than null, so `not()` stays true.
- `async function sumTierAiSpendMicrousd` — AI spend in micro-USD since `since` by every user now on `tier` and not on a free trial (trials have their own pool), research runs included. Spend follows the user's current tier, so a user who upgrades mid-day carries that day's spend into the new tier. Needs the service-role client: RLS would limit the sum to one user.
- `async function sumTrialAiSpendMicrousd` — AI spend in micro-USD since `since` by every user now on a free trial, research runs included. Needs the service-role client, like `sumTierAiSpendMicrousd`.
- `async function recordDiscardedCallUsage` — Records the usage an AI call's error carries (`billedUsageOf`) against the plan, as its own usage event: OpenRouter billed the call even though its output was discarded. Call it in the workflow step that made the call, before the step throws, since a failed step attempt keeps no result. Does nothing for an error without usage, and never throws, so the call's own error is the one that propagates. Writes are server-owned (the Worker's invocation client).
- `async function insertGenerationBudgetCuts` — Records steps a plan's AI spend ceiling cut. Writes are server-owned, so `dbClient` must be the service-role client (or a transaction on it).

### `src/lib/db/queries/plan-free-router-fallback.ts`

- `async function getPlanFreeRouterFallback` — Reads the free-router flags (DEV-175): `metadata.provider.freeRouterFallback` on the plan's latest successful attempt, and `freeRouterFallback` on each ready module's lesson metadata. A later success on a paid model replaces both, so the result describes only the content the plan shows now.

### `src/lib/db/queries/plan-list.ts`

- `const STATUS_SORT_RANK` — Intentional lifecycle order: not_started, active, completed, paused, generating, failed.

### `src/lib/db/queries/plan-research.ts`

- `const citationNumber` — Orders `S1`, `S2`, …, `S10` numerically rather than as text.
- `async function insertPlanResearch` — Stores one research run and its sources atomically. Writes are server-owned, so `dbClient` must be the service-role client (or a transaction on it).

### `src/lib/db/queries/plans.ts`

- `import type` — Plan-related queries for learning plans, summaries, detail views, and generation attempts. Callers must pass the request RLS client or an explicit service-role client.

### `src/lib/db/queries/tasks.ts`

- `async function getRecentLearningActivityForUser` — Newest task status changes for a user, with the task title and plan topic. Pass `planId` to keep only one plan's events, so the limit applies after that filter rather than before it.
- `async function setTaskProgress` — Sets or updates the progress status for a specific task for a user. Validates task ownership in SQL before updating. If a progress record does not exist, it creates one; otherwise, it updates the existing record. @param userId - The ID of the user. @param taskId - The ID of the task. @param status - The new progress status to set. @param dbClient - Required TasksDbClient used for transactions/internal testing. @returns A promise that resolves to the task progress record. @throws Error if the task is not found or access is denied
- `async function setTaskProgressBatch` — Batch updates task progress for multiple tasks in a single transaction. Validates ownership for all tasks via a single query, then bulk upserts. Falls back to the single-update path only when no explicit plan/module scope is required.

### `src/lib/db/queries/types/attempts.types.ts`

- `type AttemptsDbClient` — Db client for attempts. Must be request-scoped {@link getDb} in API routes to enforce RLS. When using the RLS client returned by {@link getDb}, callers are responsible for releasing it by calling its `cleanup()` method. Do this in a `finally` block.
- `idempotencyKey?: string;` — Stable logical operation key used to recover a workflow reservation replay.
- `allowedGenerationStatuses?: ReadonlyArray` — If set, plan must have one of these statuses (takes precedence over requiredGenerationStatus).
- `requiredGenerationStatus?: InferSelectModel` — If set (and allowedGenerationStatuses not set), plan must have this exact status.

### `src/lib/db/queries/users.ts`

- (file or block level) — User-related queries for account lookup and creation. Callers must pass the request RLS client or an explicit service-role client.
- `async function getOrCreateUser` — Creates a user when absent, or returns the row created by a concurrent request. Email conflicts belonging to a different auth identity remain database errors. Only `auth_user_id` arbitrates the conflict, so a concurrent insert of the same row can still fail on `users_email_unique`. That violation is resolved by re-reading this auth identity; it is re-raised when no row for it exists. The re-read needs a non-transactional client: a failed statement aborts a surrounding transaction.

### `src/shared/types/db.types.ts`

- `type PlanSummary` — Summary view of a plan with computed progress metrics. `attemptsCount` is populated only when the originating query includes generation attempt metrics. Callers must handle `undefined` for lightweight paths that skip those extra reads to avoid additional query cost.

## Consequences

The code no longer carries this rationale inline. A change that would alter one of the behaviors above should update this ADR in the same pull request, and a new non-obvious decision belongs in an ADR, not in a comment.
