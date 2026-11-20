# ADR 0002: Plan and lesson generation pipeline, job queue and regeneration

- Status: Accepted
- Date: 2026-11-20
- Source: moved here from inline code comments when comments were banned in `src/` (see the `delete-comment` skill). Each entry is the original comment text, grouped by the file it sat in.

## Context

Plan generation runs as reserved attempts handed to the jobs Worker, with grounded research, outline and lesson stages, quality checks, regeneration and polling. The reasoning below was kept in code comments across `src/features/plans`, `src/features/lesson-content`, `src/features/job-queue` and their callers.

## Decisions

### `src/app/(app)/plans/[id]/actions.ts`

- `async function batchUpdateTaskProgressAction` — Server action to batch update multiple task progress records from the plan overview page. Delegates validation, scope checks, persistence, and path selection to `batchUpdateTaskProgressCore`. Auth and RLS boundary: - Wrapped by `requestBoundary.action()`, which runs `withServerActionContext()` before the callback. - That boundary authenticates via `getEffectiveAuthUserId({ strict: true })` and, outside test runtime, installs a request-scoped RLS Drizzle client into request context (`runWithAuthenticatedContext`). - The callback receives `actor` and `db` from the boundary; pass `db` to query functions instead of calling `getDb()` ad hoc inside the action. - Query-layer ownership checks in `batchUpdateTaskProgressCore` remain required for defense in depth. React Doctor note: `server-auth-actions` is a false positive for actions using this wrapper.

### `src/app/(app)/plans/[id]/components/FreeRouterFallbackNotice.tsx`

- `function FreeRouterFallbackNotice` — Tells a paid user that some of the plan ran on the free router because their paid model was unavailable (DEV-175). Regeneration is mentioned only when the page offers it.

### `src/app/(app)/plans/[id]/components/RegeneratePlanDialog.tsx`

- `case API_ERROR_CODES.AI_BUDGET_EXHAUSTED:` — The server message names the reset date (DEV-208).
- `function RegeneratePlanDialog` — "Regenerate plan" trigger and dialog (JCS-162): reason chips and an optional note, posted to the regenerate route. On success the page refreshes into its server-backed "Regenerating" state.
- `const settle` — Clears the busy state unless a newer submit took over (no `finally`: React Compiler cannot lower it).

### `src/app/(app)/plans/[id]/modules/[moduleId]/actions.ts`

- `import type` — Server actions for module detail page. RLS enforcement note: - Uses authenticated RLS client to ensure proper tenant isolation - Module ownership is validated through plan ownership

### `src/app/(app)/plans/[id]/modules/[moduleId]/components/LessonAccordionTriggerContent.tsx`

- (file or block level) — Title, then a meta row (Locked, time) under it, so on phones the badge and time never squeeze the title or push the marker onto its own line.

### `src/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleHeader.tsx`

- (file or block level) — Inline icons after a no-break space stay with the title's last word instead of wrapping onto a line of their own.

### `src/app/(app)/plans/[id]/modules/[moduleId]/components/ReportLessonProblemDialog.tsx`

- `const REQUEST_TIMEOUT_MS` — A sent report can't block the dialog for longer than this.
- `function ReportLessonProblemDialog` — "Report a problem" trigger and dialog for one lesson (DEV-231): one reason and an optional note, saved as the learner's one report for the lesson. The dialog opens empty every time; a new report replaces the earlier one.
- `const settle` — Clears the busy state unless a newer submit took over (no `finally`: React Compiler cannot lower it).
- `fail` — Network error or timeout: the report may have been saved. Retrying is safe because it replaces the learner's one report.
- (file or block level) — aria-invalid is not allowed on radios, so the group carries it.
- (file or block level) — aria-disabled, not disabled, so focus stays on Send while sending.

### `src/app/(app)/plans/[id]/modules/[moduleId]/components/generationPanelState.ts`

- `type PanelState` — What the panel can truthfully say: a run is in progress, or it failed. The module page starts generation on its own when lessons are missing, so a module that still has none and has no run going got there through a failed start or a run that rolled back; it reads as failed, with a retry.

### `src/app/(app)/plans/[id]/modules/[moduleId]/components/useModuleLessonGeneration.ts`

- `if` — A matching workflow run proves the queued request claimed and settled. Otherwise, wait for a visible claim before treating it as terminal.
- `if` — AI spend refusals name when generation is available again (DEV-208).

### `src/app/(app)/plans/[id]/modules/[moduleId]/not-found.tsx`

- `function ModuleNotFound` — Rendered when a module is missing or not accessible to the viewer. The copy stays neutral so it does not confirm that another user's module exists.

### `src/app/(app)/plans/[id]/not-found.tsx`

- `function PlanNotFound` — Rendered when a plan is missing or not accessible to the viewer. The copy stays neutral so it does not confirm that another user's plan exists.

### `src/app/(app)/plans/[id]/plan-page-data.ts`

- `async function loadPlanRegenerationState` — Regeneration state for the plan overview header (JCS-162). Offered only when grounded generation is on for the viewer's tier; the active-job check keeps the "Regenerating" state across reloads. Call after the plan loaded.
- `async function loadPlanFreeRouterNotice` — The free-router notice for a paid viewer (DEV-175), or null when nothing the plan shows ran on the free router. Free plans always run on the free router, so free viewers never get one. Call after the plan loaded.

### `src/app/(app)/plans/[id]/types.ts`

- `type FreeRouterNotice` — Content a paid plan shows that the free router generated (DEV-175).

### `src/app/(app)/plans/new/components/plan-form/UnifiedPlanInput.tsx`

- `const topicRef` — Ref so the reset effect can read the current topic without it being a dep.

### `src/app/(app)/plans/new/hooks/useStartAiPlanGeneration.ts`

- `posthog.capture` — Track plan creation attempt with non-PII form metadata.
- `if` — The 202 arrives before the plan page loads; stay locked so the form cannot submit a second plan in that window.

### `src/app/(app)/plans/plans-progress-theme.ts`

- `locked:` — Locked reads from the dashed border, lock icon and "Locked" badge, not from fading the text, so every label keeps full contrast.

### `src/app/api/v1/plans/[planId]/modules/[moduleId]/tasks/[taskId]/problem-report/route.ts`

- `const PUT: PlainHandler` — PUT /api/v1/plans/:planId/modules/:moduleId/tasks/:taskId/problem-report Saves the learner's one report for a lesson, replacing an earlier one (DEV-231). A 400 names the bad field in `details.field` (`reason` \| `note`).

### `src/app/api/v1/plans/[planId]/retry/route.ts`

- `...` — Only a Pro writer pick is ever honored, so skip the read below Pro.

### `src/app/api/v1/plans/[planId]/status/route.ts`

- `const GET` — GET /api/v1/plans/:planId/status Returns the status of a learning plan's generation process. Reads the generation status stored on the learning_plans row, not the job_queue table.

### `src/app/api/v1/plans/route.ts`

- `...` — Only a Pro writer pick is ever honored, so skip the read below Pro.

### `src/features/job-queue/email-delivery-dispatch.ts`

- `async function dispatchEmailDeliveryToWorker` — Sends `POST /v1/email-delivery/runs` for a manual `start`, `resume`, or `replay_reviewed` of one logical run. The Worker reserves the run and starts its Workflow instance. Never throws.

### `src/features/job-queue/module-lessons-dispatch.ts`

- `async function dispatchModuleLessonsToWorker` — Sends `POST /v1/module-lessons/start` for a provisionally claimed module (design note, Decision 4, App handling). The caller reverts the claim on `disabled` or `failed`. Never throws.

### `src/features/job-queue/plan-generation-dispatch.ts`

- `async function dispatchPlanGenerationToWorker` — Sends `POST /v1/plan-generation/start` for an attempt the app already reserved (design note, Decision 4, App handling). The caller settles the reservation as a retryable failure on `disabled` or `failed`. Never throws.

### `src/features/job-queue/queue.ts`

- `import type` — Queue operations for background workers. All functions bind the service-role DB client because queue operations run in worker context without a user session. This module exists to centralize that binding and prevent service-role imports from spreading to multiple consumer files. This is intentionally a thin wrapper over db/queries/jobs.ts rather than a second abstraction layer. The value here is the single service-role binding point, not additional business logic.

### `src/features/job-queue/regeneration-dispatch.ts`

- `async function dispatchRegenerationToWorker` — Sends `POST /v1/regeneration/enqueue` for an inserted `job_queue` row. Any outcome other than 2xx leaves the row `pending`; the Worker's 15-minute sweep re-sends it (design note, Decision 4, App handling). Never throws.

### `src/features/job-queue/regeneration-run.ts`

- `import type` — Plan regeneration run for the Cloudflare jobs Worker's queue consumer (docs/architecture/regeneration-worker-runbook.md): claim (CAS) → reserve attempt → process → finalize. `job_queue.payload.workflow` and the attempt's workflow metadata carry `provider: 'cloudflare-queue'` with the queue message ID as `runId`; fatal outcomes terminalize the job here; finalization starts module lessons through the injected `startModuleLessons`.
- `readonly guidance: string | null;` — Reasons and note as a prompt block (JCS-162), or `null`.
- `type GroundedRegenerationStages` — Grounded regeneration stages (JCS-162), injected by the Worker: research (JCS-158) and outline checks, verifier and repair (JCS-159).
- `readonly isEnabled:` — The `grounded-generation` flag for `tier` (fail closed).
- `readonly outlineQuality:` — The outline to keep after checks, verifier and one repair, with the usage of those calls.
- `readonly groundedWriterModelId: string | null;` — The grounded outline writer pick (JCS-169); standard slots never apply.
- `let research: ResearchBrief | null` — Grounded (JCS-162): the outline writer reads research the provider-start callback produced, so it is created before research runs.
- `toSettle` — Verifier and repair spend counts toward the plan's AI ceiling (JCS-170).
- `async function terminalizeAbandonedRegenerationRun` — Called after the queue's last delivery of a message failed unexpectedly. Fails the job only when this run still owns it. A job that was never claimed stays `pending` for the sweep. Returns whether the job was terminalized.

### `src/features/job-queue/regeneration-sweep-query.ts`

- `async function claimRegenerationSweepJobIds` — Selects due `pending` regeneration rows untouched for 10 minutes and bumps their `updated_at` in the same statement, so the next tick does not re-send a row whose message is still queued. Highest priority, then oldest, first.

### `src/features/lesson-content/generation-flag.ts`

- `async function resolveModuleLessonGenerationEnabled` — Fail closed when the Flagship flag cannot be evaluated.

### `src/features/lesson-content/grounded-lesson-prompt.ts`

- `function buildLessonBriefPart` — The brief with its sources and citation rules. Identical for every lesson in the plan, so it leads the prompt and carries a cache breakpoint.
- `function buildModuleOutlinePart` — The plan, the module and every lesson in it. Identical for every lesson in the module, so it carries the second cache breakpoint.
- `readonly reason?: string;` — Regeneration reason block (JCS-162 fills it); not cached.

### `src/features/lesson-content/grounded-lesson-writer.ts`

- `async function writeGroundedLesson` — One lesson call with no tools. `prompt_cache_key` is the plan ID, so every lesson in the plan routes to the cache its shared prefix wrote. Later models in `models` are OpenRouter fallbacks for a failed primary.
- `function parseGroundedLessonText` — Parses one lesson: the first JSON object in the text, the batch envelope with exactly this task, then `sourceIds` from the body's `[S1]` markers (any value the model sent is replaced) and the citation checks. Throws `ParserError`; a citation issue is a `validation` failure, so the lesson gets its one retry.

### `src/features/lesson-content/lesson-checks.ts`

- `const LESSON_BLOCK_REF` — `blockRef` for a problem with the lesson as a whole, not one block.
- `const LESSON_LENGTH_BUDGET_TOLERANCE` — The body may run this far past the prompt's suggested budget before it counts as too long. The budget is a hint, so the margin is wide.
- `function runLessonCodeChecks` — Structural code checks on one lesson, run on every tier: the block contract, a completion_criteria block, well-formed takeaways, aligned table borders, the length budget and the 3a citation checks. Rules are general, never about a topic. Pure; an empty list passes. A lesson that breaks the block contract gets only the schema issues.

### `src/features/lesson-content/lesson-citation-checks.ts`

- `type LessonIssue` — One problem found in a lesson. `blockRef` points into the lesson JSON: `blocks[2]`, `blocks[4].items[1]` or `sourceIds`. Same shape as the outline's `OutlineIssue`, so the lesson verifier (JCS-161) can add its own.

### `src/features/lesson-content/lesson-repair.ts`

- `async function runLessonRepair` — One repair pass on a lesson: the writer models rewrite the flagged blocks (or the whole lesson for a lesson-level issue) through the repair preset. Starter and pro add the advisor tool with `tool_choice: required`; free runs without it, as does a repair the plan's AI ceiling cut the advisor from (`withAdvisor: false`). Throws on provider or output errors.
- `readonly withAdvisor?: boolean;` — `false` drops the advisor tool (JCS-170). Defaults to `true`.

### `src/features/lesson-content/lesson-text.ts`

- `const INLINE_PATTERN` — Inline code, whose content stays literal, or `**bold**`. Bold markers can't touch a word on their outer side, so `a**b + c**d` stays code.
- `function tabularSegment` — A run of tabular lines as a segment. Anything short of a well-formed table (a box table, no separator, uneven columns) keeps its characters in a monospace block, so no content is dropped or put in the wrong column.
- `while` — A fence the model never closed runs to the end of the block.

### `src/features/lesson-content/module-lesson-prompts.ts`

- `function buildModuleLessonBatchUserPrompt` — User prompt: untrusted delimiter blocks — plan, module metadata, ordered tasks.

### `src/features/lesson-content/parse-module-lesson-batch.ts`

- `function assignTaskIdsByPosition` — Maps output tasks to `expectedOrderedTaskIds` by position. The prompt lists tasks in DB order, so `tasks[i]` belongs to the i-th expected task. An echoed id that matches no expected task (garbled or invented) is replaced with the expected id, even when every id is garbled. An id that names a different expected task means the model reordered or duplicated lessons, so the batch is rejected.

### `src/features/lesson-content/run-module-lesson-generation-work.ts`

- `readonly freeRouterFallback?: true;` — A paid tier's lessons were served by the free router (DEV-175).
- `readonly freeRouterFallback?: true;` — The primary is the free router only because the guardrail left no paid default.
- `async function resolveModuleLessonProvider` — Current tier, then the explicit override or the saved lesson model. A paid plan at its AI ceiling (JCS-170) runs the lesson on the free router.
- `function reportLessonRouteFallback` — Warns when OpenRouter served a paid-tier lesson from a fallback route model instead of the resolved primary (DEV-180). Only routes that list fallbacks qualify; a free-router fallback serves a concrete `:free` model, so the served name is compared with the primary, not the fallback list. Returns whether it warned.
- `async function generateModuleLessonRawBatch` — Marks the provider started, calls it, and buffers the stream into raw text (capped at `MAX_RAW_RESPONSE_CHARS`). `onProviderStarted` fires once the marker is persisted; after that a failure must not revert the claim.
- `async function recordModuleLessonGenerationFailure` — Marks the module `failed`. If that write fails and the provider never started, reverts the claim instead. Never throws.
- `async function runModuleLessonGenerationWork` — Provider + persist after a successful CAS claim. Safe for workflow replay because it does not call `claimModuleLessonGenerationOrDescribe()`.

### `src/features/lesson-content/start-module-lesson-generation-workflow.ts`

- `async function startModuleLessonGeneration` — Claims the module, then starts its generation on the jobs Worker. The `module-lesson-generation` Flagship flag must be enabled before a run is created (fail-closed).

### `src/features/plans/api/create-plan-request.ts`

- `return` — Payload logging must not break generation when unusual getters/proxies throw.
- `async function parseCreatePlanRequest` — Reads and validates a create-plan JSON body for `POST /api/v1/plans`. Logs structural payload metadata only (never the topic or notes). @param logPrefix Leads the log messages, e.g. `Plan create`. @param sentryRoute The Sentry `route` tag when the payload log fails. @throws ValidationError for malformed JSON or an invalid body.
- `extra:` — No authUserId: Sentry cannot delete one user's events (DEV-184).

### `src/features/plans/cleanup.ts`

- `import type` — Use the store function directly so failure updates run on the same transaction handle as SELECT … FOR UPDATE.
- `type CleanupStuckPlansDependencies` — Marks plans stuck in 'generating' status for longer than the threshold as 'failed'. Uses a generous threshold (15min) to avoid marking slow-but-active generations as failed. Rows are locked inside a transaction before failure transitions so cleanup does not race concurrent generation state updates.
- `async function cleanupOrphanedAttempts` — Finalizes orphaned 'in_progress' generation attempts older than the threshold. Sets classification to 'timeout' for attempts that were never completed. Rows are locked inside a transaction before updates so cleanup does not race concurrent generation state updates.
- `const candidatePlans` — Lock the shared plan lifecycle key before locking module rows so cleanup cannot race child claims, parent deletion, or parent replacement.
- `async function runPlanCleanupMaintenance` — Service-role entrypoint for the internal plan cleanup maintenance route.

### `src/features/plans/contracts/plan-generation.types.ts`

- `readonly groundedWriterModelId?: string | null;` — Leads the grounded outline writer: a `?model=` override or the saved Pro writer pick. Absent on runs started before JCS-169: the tier's writers.

### `src/features/plans/formatters.ts`

- `function buildPlanOverviewDescription` — One-sentence plan summary. Topics are often stored as a goal such as "Learning Spanish", so the leading learn verb is dropped before the sentence supplies its own ("learning Spanish", not "learning Learning Spanish").

### `src/features/plans/lesson-problem-reports/validation.ts`

- `import` — Request contract for reporting a problem with a lesson (DEV-231). Client-safe: the dialog reads the field names from here.
- `type LessonProblemReportField` — The form field a 400 response is about, sent as `details.field` so the dialog can put the error on the right field.

### `src/features/plans/lifecycle/factory.ts`

- `import type` — Factory for creating a fully-wired PlanLifecycleService instance. Creates a PlanLifecycleService with all collaborators wired to a single DB connection. Design: All lifecycle operations (plan creation, generation, generation finalization) use the same database connection. This prevents the "closed connection" bug where Connection 1 (request-scoped) was used for lifecycle operations after withAuth's finally block closed it. DB client scoping (server-owned writes): - Plan create/retry sessions: service-role client for generation persistence after request auth and ownership checks at the route boundary - Workers: service-role client (same server-owned write boundary) - Reads and pre-write access checks: request-scoped RLS via getDb()

### `src/features/plans/lifecycle/generation.ts`

- `async function validateReservation` — Replay check for a held reservation: `already_finalized` when the attempt is `success` or `failure`, `undefined` while it is still in progress on a `generating` plan, and a thrown error for a stale reservation.

### `src/features/plans/lifecycle/plan-persistence-store.ts`

- `const updated` — Eligibility may flip false→true only when the plan already owns a cap slot.
- `async function applyPlanGenerationFailureUpdate` — Failure policy after reservation / generation: - Last-good (`isQuotaEligible=true`): restore `ready`, keep eligible, leave modules. - Never-usable (`isQuotaEligible=false`): mark `failed`, stay ineligible (releases a generating reservation). Attempt/job rows record the failure separately.

### `src/features/plans/lifecycle/service.ts`

- `reservation?: AttemptReservation;` — When set, skips `reserveAttemptSlot` so workflow replay (activity retry or worker recovery) does not double-reserve. Implementations must validate the reservation against current DB state before provider work.
- `async createPlan` — Create a new AI-origin learning plan. Flow: check attempt cap → resolve tier → check requested duration cap → normalize duration → check normalized duration cap → validate topic → atomic insert @returns A discriminated union result — never throws for lifecycle outcomes.
- `async processGenerationAttemptWithReservation` — Same as {@link processGenerationAttempt} but reuses an existing reservation (for workflow replay after claim). Safe for workflow replay because it does not call `reserveAttemptSlot` again; the generation port validates the reservation against current DB state before provider work.
- `async settleReservationRejection` — Settles a reservation rejection without reserving again. Start paths that already called `reserveAttemptSlot` must use this instead of {@link processGenerationAttempt}.
- `async settleReservedAttemptFailure` — Settles a reserved attempt that failed before provider work (workflow-start failure, regeneration admission-deny). Production callers must use this instead of `commitPlanGenerationFailure`.

### `src/features/plans/lifecycle/types.ts`

- `type PlanInsertData` — Data passed to the persistence port for atomic plan insertion.
- `type SubscriptionRequired` — The actor has no active subscription, so no generation can start.
- `type CreatePlanResult` — Discriminated union of all possible outcomes from plan creation. The service never throws for these expected lifecycle outcomes.
- `readonly groundedWriterModelId?: string | null;` — The grounded outline writer pick; only the jobs Worker reads it (JCS-169).
- `type GenerationAttemptResult` — Discriminated union of all possible outcomes from a generation attempt. The service never throws for these expected lifecycle outcomes.

### `src/features/plans/outline/checks.ts`

- `function isPacedInput` — Pacing (`pacePlan`) trims a plan with a deadline to fit its hours: it drops lessons, and at very low capacity whole modules, without changing module estimates. Checks skip what that trim causes, or a repair (paced again) could never clear it.
- `function checkOutlineTime` — Module minutes must match their lessons' sum, no lesson may exceed a week's hours, and with a start date and deadline the lessons must fit the hours. On a paced plan a module may estimate more than its remaining lessons.
- `const weeks` — No start date: the budget would depend on the clock, which a replayed workflow must not read.

### `src/features/plans/outline/contract.ts`

- `const OUTLINE_SCOPE_CONTRACT` — Title-scope rules sent with every grounded outline, verifier and repair call. General rules only: never wording for a particular topic.
- `function buildResearchBriefPart` — The research brief as a cached prompt part: it is the stable prefix the outline, verifier and repair calls share. Sources are listed by key so the brief's `[S1]` citations resolve.

### `src/features/plans/outline/grounded-writer.ts`

- `async function sendGroundedJsonCall` — One grounded JSON request: the model route, preset and prompt parts, read to the end so the metadata is complete. Throws `ProviderInvalidResponseError` when the output holds no JSON object; the error carries the call's billed usage (`billedUsageOf`).
- `guidance?: string | null;` — Regeneration feedback (JCS-162), after the request.

### `src/features/plans/read-projection/lesson-sources.ts`

- `const CitedSourceIdsSchema` — Narrow read of the citation keys a lesson cites (`sourceIds`, added to lesson content by JCS-160). Parsed here rather than through `LessonContentSchema` so the reader does not depend on that field's schema.

### `src/features/plans/read-projection/module-detail.ts`

- `function buildModuleDetailReadModel` — Assembles module-detail UI read-model from `getModuleDetailRows` output. Returns `null` when `moduleMetricsRows` and current `module.id` drift (defensive consistency). `researchSources` are the plan's sources; each lesson lists only those it cites.

### `src/features/plans/read-projection/service.ts`

- `getRecentLearningActivityForUser` — A Free user with a selected plan can only see that plan's activity, so filter in SQL; otherwise newer events on locked plans could fill the limit and leave the feed empty.
- `const recentActivity` — Locked plans keep their topic but not their content, so task titles stay out.

### `src/features/plans/read-projection/types.ts`

- `type ModuleDetailTask` — Task row for module-detail page (persisted progress as `status`, not nested progress row).

### `src/features/plans/regeneration-orchestration/admission.ts`

- `function buildPersistedRegenerationInput` — Effective regen input: topic comes from the persisted plan; notes are intentionally undefined because plans do not persist them. Allowed overrides: skillLevel, weeklyHours, learningStyle, startDate, deadlineDate.
- `function resolveRegenerationPolicyDenial` — Free deny takes precedence over duration; a grounded regeneration (JCS-162) is open to Free, capped per plan at provider start. Does not clamp dates.

### `src/features/plans/regeneration-orchestration/deps.ts`

- `countPlanRegenerations:` — This plan's regenerations that reached provider start, for the per-plan grounded cap (JCS-162). Settled again at provider start.
- `rateLimit:` — Invoked after active-job dedupe passes and before enqueue. Must match {@link checkPlanGenerationRateLimit} semantics (throws RateLimitError when exceeded).
- `dispatch:` — Must not throw; a failed hand-off leaves the job pending for the Worker's sweep.

### `src/features/plans/regeneration-orchestration/paused-flag.ts`

- `async function isRegenerationPaused` — Whether the `regeneration-paused` flag stops new regeneration requests. Fail open: an evaluation error means "not paused", so a Flagship outage does not become a regeneration outage; per-tier quotas still cap cost. The failure is reported to Sentry like the site gate's flag reads.

### `src/features/plans/regeneration-orchestration/reasons.ts`

- `import` — Why a learner asked for a new version of a plan (JCS-162): the chips the regenerate dialog offers, an optional note, and the code-owned guidance each chip adds to the research, outline and lesson prompts. Guidance is general on purpose; only the fenced note carries the learner's own words. Client-safe: the dialog imports the labels and limits from here.
- `const GUIDANCE_HEADER` — The feedback block for a regeneration prompt: one guidance line per chip, then the note sanitized, capped and fenced as untrusted data. `null` when there is neither.
- `function regenerationGuidanceForSearch` — The same feedback as prose for a search objective (DEV-171): the header and note notice written for the model are replaced and the note fences left out, since a search engine reads a goal, not instructions.

### `src/features/plans/regeneration-orchestration/request.ts`

- `async function peekRegenerationQuota` — Fail-fast quota read; nothing is settled until provider start. A grounded run on a tier with a per-plan cap counts this plan's regenerations instead of the monthly meter.
- `const grounded` — Grounded regeneration (JCS-162): reasons and note, Free's per-plan cap. Flag off keeps today's admission and drops reasons and note.

### `src/features/plans/regeneration-orchestration/schema.ts`

- `import` — Zod schema for `job_queue` payloads of type `plan_regeneration`. Consumed by orchestration (`process.ts`) when a worker dequeues a job; allowed `overrides` merge with the stored plan (dates, skill, hours, style, model). Topic/notes are never taken from the payload — they are rebuilt from the plan. `reasons`/`note` (JCS-162) are set only for grounded regenerations.

### `src/features/plans/regeneration-orchestration/types.ts`

- `reasons?: RegenerationReason[];` — Grounded regenerations only (JCS-162); dropped when the flag is off.

### `src/features/plans/research/contract.ts`

- `type ResearchCitationKey` — The research step's output (JCS-158). The outline (2b) reads `brief`; lessons (3a) cite `sources` by `key`. Keys run `S1`, `S2`, … with no gaps, and every `url` came from the same run's web search: an OpenRouter `url_citation` annotation, or a Parallel result on the direct path (DEV-171).
- `readonly droppedSourceCount: number;` — Sources dropped because no citation from the run's search named their URL.
- `function checkResearchOutput` — Parses the model's text and enforces the contract: keeps only sources whose URL appears in `citations` (deduplicated), renumbers them `S1…Sn` in order, rewrites the brief's markers to match and caps the brief's length. Throws `ResearchOutputError` when the text is not the expected JSON or no cited source is left, so the step retries.

### `src/features/plans/research/run-research.ts`

- `readonly costMicrousd: number | null;` — `null` when the model call's cost is unknown: OpenRouter reported none, or on the direct path (DEV-171) its usage never arrived. A direct run's known value is the model call plus the search.
- `function buildResearchUserPrompt` — The learner's request as untrusted data; the preset holds the instructions. A regeneration adds its feedback block (JCS-162) after the request.
- `function buildResearchSearch` — What a direct search asks Parallel for (DEV-171): the learner's request and any regeneration feedback as the objective, plus keyword queries built from the topic's first words. Built in code, so no model call precedes the search.
- `function frameSafe` — Web text inside the results frame: fence-like dashes neutralized, as for learner input, and `[Sn]` markers removed, so only our keys and fences remain. Repeated until nothing changes, because removing a marker can join text into new dashes or a new marker (`--[S1]-`, `[S[S2]1]`). Each pass only shortens the text, so the loop ends. Parallel's `max_chars_total` already bounds the length.
- `function buildSearchResultsPrompt` — Search results as untrusted data for the direct-research preset, keyed `S1…Sn` in rank order. The model cites these keys; the contract check then keeps only sources whose URL is one of these.
- `async function usageWithSearchCost` — The model call's usage with the search cost added, so a discarded attempt records both. Without complete model usage (no call, or a stream cut off before its usage chunk) the search alone is recorded.
- `async function modelCostMicrousd` — What a finished model call cost: OpenRouter's reported cost, else the catalog estimate from its usage, else `null` when that usage never arrived.
- `guidance?: string | null;` — Regeneration feedback that steers the search (JCS-162).
- `directSearch?: boolean;` — Search Parallel directly with our own key, then have the model write the brief from the results (DEV-171). Off: OpenRouter's `web_search` tool.
- `async function runDirectResearch` — Search-first (DEV-171): one Parallel request with the tier's mode and limits, then one model call that writes the brief from those results. The search cost is known from the price table, so a failure after the search (a model error, a cut-off stream or a rejected brief) still records it. A finished brief whose model usage never arrived records `null`: an unknown cost, not the search alone.

### `src/features/plans/session/plan-generation-session.ts`

- `function planGenerationNotStartedError` — The canonical error for an attempt that never started (reservation rejected, Worker refused, or an unexpected start error). The message and code come from the classification's failure presentation; `details.planId` lets the client open the plan page.

### `src/features/plans/session/session-command.ts`

- `savedGroundedPicks?: SavedGroundedModelPicks;` — Saved grounded picks; only the Pro writer pick is read (JCS-169).
- `savedGroundedPicks?: SavedGroundedModelPicks;` — Saved grounded picks; only the Pro writer pick is read (JCS-169).
- `const groundedWriterModelId` — Grounded outlines take a valid `?model=` override, else the Pro writer pick; the saved standard outline model never applies to them (JCS-169).

### `src/features/plans/session/stream-cleanup-policy.ts`

- `type UnhandledGenerationErrorClassification` — Classification for an exception thrown while starting a generation. These run before the jobs Worker gets the attempt, so the provider has not run and an unrecognized error is `unknown`, not `provider_error`.

### `src/features/plans/session/stream-cleanup.ts`

- `function shouldSurfaceMarkFailureError` — Programming / wiring mistakes: surface instead of masking as persistence noise.
- `async function safeMarkPlanFailedWithDbClient` — Plan failure marking mutates server-owned plan state; pass serviceRoleDb from feature-owned generation boundaries. Workers/tests may pass service-role or other privileged clients matching their context.

### `src/features/plans/start-plan-generation-attempt.ts`

- `type FinalizeStartFailure` — Settles a reserved attempt whose generation never started.
- `...` — Omitted without a pick, so starts stay valid on a Worker deployed before JCS-169.

### `src/hooks/useRetryGeneration.ts`

- `type RetryStatus` — Derived retry UI phase; `cancelled` is an aborted retry request, not idle.
- `function useRetryGeneration` — Retry cooldown + start delegation. Pass the same `session` instance used elsewhere on the surface (e.g. pending page) to avoid duplicate session hooks. `onRetryStarted` runs as soon as the server accepts the retry, so the caller can resume status polling; the retry itself runs in the background.

### `src/hooks/useScrollCue.ts`

- `function useScrollCue` — Ref callback for a horizontal scroller with the `scroll-cue-x` utility. It marks which edges have hidden content (`data-scroll-cue="start end"`), so the cut-off side fades in every browser, whatever its scroll-timeline support.
- `const scrolled` — Absolute, so right-to-left scrollers (negative scrollLeft) work too.

### `src/hooks/useTaskStatusBatcher.ts`

- `function useTaskStatusBatcher` — Batches task status updates within a debounce window into a single server request. Returns a `queue` function that returns a Promise resolving/rejecting when the batch flushes. - Deduplicates: multiple clicks on the same task keep only the latest target status. - Net-zero detection: if a task is toggled back to its original status, it's removed from the batch entirely and both promises resolve immediately. - Shows a single toast on batch failure. - Flushes pending updates on unmount to prevent data loss on navigation.
- `dropOutOfScopePending` — Scope change (navigation/regen): drop stale pending instead of flushing under new scope.

### `src/lib/jobs-worker/client.ts`

- `async function sendJobsWorkerCommand` — Sends `POST {JOBS_WORKER_URL}<path>` with the HMAC headers from the shared contract. Never throws for transport or HTTP failures; callers branch on the result kind.

### `src/lib/jobs-worker/contract.ts`

- `const JOBS_SIGNED_BODY_MAX_BYTES` — Largest signed command body the Worker reads (DEV-208, lead 5). Real commands are a few KiB; the cap stops an unsigned client from making the Worker buffer and hash a large body before the signature check fails.
- `async function computeJobsSignatureFromBodyHash` — {@link computeJobsSignature} from a precomputed {@link hashJobsBody}, so a verifier that tries several secrets hashes the body once.
- `async function jobsSignaturesMatch` — Constant-time string compare: both sides are hashed to fixed-length digests first, so length differences cannot short-circuit (same approach as `workflowCallbackTokensMatch`).

### `src/shared/constants/jobs.ts`

- `const JOB_TYPE_MAP` — Single source of truth for job type values. This mapping is used to define both the database enum and runtime validation.

### `src/shared/constants/polling.ts`

- (file or block level) — Polling configuration for exponential backoff with jitter. Used by the plan-status polling hook to reduce unnecessary network and database load while keeping the UI responsive to status changes.
- `const JITTER_FACTOR` — ±20 % random jitter to prevent thundering-herd synchronisation.
- `function computeNextDelay` — Compute the next poll delay using exponential backoff + jitter. 1. Multiply `currentDelay` by {@link BACKOFF_MULTIPLIER}. 2. Cap at {@link MAX_POLL_MS}. 3. Apply uniform random jitter in the range ±{@link JITTER_FACTOR}. 4. Clamp the result to [{@link INITIAL_POLL_MS}, {@link MAX_POLL_MS}].

### `src/shared/policy/generation-admission.ts`

- `function evaluateGenerationAdmission` — The hosted app is paid-only. The `free` tier is the "no subscription" state (never subscribed, or lapsed), and it cannot start any AI generation.

### `src/shared/retry-policy.ts`

- `function decideJobRetry` — `retryable === false` never schedules retry. `retryable === true` or `undefined` retries while `attemptNumber < maxAttempts`.

### `src/shared/schemas/lesson-content.schemas.ts`

- `sourceIds: z` — Research source keys the body cites as `[S1]`, unique and in order of first appearance. Set by code on grounded lessons (JCS-160); absent on batch lessons and rows written before it.
- `workflow: z` — Which runtime owns the run. `workflow-sdk` remains only for historical rows.
- `freeRouterFallback: z.literal` — A paid tier's lessons were served by the free router (DEV-175).
- `budgetCuts: z.number` — Lesson repair steps the plan's AI spend ceiling cut (JCS-170).

## Consequences

The code no longer carries this rationale inline. A change that would alter one of the behaviors above should update this ADR in the same pull request, and a new non-obvious decision belongs in an ADR, not in a comment.
