# AI Integration: Background Job System for Plan Generation

> **Outcome**: Plan generation runs asynchronously in a background worker with mock AI provider for development. System is cost-free for local development and easily upgradeable to production-ready queue solutions.

**Branch**: `feature/background-workers` (or similar)

Legend:

**P** = Parallelizable (different files, no direct dependency) \
**T** = Test task \
**M** = Migration/schema change \
**D** = Documentation \

---

**Make sure to mark tasks as done `[x]` when completed.**

## Phase 1: Job Queue Schema & Infrastructure

### Phase 1 Features

- [x] J001 Create `jobQueue` table in `src/lib/db/schema.ts` with all columns (id, type, planId, userId, status, priority, attempts, maxAttempts, data, result, error, processingStartedAt, completedAt, createdAt, updatedAt) and indexes (M)
- [x] J002 Generate migration file and apply to local DB via `drizzle-kit generate` and `drizzle-kit push` (M)
- [x] J003 [P] Create job queue service `src/lib/jobs/queue.ts` with functions: `enqueueJob()`, `getNextJob()`, `completeJob()`, `failJob()`, `getJobsByPlanId()`, `getUserJobCount()`
- [x] J004 [P] Create job types file `src/lib/jobs/types.ts` with JOB_TYPES constant, JobType, JobStatus, PlanGenerationJobData, PlanGenerationJobResult, Job interface

### Phase 1 Test Plan (T-Series Additions)

Purpose: Validate persistence, locking semantics, retry state transitions, and rate limit query logic before worker logic depends on them.

Add the following tasks (do not implement until corresponding J-tasks exist):

- [x] T001 Schema integrity test (after J002): migration creates expected columns & indexes (introspect drizzle metadata / query information_schema). Fails if a required column or index missing.
- [x] T002 `enqueueJob()` unit/integration test: inserts row with default values (attempts=0, status=pending, priority=0, maxAttempts=3). Asserts returned ID corresponds to row.
- [x] T003 `getNextJob()` locking test: two parallel invocations only return same job to first caller (simulate with Promise.all). Second call gets next job or null if single job. Asserts status transitions to `processing` and `processingStartedAt` not null.
- [x] T004 Priority ordering test: enqueue jobs with priorities [5,0,5,10]; successive `getNextJob()` calls return priority 10 first, then 5 (earliest created first among equals), etc.
- [x] T005 Retry transition test: call `failJob()` for job attempts < maxAttempts; assert attempts incremented, status reset to `pending`, error stored null (or cleared) strategy defined. On final allowed attempt crossing threshold, status becomes `failed`, `completedAt` set, error message persisted.
- [x] T006 `completeJob()` test: sets status `completed`, persists result JSON, sets `completedAt`, does not modify attempts.
- [x] T007 Idempotent completion guard (optional): calling `completeJob()` twice should not corrupt state (expect first success, second no-op or error). Implement only if guard logic added.
- [x] T008 `getJobsByPlanId()` ordering test: returns jobs newest first by `createdAt`.
- [ ] T009 `getUserJobCount()` window test: create jobs over differing timestamps; count only those within supplied window.
- [ ] T010 Negative planId/userId inputs (validation) test if input validation layer added (skip if not implemented to avoid fragile test).

Test Types: T001 migration/snapshot, T002–T009 integration (run against test DB). Avoid mocking DB; concurrency check uses real transactions.

Exit Gate for Phase 1: All T001–T006 passing (T007–T010 optional based on implementation choices) before starting Phase 3 worker logic.

### Phase 1 Details

**Schema Details for J001**:

Add new table `jobQueue`:

- `id`: uuid, primary key
- `type`: varchar(50), job type identifier (e.g., 'plan_generation')
- `planId`: uuid, foreign key to learning_plans table
- `userId`: uuid, foreign key to users table
- `status`: varchar(20), enum: 'pending', 'processing', 'completed', 'failed'
- `priority`: integer, default 0 (higher = more priority)
- `attempts`: integer, default 0, tracks retry count
- `maxAttempts`: integer, default 3, maximum retry limit
- `data`: jsonb, job-specific payload (topic, notes, skillLevel, etc.)
- `result`: jsonb, nullable, stores job result on completion
- `error`: text, nullable, stores error message on failure
- `processingStartedAt`: timestamp, nullable, when worker picked up job
- `completedAt`: timestamp, nullable, when job finished (success or failure)
- `createdAt`: timestamp, default now()
- `updatedAt`: timestamp, default now()
- Index on (status, priority, createdAt) for efficient worker polling
- Index on (planId) for status lookups
- Index on (userId) for rate limiting queries

**Queue Service Details for J003**:

**`enqueueJob(type: string, planId: string, userId: string, data: unknown, priority?: number)`**:

- Insert new job into `jobQueue` table with status='pending'
- Return created job ID
- Used by POST /api/v1/plans to queue generation

**`getNextJob(types: string[])`**:

- Query for next pending job ordered by (priority DESC, createdAt ASC)
- Lock job by updating status='processing' and processingStartedAt
- Return job or null if queue empty
- Implements basic polling mechanism

**`completeJob(jobId: string, result: unknown)`**:

- Update job status='completed'
- Store result in result field
- Set completedAt timestamp
- Used by worker on successful generation

**`failJob(jobId: string, error: string)`**:

- Increment attempts counter
- If attempts < maxAttempts: reset status='pending' (for retry)
- If attempts >= maxAttempts: set status='failed', store error
- Set completedAt if permanently failed
- Used by worker on generation failure

**`getJobsByPlanId(planId: string)`**:

- Fetch all jobs for a specific plan
- Used to check plan generation status
- Return jobs ordered by createdAt DESC

**`getUserJobCount(userId: string, type: string, since: Date)`**:

- Count jobs for user of specific type since timestamp
- Used for rate limiting (e.g., max 10 generations per hour)
- Return integer count

**Type Definitions for J004**:

```typescript
export const JOB_TYPES = {
  PLAN_GENERATION: 'plan_generation',
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface PlanGenerationJobData {
  topic: string;
  notes: string | null;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  weeklyHours: number;
  learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
}

export interface PlanGenerationJobResult {
  modulesCount: number;
  tasksCount: number;
  durationMs: number;
}

export interface Job {
  id: string;
  type: JobType;
  planId: string;
  userId: string;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  data: unknown;
  result: unknown | null;
  error: string | null;
  processingStartedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Phase 2: Mock AI Provider

### Phase 2 Features

- [x] J005 [P] Create mock generation provider `src/lib/ai/providers/mock.ts` implementing `AiPlanGenerationProvider` interface with `generate()` method (5-10s delay, realistic dummy modules/tasks, XML-like structure for parser)
- [x] J006 [P] Add provider factory function `getGenerationProvider()` in `src/lib/ai/provider.ts` (checks AI_PROVIDER env var, returns mock or OpenAI provider)
- [x] J007 Add environment variables to `.env.local`: AI_PROVIDER=mock, MOCK_GENERATION_DELAY_MS=7000, MOCK_GENERATION_FAILURE_RATE=0.1
- [x] J008 Update `src/lib/ai/orchestrator.ts` to use `getGenerationProvider()` instead of hardcoded OpenAIGenerationProvider

### Phase 2 Test Plan

Focus: Deterministic shape & variability controls of mock provider; factory selection correctness; streaming contract.

- [x] T020 Provider selection test: set `AI_PROVIDER=mock` ensures `getGenerationProvider()` returns Mock; set `AI_PROVIDER=openai` (with OpenAI provider temporarily stubbed/mocked) returns OpenAI provider. Skip network calls.
- [ ] T021 Mock generate baseline test: `generate()` yields streaming chunks culminating in parsable JSON structure containing 3–5 modules and each module 3–5 tasks. **(3/4 passing - 1 timeout issue: "generates content based on input topic and skill level")**
- [x] T022 Delay simulation test: measure elapsed time between start and completion; ensure within configured range (e.g., 5000–10000 ms) using controllable RNG (seed or injected delay function). If randomness not injectable, assert lower bound (>1000 ms) only to reduce flakiness.
- [ ] T023 Failure rate toggle test: with `MOCK_GENERATION_FAILURE_RATE=1` provider always fails (simulate thrown error or error chunk); with `0` always succeeds. **(3/4 passing - 1 timeout issue: "never fails when MOCK_GENERATION_FAILURE_RATE=0")**
- [ ] T024 Effort/time metadata reasonableness test: modulesEstimatedMinutes within 120–350; task totals approximate module estimate (allow tolerance) if provider emits those attributes. **(2/4 passing - 1 range issue: "generates modules with estimated_minutes between 120-300" still failing, needs test update; 1 timeout issue: "module estimated_minutes approximates sum of task minutes")**
- [x] T025 Streaming order test: no task appears before its parent module open tag (basic regex state machine over chunks).

**Test Status: 17/21 passing (81%)**

**Known Issues (non-blocking):**

- 3 tests timing out at default 5000ms - need explicit timeout parameters added
- 1 test has wrong assertion range (still checking 120-300 instead of 120-350)

Exit Gate: T020–T023 green before integrating worker consumption. T024–T025 optional quality tests (implement if attributes present).

### Phase 2 Details

**Mock Provider Details for J005**:

**`MockGenerationProvider` class**:

- Implements same `AiPlanGenerationProvider` interface as OpenAI provider
- `generate(input: GenerationInput)`: Simulates AI generation
  - Random delay: 5-10 seconds to simulate real API latency
  - Generates realistic dummy modules/tasks based on input
  - Returns AsyncIterableIterator matching OpenAI streaming format
  - Includes proper XML-like structure for parser compatibility
- `getDummyModules(input: GenerationInput)`: Generates 3-5 modules
  - Module titles based on skill level and topic
  - Realistic estimated minutes (60-180 per module)
  - 3-5 tasks per module with descriptions
- Can toggle failure simulation via environment variable for testing

**Example mock output structure**:

```
<modules>
<module order="1" title="Introduction to {topic}" description="..." estimatedMinutes="120">
<task order="1" title="..." description="..." estimatedMinutes="30" />
<task order="2" title="..." description="..." estimatedMinutes="45" />
</module>
</modules>
```

**Provider Factory Details for J006**:

**`getGenerationProvider()`**:

- Check `AI_PROVIDER` environment variable
- If 'mock' or not set in development: return MockGenerationProvider
- If 'openai' in production: return OpenAIGenerationProvider
- Allows easy switching between mock and real providers

**Orchestrator Update for J008**:

Replace hardcoded OpenAIGenerationProvider:

```typescript
const provider = options.provider ?? getGenerationProvider();
```

---

## Phase 3: Worker Implementation

### Phase 3 Features

- [ ] J009 [P] Create worker script `src/workers/plan-generator.ts` with `PlanGenerationWorker` class (constructor, start(), processJob(), stop() methods, polling loop, graceful shutdown)
- [ ] J010 [P] Create worker entry point `src/workers/index.ts` (instantiate worker, start, handle SIGTERM/SIGINT)
- [ ] J011 Add worker npm scripts to `package.json`: `dev:worker`, `worker:start`, `dev:all`
- [ ] J012 Install dependencies: `pnpm add -D tsx concurrently`
- [ ] J013 [P] Create worker service module `src/lib/jobs/worker-service.ts` with `processPlanGenerationJob()` function (validate job data, call orchestrator, persist modules/tasks, update plan status, handle errors)

### Phase 3 Test Plan

Goal: Ensure worker poll loop correctness, single-flight processing, retry/backoff semantics, and graceful shutdown safety.

- [ ] T030 Poll loop no-job idle test: with empty queue, worker cycles without throwing (spy on log or internal counter) for N iterations then stop.
- [ ] T031 Single job success flow: enqueue generation job; worker processes → assertions: job status `completed`, plan status `ready`, modules/tasks persisted, job.result contains counts & duration.
- [ ] T032 Failure then retry: force mock provider failure once (e.g., injected provider variant) then success; expect attempts incremented, intermediate pending requeue, final completion.
- [ ] T033 Max attempts exhausted: force repeated failure until attempts==maxAttempts; job status `failed`, plan status `failed`, no persisted modules/tasks.
- [ ] T034 Concurrency=1 guarantee: enqueue 2 jobs; assert second does not enter `processing` until first completes (timestamps ordering).
- [ ] T035 Graceful shutdown in-flight: start processing long-running job, call `stop()`; ensure worker waits (or abort policy defined) and job ends in consistent terminal state (completed or failed) with no status left `processing`.
- [ ] T036 Data validation failure path: supply malformed job.data; expect immediate fail handling without crash; plan marked failed.
- [ ] T037 Idempotent pickup guard (race simulation): manually set same job to pending and concurrently call internal fetch twice (simulate via direct function) — only one transition to `processing` (reuse Phase 1 locking logic; skip if already proven and would duplicate logic).

Exit Gate: T031–T034 mandatory; others recommended for robustness. Avoid overlapping coverage with Phase 1 unless behavior differs at orchestration layer (state transitions + side effects).

### Phase 3 Details

**Worker Script Details for J009**:
s
**`PlanGenerationWorker` class**:

- `constructor(options: WorkerOptions)`:
  - pollIntervalMs: default 2000 (2 seconds)
  - concurrency: default 1 (process one job at a time)
  - gracefulShutdownTimeoutMs: default 30000
- `start()`: Begin polling loop
  - Query for next pending job using getNextJob()
  - If job found: process it via processJob()
  - If no job: wait pollIntervalMs and retry
  - Handle SIGTERM/SIGINT for graceful shutdown
- `processJob(job: Job)`: Execute plan generation
  - Extract PlanGenerationJobData from job.data
  - Call runGenerationAttempt() with job context
  - On success: persist modules/tasks, call completeJob()
  - On failure: call failJob() with error message
  - Update learning_plans status accordingly
- `stop()`: Graceful shutdown
  - Stop accepting new jobs
  - Wait for current job to complete or timeout
  - Close database connections

**Worker process management**:

- Runs as separate Node.js process (not Next.js API route)
- Can be started/stopped independently
- Logs structured JSON for observability

**Worker Entry Point for J010**:

```typescript
import { PlanGenerationWorker } from './plan-generator';

const worker = new PlanGenerationWorker({
  pollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL_MS ?? '2000'),
  concurrency: parseInt(process.env.WORKER_CONCURRENCY ?? '1'),
});

worker.start();

// Graceful shutdown on signals
process.on('SIGTERM', () => worker.stop());
process.on('SIGINT', () => worker.stop());
```

**NPM Scripts for J011**:

```json
{
  "scripts": {
    "dev:worker": "tsx watch src/workers/index.ts",
    "worker:start": "tsx src/workers/index.ts",
    "dev:all": "concurrently \"pnpm dev\" \"pnpm dev:worker\""
  }
}
```

**Worker Service Details for J013**:

**`processPlanGenerationJob(job: Job)`**:

- Validate job.data matches PlanGenerationJobData schema
- Call runGenerationAttempt() from orchestrator
- On success:
  - Persist modules and tasks to database
  - Update learning_plans.status = 'ready'
  - Create job result with metadata
  - Return success status
- On failure:
  - Update learning_plans.status = 'failed' with error details
  - Classify failure type for retry decision
  - Return failure status with error
- Handles all error cases gracefully

---

## Phase 4: API Integration

### Phase 4 Features

- [ ] J014 Update POST `/api/v1/plans` route handler in `src/app/api/v1/plans/route.ts` to enqueue job instead of inline generation (remove schedule() and runGenerationAttempt() calls, add enqueueJob() call)
- [ ] J015 [P] Create status endpoint `src/app/api/v1/plans/[id]/status/route.ts` (GET handler, fetch plan+job status, return formatted response with attempts progress)
- [ ] J016 [P] Create rate limiting middleware `src/lib/api/rate-limit.ts` with `checkPlanGenerationRateLimit()` function (query job count, throw error if exceeded)
- [ ] J017 Add `RateLimitError` class to `src/lib/api/errors.ts` (extends ApiError with 429 status and retryAfter field)

### Phase 4 Test Plan

Scope: API-level contract changes from synchronous to async job initiation; status endpoint correctness; rate limiter enforcement.

- [ ] T040 Plan creation enqueues job test: POST /api/v1/plans returns 201 with status 'pending' and a job row exists with matching planId.
- [ ] T041 Status endpoint pending -> processing -> ready: simulate worker processing (or manually update job statuses) and poll endpoint; ensure mapping logic correct (processing when job status=processing, ready when plan updated + job completed); failed maps appropriately.
- [ ] T042 Rate limit exceeded test: create N jobs >= limit within window; expect 429 with retryAfter field and no extra job inserted beyond limit.
- [ ] T043 Malformed plan creation input test: invalid skillLevel or missing topic returns validation error without inserting job.
- [ ] T044 Security / ownership test (if auth context present): user A cannot fetch status of user B's plan/job (403/404); skip if auth not yet implemented.
- [ ] T045 Idempotency (optional): rapid duplicate POST (same payload) either creates distinct jobs (documented) or prevented if dedupe introduced later; only test if dedupe logic implemented.

Exit Gate: T040–T042 must pass before frontend polling (Phase 5) is relied upon.

### Phase 4 Details

**Plan Creation Update for J014**:

1. Remove `schedule()` and `runGenerationAttempt()` calls (lines 154-194)
2. Add job enqueueing after plan creation:

```typescript
await enqueueJob(
  JOB_TYPES.PLAN_GENERATION,
  plan.id,
  user.id,
  {
    topic: body.topic,
    notes: body.notes ?? null,
    skillLevel: body.skillLevel,
    weeklyHours: body.weeklyHours,
    learningStyle: body.learningStyle,
  },
  0 // default priority
);
```

3. Return same 201 response with status='pending'
4. Job will be picked up by worker automatically

**Status Endpoint Details for J015**:

**GET /api/v1/plans/[id]/status**:

- Fetch plan by ID with userId validation
- Query latest job for plan via getJobsByPlanId()
- Return response:
  ```typescript
  {
    planId: string;
    status: 'pending' | 'processing' | 'ready' | 'failed';
    progress?: {
      attempts: number;
      maxAttempts: number;
      processingStartedAt?: string;
    };
    error?: string;
  }
  ```
- Maps job status to plan status
- Used by frontend for polling

**Rate Limiting Details for J016**:

**`checkPlanGenerationRateLimit(userId: string)`**:

- Query getUserJobCount() for past hour
- If count >= limit (e.g., 10): throw RateLimitError
- Otherwise: allow request to proceed
- Returns remaining attempts and reset time

Apply to POST /api/v1/plans:

```typescript
await checkPlanGenerationRateLimit(user.id);
```

**Rate Limit Error for J017**:

```typescript
export class RateLimitError extends ApiError {
  constructor(
    message: string,
    public retryAfter: number
  ) {
    super(message, 429);
  }
}
```

---

## Phase 5: Frontend Integration

### Phase 5 Features

- [ ] J018 [P] Create status polling hook `src/hooks/usePlanStatus.ts` (polls status endpoint every 3s, updates state, stops polling when complete/failed)
- [ ] J019 [P] Update plan details page `src/app/plans/[id]/page.tsx` to enable polling for pending/processing plans (add shouldPoll flag, pass to PlanDetails component)
- [ ] J020 [P] Enhance pending state component `src/components/plans/PlanPendingState.tsx` with usePlanStatus hook (show processing vs pending, display attempt progress, auto-refresh on ready, show error on failed)
- [ ] J021 [P] Update onboarding form `src/components/plans/OnboardingForm.tsx` success toast message to "Generating your learning plan..." (line 196)

### Phase 5 Test Plan (Non-UI Programmatic Only)

Per request, defer UI/Playwright; limit to hook logic in isolation.

- [ ] T050 `usePlanStatus` hook polling logic unit test (React Testing Library or lightweight mock): given mock fetch sequence pending→processing→ready, ensures state transitions and polling stops after terminal state.
- [ ] T051 Error propagation test: mock fetch returns failed status with error string; hook sets error and stops polling.
- [ ] T052 No polling for initial ready/failed: initialStatus ready triggers no network calls (spy on fetch). Pending triggers calls.

Exit Gate: T050 mandatory to ensure no runaway polling; T051–T052 recommended.

### Phase 5 Details

**Status Polling Hook for J018**:

```typescript
export function usePlanStatus(planId: string, initialStatus: PlanStatus) {
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'pending' && status !== 'processing') {
      return; // Don't poll if already completed/failed
    }

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/v1/plans/${planId}/status`);
        const data = await response.json();
        setStatus(data.status);
        if (data.error) {
          setError(data.error);
        }
      } catch (err) {
        console.error('Failed to poll plan status', err);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [planId, status]);

  return { status, error };
}
```

**Plan Details Page Update for J019**:

```typescript
const plan = await getPlanById(id);

// If plan is pending/processing, enable polling on client side
const shouldPoll = plan.status === 'pending' || plan.status === 'processing';
```

Pass `shouldPoll` flag to PlanDetails component for client-side polling hook.

**Pending State Enhancement for J020**:

- Import and use `usePlanStatus()` hook
- Show processing state vs pending state differently
- Display attempt progress: "Attempt 1 of 3"
- Show estimated time remaining (based on average generation time)
- Auto-refresh page when status becomes 'ready'
- Show error message if status becomes 'failed'

**Onboarding Form Update for J021**:

After plan creation (line 195-197):

- Keep existing redirect to `/plans/${plan.id}`
- Toast message: "Generating your learning plan..."
- Plan details page will show pending state with polling

---

## Phase 6: Error Handling & Observability

### Phase 6 Features

- [ ] J022 [P] Add monitoring queries to `src/lib/db/queries.ts`: `getFailedJobs()`, `getJobStats()`, `cleanupOldJobs()` (Perf)
- [ ] J023 Add structured logging to worker `src/workers/plan-generator.ts` (log startup/shutdown, job started/completed/failed, polling cycles, errors) (Perf)
- [ ] J024 [P] Create health check endpoint `src/app/api/health/worker/route.ts` (GET handler, check stuck jobs, check backlog, return 200 or 503) (Perf)

### Phase 6 Test Plan

Target: Reliability & monitoring functionality correctness without external observability platform.

- [ ] T060 Monitoring queries test: create synthetic jobs (mix of statuses, varied durations). Assert `getJobStats()` returns correct counts, average processing time within tolerance, failure rate accurate.
- [ ] T061 Failed jobs retrieval test: `getFailedJobs(limit)` returns most recent failures limited to requested count and includes error messages.
- [ ] T062 Cleanup test: mark several old completed/failed jobs older than threshold; run `cleanupOldJobs()`; assert those rows removed while newer remain.
- [ ] T063 Logging shape test: capture console output during one job lifecycle; parse JSON lines ensure required keys (event, jobId, planId, attempt) present; skip content assertions too brittle.
- [ ] T064 Health endpoint healthy: with queue under thresholds, returns 200 and expected stats fields.
- [ ] T065 Health endpoint unhealthy (stuck job): create job with status processing and processingStartedAt older than threshold; endpoint returns 503 with reason code.
- [ ] T066 Health endpoint backlog: enqueue > threshold pending jobs; returns 503 backlog condition.

Exit Gate: T060–T062, T064–T066 core; logging test T063 optional (depending on log format stability).

### Phase 6 Details

**Monitoring Queries for J022**:

**`getFailedJobs(limit: number)`**:

- Query jobs with status='failed' ordered by completedAt DESC
- Used for debugging and monitoring
- Return job details with error messages

**`getJobStats(since: Date)`**:

- Count jobs by status since timestamp
- Calculate average processing time
- Calculate failure rate
- Return statistics object for dashboard

**`cleanupOldJobs(olderThan: Date)`**:

- Delete completed/failed jobs older than retention period
- Keeps jobQueue table size manageable
- Run periodically via cron or manual script

**Worker Logging for J023**:

```typescript
console.log(
  JSON.stringify({
    level: 'info',
    event: 'job_started',
    jobId: job.id,
    planId: job.planId,
    userId: job.userId,
    attempt: job.attempts + 1,
    timestamp: new Date().toISOString(),
  })
);
```

Log key events:

- Worker startup/shutdown
- Job started/completed/failed
- Polling cycles (debug level)
- Error stack traces

**Health Check Endpoint for J024**:

**GET /api/health/worker**:

- Check if any jobs stuck in 'processing' state > 10 minutes
- Check if pending jobs backlog > threshold
- Return 200 with stats or 503 if unhealthy
- Used for monitoring/alerting in production

---

## Phase 7: Testing & Validation

### Phase 7 Features

- [ ] J025 (T) Create job queue tests `src/lib/jobs/__tests__/queue.test.ts` (test enqueueJob, getNextJob locking, completeJob, failJob retry logic, rate limiting)
- [ ] J026 (T) Create worker tests `src/workers/__tests__/plan-generator.test.ts` (test polling, job processing, failures+retries, concurrency, graceful shutdown, persistence)
- [ ] J027 (T) Create end-to-end test `src/__tests__/e2e/plan-generation.test.ts` (full workflow: create plan → verify job enqueued → start worker → poll until ready → verify modules/tasks)
- [ ] J028 (T) Manual testing checklist: start dev+worker, submit form, verify pending state, verify worker processes job, verify auto-refresh, test failure scenarios, test rate limiting

### Phase 7 Consolidated & Additional Tests

Existing J025–J027 capture core flows. Add cross-phase & regression tests only where they add distinct value:

- [ ] T070 End-to-end retry scenario (extended): Force first provider failure, confirm second attempt success path recorded (attempts=2, final status ready). Ensures integration between queue retry and orchestrator classification.
- [ ] T071 Race: enqueue 5 jobs rapidly, start worker; ensure processed in priority/creation order (depends on whether priority varied; if all zero, FIFO insertion order). Guards against future parallelism bugs.
- [ ] T072 Data consistency: after success, verify no orphan job rows (e.g., multiple completed for same plan if single job model expected). If multiple jobs per plan allowed, adjust test to assert latest job drives plan status.
- [ ] T073 Performance budget smoke: measure average processing duration with mock provider (exclude artificial delay variance) stays within expected 5–10s band; warn (not fail) if >12s median to catch accidental synchronous blocking.
- [ ] T074 Migration drift test: snapshot hash of schema (selected tables) against committed expectation; fails if schema changes without updating migration (future safety net; optional early).

Optional Exploratory / Future (Not Immediately Implemented):

- Property-based test generating varied queue states for `getNextJob()` invariants (never returns non-pending, never skips higher priority).
- Chaos test injecting random failures during `processPlanGenerationJob` to assert no stuck `processing` jobs after worker stop/start cycle.

---

### Test Mapping Summary

| Phase | Core J Tasks | Test Tasks (T)                 | Mandatory Before Next Phase           |
| ----- | ------------ | ------------------------------ | ------------------------------------- |
| 1     | J001–J004    | T001–T006 (T007–T010 optional) | Yes                                   |
| 2     | J005–J008    | T020–T023 (T024–T025 optional) | Yes (before 3)                        |
| 3     | J009–J013    | T031–T034 (others optional)    | Yes (before 4)                        |
| 4     | J014–J017    | T040–T042 (others optional)    | Yes (before 5)                        |
| 5     | J018–J021    | T050 (T051–T052 optional)      | Yes (before 6 if polling relied upon) |
| 6     | J022–J024    | T060–T062, T064–T066           | Yes (before prod readiness)           |
| 7     | J025–J028    | T070–T073 (T074 optional)      | N/A                                   |

Prioritize mandatory sets to maintain flow; optional tests can be scheduled during hardening sprints.

### Phase 7 Details

**Job Queue Tests for J025**:

- `enqueueJob()` creates job with correct fields
- `getNextJob()` returns highest priority pending job
- `getNextJob()` locks job by updating status
- `completeJob()` updates status and stores result
- `failJob()` increments attempts and retries if under limit
- `failJob()` permanently fails job after max attempts
- Rate limiting works correctly

**Worker Tests for J026**:

- Worker polls for pending jobs
- Worker processes job successfully with mock provider
- Worker handles job failures and retries
- Worker respects concurrency limits
- Graceful shutdown works correctly
- Modules and tasks are persisted on success

**End-to-End Test for J027**:

1. Create plan via POST /api/v1/plans
2. Verify job enqueued with status='pending'
3. Start worker
4. Poll plan status until 'ready' or timeout
5. Verify modules and tasks exist in database
6. Verify plan status updated correctly

**Manual Testing Checklist for J028**:

- [ ] Start dev server: `pnpm dev`
- [ ] Start worker: `pnpm dev:worker`
- [ ] Complete onboarding form and submit
- [ ] Verify redirect to plan details page with pending state
- [ ] Verify worker picks up job (check logs)
- [ ] Verify mock provider generates modules (5-10 seconds)
- [ ] Verify plan status updates to 'ready' automatically
- [ ] Verify modules and tasks display correctly
- [ ] Test failure scenario: kill worker mid-generation
- [ ] Verify job retries when worker restarts
- [ ] Test rate limiting: create 10+ plans rapidly
- [ ] Verify rate limit error returned correctly

---

## Implementation Order

1. **Phase 1** (Infrastructure): Job queue schema, queue service, job types
2. **Phase 2** (Mock Provider): Mock generation provider, provider factory, orchestrator update
3. **Phase 3** (Worker): Worker script, entry point, npm scripts, worker service
4. **Phase 4** (API): Update plan creation endpoint, status endpoint, rate limiting
5. **Phase 5** (Frontend): Status polling hook, update plan details page, enhance pending state
6. **Phase 6** (Observability): Monitoring queries, worker logging, health check
7. **Phase 7** (Testing): Queue tests, worker tests, e2e tests, manual testing

---

## Dependencies Overview

**Phase 1 (Job Queue)**: J001 Create schema → J002 Apply migration → blocks all downstream work. Once schema exists (J002 complete), J003 queue service and J004 job types can be developed in parallel (different files).

**Phase 2 (Mock Provider)**: Can start after Phase 1.1 (schema) is complete. J005 Mock provider and J006 Provider factory are parallelizable. J008 Orchestrator update depends on both J005 and J006 being complete. J007 Env vars can be added anytime.

**Phase 3 (Worker)**: Depends on Phase 1 complete (needs queue service) and Phase 2 complete (needs provider factory). J009 Worker script, J010 Entry point, J011 NPM scripts, and J013 Worker service can be developed in parallel (different files). J012 Dependencies install can happen anytime.

**Phase 4 (API)**: J014 Plan creation update depends on J003 (needs enqueueJob function). J015 Status endpoint, J016 Rate limiting, and J017 Error class can be developed in parallel with each other and with J014 (different files, no shared dependencies).

**Phase 5 (Frontend)**: J018 Polling hook, J019 Plan details update, J020 Pending state enhancement, and J021 Onboarding form update can be developed in parallel after J015 (status endpoint) exists (different component files).

**Phase 6 (Observability)**: J022 Monitoring queries, J023 Worker logging, and J024 Health check can be developed in parallel (different files). Depends on Phases 1-3 being complete for context.

**Phase 7 (Testing)**: Must come after implementation phases complete. J025 Queue tests depend on Phase 1. J026 Worker tests depend on Phase 3. J027 E2E test depends on all phases 1-5. J028 Manual testing is final validation.

**Critical Path**: J001 → J002 → J003 → J009 → J014 → J018 → J028

**Early Parallelization Opportunities**:

- After J002: Can parallelize J003, J004, J005, J006
- After J003 + J006: Can parallelize J009, J010, J013, J015, J016
- After J015: Can parallelize all of Phase 5 and Phase 6

---

## Parallel Execution Examples

**Example 1** (after J002 migration applied):

```
Run in parallel:
- J003 (src/lib/jobs/queue.ts)
- J004 (src/lib/jobs/types.ts)
- J005 (src/lib/ai/providers/mock.ts)
- J006 (src/lib/ai/provider.ts - factory function)
```

All four touch different files with no shared dependencies.

**Example 2** (after Phase 1 and Phase 2 complete):

```
Run in parallel:
- J009 (src/workers/plan-generator.ts)
- J010 (src/workers/index.ts)
- J013 (src/lib/jobs/worker-service.ts)
- J015 (src/app/api/v1/plans/[id]/status/route.ts)
- J016 (src/lib/api/rate-limit.ts)
```

Worker components and API endpoints are independent until integration.

**Example 3** (after Phase 4 API complete):

```
Run in parallel:
- J018 (src/hooks/usePlanStatus.ts)
- J020 (src/components/plans/PlanPendingState.tsx)
- J021 (src/components/plans/OnboardingForm.tsx)
- J022 (src/lib/db/queries.ts monitoring functions)
- J024 (src/app/api/health/worker/route.ts)
```

Frontend components and observability features are independent.

**Example Agent Commands** (conceptual):

```bash
# After schema migration
/run-task J003 | /run-task J004 | /run-task J005 | /run-task J006

# After queue and provider ready
/run-task J009 | /run-task J010 | /run-task J013 | /run-task J015 | /run-task J016

# After API integration
/run-task J018 | /run-task J020 | /run-task J021 | /run-task J022 | /run-task J024
```

---

## Validation Checklist

- [ ] Schema migration (J001-J002) creates `jobQueue` table with all required columns and indexes
- [ ] Job queue service (J003) successfully enqueues and retrieves jobs with proper locking
- [ ] Mock provider (J005) generates realistic dummy data matching parser expectations
- [ ] Worker (Phase 3) polls queue and processes jobs without crashes
- [ ] API endpoint (J014) enqueues job instead of inline generation
- [ ] Status endpoint (J015) returns correct job/plan status with progress
- [ ] Frontend (Phase 5) polls status and updates UI automatically
- [ ] Rate limiting (J016) prevents excessive job creation
- [ ] Worker graceful shutdown (J009) doesn't lose in-flight jobs
- [ ] All tests (Phase 7) pass with >80% coverage
- [ ] Manual testing (J028) validates full user flow
- [ ] Documentation is complete and accurate
- [ ] Parallelizable tasks do not share files
- [ ] All tasks reference absolute or project-root-relative paths

---

## Exit Criteria

All tasks J001–J028 completed; worker successfully processes mock jobs; frontend polling updates plan status automatically; rate limiting enforces limits; manual testing validates end-to-end flow; zero jobs stuck in 'processing' state; documentation reflects implemented system; performance meets targets (job processing <10s average).

---

## Environment Variables

**Development (.env.local)**:

```bash
# AI Provider Configuration
AI_PROVIDER=mock
MOCK_GENERATION_DELAY_MS=7000
MOCK_GENERATION_FAILURE_RATE=0.1

# Worker Configuration
WORKER_POLL_INTERVAL_MS=2000
WORKER_CONCURRENCY=1
WORKER_GRACEFUL_SHUTDOWN_TIMEOUT_MS=30000

# Rate Limiting
PLAN_GENERATION_RATE_LIMIT=10
PLAN_GENERATION_RATE_WINDOW_MS=3600000
```

**Production (.env.production)**:

```bash
AI_PROVIDER=openai
WORKER_POLL_INTERVAL_MS=1000
WORKER_CONCURRENCY=5
```

---

## Files to Create

- `src/lib/jobs/queue.ts` (job queue service)
- `src/lib/jobs/types.ts` (job type definitions)
- `src/lib/jobs/worker-service.ts` (worker business logic)
- `src/lib/ai/providers/mock.ts` (mock AI provider)
- `src/workers/plan-generator.ts` (worker implementation)
- `src/workers/index.ts` (worker entry point)
- `src/app/api/v1/plans/[id]/status/route.ts` (status polling endpoint)
- `src/lib/api/rate-limit.ts` (rate limiting middleware)
- `src/hooks/usePlanStatus.ts` (React polling hook)
- `src/app/api/health/worker/route.ts` (health check endpoint)
- `src/lib/jobs/__tests__/queue.test.ts` (queue tests)
- `src/workers/__tests__/plan-generator.test.ts` (worker tests)
- `src/__tests__/e2e/plan-generation.test.ts` (e2e test)

## Files to Update

- `src/lib/db/schema.ts` (add jobQueue table)
- `src/lib/ai/provider.ts` (add provider factory)
- `src/lib/ai/orchestrator.ts` (use provider factory)
- `src/app/api/v1/plans/route.ts` (replace inline generation with job enqueue)
- `src/lib/api/errors.ts` (add RateLimitError)
- `src/lib/db/queries.ts` (add monitoring queries)
- `src/app/plans/[id]/page.tsx` (add status polling)
- `src/components/plans/PlanPendingState.tsx` (enhance with progress)
- `src/components/plans/OnboardingForm.tsx` (update success toast)
- `package.json` (add worker scripts and dependencies)
- `.env.local` (add configuration variables)

---

## Success Metrics

**Development Phase**:

- [ ] Worker processes jobs within 10 seconds on average
- [ ] Job failure rate < 5% (excluding intentional test failures)
- [ ] Frontend polling updates within 5 seconds of completion
- [ ] Rate limiting prevents abuse without blocking legitimate use
- [ ] Zero jobs stuck in 'processing' state for > 5 minutes

**Production Readiness**:

- [ ] Handle 50+ concurrent generations without performance degradation
- [ ] Automatic retry recovers from 90%+ transient failures
- [ ] Health check endpoint provides accurate system status
- [ ] Worker graceful shutdown prevents job loss during deploys
- [ ] Job cleanup keeps database size under control

---

## Notes

> **Development Workflow**: Run `pnpm dev:all` to start both Next.js dev server and worker simultaneously. Both support hot reload for fast iteration.

> **Testing Mock Provider**: Toggle `MOCK_GENERATION_FAILURE_RATE` to simulate failures and test retry logic. Set to 0.5 for 50% failure rate.

> **Database Migrations**: Always run `drizzle-kit generate` and `drizzle-kit push` after updating schema. Worker expects jobQueue table to exist on startup.

> **Worker Monitoring**: Worker logs JSON to stdout. Pipe to file or log aggregator: `pnpm worker:start > worker.log 2>&1`

---

## Future Improvements: Production-Ready Queue System

### Migration to BullMQ + Redis

When the application needs to scale beyond local development, migrate from Postgres-based queue to BullMQ with Redis.

**Benefits of BullMQ + Redis**:

- ✅ **Higher throughput**: Redis is optimized for queue operations
- ✅ **Built-in retry logic**: Automatic exponential backoff
- ✅ **Priority queues**: Native support for job priorities
- ✅ **Rate limiting**: Built-in rate limiter per queue
- ✅ **Job scheduling**: Delayed jobs and cron patterns
- ✅ **Dashboard**: Bull Board for visual job monitoring
- ✅ **Horizontal scaling**: Multiple workers across servers
- ✅ **Atomic operations**: Redis transactions prevent race conditions

**Migration Path**:

1. **Add Redis to infrastructure**:
   - Local development: Docker Compose with Redis container
   - Production: Upstash Redis (free tier), AWS ElastiCache, or Railway Redis

2. **Install dependencies**:

   ```bash
   pnpm add bullmq ioredis
   pnpm add -D @bull-board/api @bull-board/express
   ```

3. **Create BullMQ adapter**:
   - Implement same interface as current queue service
   - Replace Postgres queries with BullMQ Queue methods
   - Minimal changes to worker and API code

4. **Update worker to use BullMQ**:

   ```typescript
   import { Worker } from 'bullmq';

   const worker = new Worker(
     'plan-generation',
     async (job) => {
       await processPlanGenerationJob(job);
     },
     {
       connection: redisConnection,
       concurrency: 5,
     }
   );
   ```

5. **Add Bull Board dashboard** (optional):
   - Mount at `/admin/queues` for visual monitoring
   - View job status, retries, errors in real-time
   - Manually retry failed jobs

**Estimated migration effort**: 2-4 hours (most code remains unchanged)

**When to migrate**:

- Processing > 100 jobs/hour
- Need sub-second job pickup latency
- Multiple worker processes across servers
- Advanced features like delayed jobs or recurring schedules

**Cost considerations**:

- **Upstash Redis**: Free tier includes 10,000 commands/day
- **Railway Redis**: ~$5/month for small instance
- **AWS ElastiCache**: ~$15/month for t4g.micro

The current Postgres-based system will work well for MVP and early growth. BullMQ migration can happen later without major refactoring.

---

## Additional Future Considerations

### Job Prioritization Strategy

- **Premium users**: Higher priority (priority=10)
- **Retry jobs**: Medium priority (priority=5)
- **New jobs**: Default priority (priority=0)
- **Batch operations**: Low priority (priority=-5)

### Advanced Rate Limiting

- Per-tier limits: Free (5/hour), Pro (50/hour), Enterprise (unlimited)
- Burst allowance: Allow 3 jobs in quick succession, then enforce rate
- User-specific overrides for special cases

### Job Metrics & Analytics

- Track average generation time by topic complexity
- Monitor failure rates by classification
- Alert on queue backlog thresholds
- Dashboard for system health visibility

### Multi-Worker Coordination

- Job affinity: Route similar jobs to same worker for cache efficiency
- Worker heartbeat: Detect crashed workers and reassign jobs
- Load balancing: Distribute jobs evenly across workers

### Cost Optimization

- Batch similar jobs to reduce AI API overhead
- Cache common topic patterns
- Implement token budget limits per job
- Smart retry: Skip retry for non-transient errors
