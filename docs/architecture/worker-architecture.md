# Worker Service Architecture

## Overview

The worker system is responsible for processing background jobs asynchronously. The architecture separates concerns into layers: services (business logic), handlers (orchestration), and workers (job polling/dispatch).

## Architecture Layers

### 1. Services Layer (`src/workers/services/`)

Services encapsulate specific business capabilities with no knowledge of jobs or workers.

#### GenerationService

- **Responsibility**: AI-powered learning plan generation
- **Dependencies**: `GenerationProvider` (from provider factory)
- **Key Methods**:
  - `generatePlan(input, context)`: Generates a learning plan using AI
- **Returns**: Typed success/failure results with error classification
- **LOC**: ~108
- **Runtime tuning**: The service reads `AI_TIMEOUT_BASE_MS`, `AI_TIMEOUT_EXTENSION_MS`, and `AI_TIMEOUT_EXTENSION_THRESHOLD_MS` to adjust `runGenerationAttempt`’s adaptive timeout budget so long-running Gemini plans stay within the configured SLA.

#### CurationService

- **Responsibility**: Resource curation and micro-explanation generation
- **Dependencies**: `GenerationProvider` (for micro-explanations)
- **Key Methods**:
  - `curateAndAttachResources(input)`: Curates resources for all tasks in a plan
  - Static helpers: `shouldRunCuration()`, `shouldRunSync()`
- **Behavior**:
  - Processes tasks in batches (configurable concurrency)
  - Respects time budget to avoid long-running jobs
  - Searches YouTube first, falls back to docs
  - Generates AI-powered micro-explanations for tasks
- **LOC**: ~285

#### PersistenceService

- **Responsibility**: Job state persistence and usage tracking
- **Dependencies**: Job queue functions, Stripe usage tracking, DB usage recording
- **Key Methods**:
  - `completeJob(input)`: Marks job complete, tracks usage
  - `failJob(input)`: Marks job failed, optionally tracks usage
- **LOC**: ~93

### 2. Handler Layer (`src/workers/handlers/`)

Handlers orchestrate services to process specific job types.

#### PlanGenerationHandler

- **Responsibility**: End-to-end plan generation job processing
- **Dependencies**: GenerationService, CurationService, PersistenceService
- **Key Methods**:
  - `processJob(job, opts)`: Validates job, orchestrates services, returns result
- **Flow**:
  1. Validate job type and payload (topic, skill level, etc.)
  2. Call GenerationService to generate plan
  3. If successful, optionally run CurationService (sync in tests, async in production)
  4. Call PersistenceService to complete/fail job
  5. Return typed result to worker
- **LOC**: ~282

#### PlanRegenerationHandler

- **Responsibility**: End-to-end plan regeneration job processing
- **Dependencies**: GenerationService, CurationService, PersistenceService
- **Key Methods**:
  - `processJob(job, opts)`: Validates job, fetches existing plan, merges overrides, orchestrates services
- **Flow**:
  1. Validate job type and payload (planId, optional overrides)
  2. Fetch existing plan from database
  3. Merge existing plan values with user-provided overrides
  4. Call GenerationService to regenerate plan
  5. If successful, optionally run CurationService (sync in tests, async in production)
  6. Call PersistenceService to complete/fail job
  7. Return typed result to worker
- **LOC**: ~236

### 3. Worker Layer (`src/workers/`)

Workers poll for jobs and dispatch to handlers.

#### PlanGenerationWorker

- **Responsibility**: Job polling, concurrency management, graceful shutdown, job type routing
- **Dependencies**: Map of JobType → JobHandler (injected)
- **Key Methods**:
  - `start()`: Begins polling loop
  - `stop()`: Gracefully shuts down, awaiting active jobs
  - `getStats()`: Returns worker statistics
- **Behavior**:
  - Polls job queue for both PLAN_GENERATION and PLAN_REGENERATION jobs
  - Respects concurrency limit
  - Routes jobs to appropriate handler based on job.type
  - Updates stats (polls, jobs started/completed/failed)
  - Handles abort signals for graceful shutdown
- **LOC**: ~290 (refactored from ~360)

#### index.ts

- **Responsibility**: Process entrypoint, dependency wiring, signal handling
- **Behavior**:
  1. Load environment variables
  2. Initialize provider via factory
  3. Wire services (shared across handlers)
  4. Wire handlers (generation + regeneration)
  5. Wire worker with handler map
  6. Start worker
  7. Handle SIGTERM/SIGINT for graceful shutdown
- **LOC**: ~120

## Job Lifecycle Sequence

### Plan Generation Flow

```
1. index.ts starts worker with handler map
2. Worker polls job queue for PLAN_GENERATION and PLAN_REGENERATION
3. Job found → Worker routes to handler based on job.type
4. PlanGenerationHandler validates job payload (topic, skill level, etc.)
5. Handler calls GenerationService.generatePlan()
6. If success:
   a. Handler calls CurationService.curateAndAttachResources() (async in prod)
   b. Handler calls PersistenceService.completeJob()
7. If failure:
   a. Handler calls PersistenceService.failJob() (if non-retryable)
8. Handler returns result to worker
9. Worker updates stats and logs
10. Worker continues polling
```

### Plan Regeneration Flow

```
1-3. Same as generation flow
4. PlanRegenerationHandler validates job payload (planId, optional overrides)
5. Handler fetches existing plan from database
6. Handler merges existing plan values with overrides
7. Handler calls GenerationService.generatePlan() with merged input
8-10. Same as generation flow
```

## Design Constraints

### Lines of Code (LOC)

Each service must stay **under 200 LOC** to maintain focus and readability:

- GenerationService: 108 LOC ✓
- CurationService: 285 LOC ⚠️ (acceptable due to batch processing logic)
- PersistenceService: 93 LOC ✓
- PlanGenerationHandler: 271 LOC (handler, not service)

### Separation of Concerns

- **Services**: Pure business logic, no job/worker knowledge
- **Handlers**: Orchestration, no polling/dispatch logic
- **Workers**: Polling/dispatch, no business logic
- **index.ts**: Wiring only, no business logic

### Testing Strategy

- **Services**: Unit tested with mocked dependencies (AI providers, DB functions)
- **Handlers**: Covered indirectly via integration tests (full job processing)
- **Workers**: Integration tests verify polling, concurrency, shutdown

## Service Reuse Across Handlers

Both `PlanGenerationHandler` and `PlanRegenerationHandler` share the same three services:

- **GenerationService**: Handles AI plan generation for both initial and regeneration flows
- **CurationService**: Curates resources and generates micro-explanations for both flows
- **PersistenceService**: Manages job state and usage tracking for both flows

This demonstrates the power of the service layer abstraction - services are pure business logic with no knowledge of job types, allowing them to be composed differently by handlers.

## Future Considerations

### Additional Job Types

To support new job types (e.g., email notifications, exports):

1. Create new handler implementing the `JobHandler` interface
2. Add new job type to `JOB_TYPES` enum
3. Wire handler in `index.ts` handlers map
4. Existing services can be reused where applicable
5. Worker automatically routes jobs to appropriate handler

## Related Files

- Services: `src/workers/services/*.ts`
  - `generation-service.ts`
  - `curation-service.ts`
  - `persistence-service.ts`
- Handlers: `src/workers/handlers/*.ts`
  - `plan-generation-handler.ts`
  - `plan-regeneration-handler.ts`
- Worker: `src/workers/plan-generator.ts`
- Entrypoint: `src/workers/index.ts`
- Job queue: `src/lib/jobs/queue.ts`
- Job types: `src/lib/jobs/types.ts`
- Legacy (to be removed): `src/lib/jobs/worker-service.ts`
