# Plan Generation Architecture

**Audience:** Junior developers onboarding to the plan generation system  
**Last Updated:** January 2026

## Overview

Atlaris generates personalized learning plans using AI. The system transforms a user's learning goal (topic, skill level, available hours) into a structured curriculum with modules, tasks, and resources—then syncs to their calendar.

This document explains the complete flow from user request to persisted plan.

---

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER REQUEST FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. User submits form          2. API creates plan record                   │
│     ┌─────────────┐               ┌─────────────────────┐                   │
│     │ POST        │               │ learning_plans      │                   │
│     │ /api/v1/    │──────────────>│ status: generating  │                   │
│     │ plans       │               │ modules: []         │                   │
│     └─────────────┘               └─────────────────────┘                   │
│                                            │                                │
│  3. Client calls stream endpoint           │                                │
│     ┌─────────────────────┐               │                                │
│     │ POST                │               │                                │
│     │ /api/v1/plans/      │<──────────────┘                                │
│     │ stream              │                                                 │
│     └─────────────────────┘                                                 │
│              │                                                              │
│              ▼                                                              │
│  4. AI Generation Pipeline                                                  │
│     ┌─────────────────────────────────────────────────────────────┐        │
│     │  orchestrator.ts                                             │        │
│     │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │        │
│     │  │ startAttempt│─>│ provider.   │─>│ parser.ts   │          │        │
│     │  │ (DB)        │  │ generate()  │  │ (validate)  │          │        │
│     │  └─────────────┘  └─────────────┘  └─────────────┘          │        │
│     │         │                │                │                  │        │
│     │         │                │                │                  │        │
│     │         │                ▼                ▼                  │        │
│     │         │         ┌─────────────┐  ┌─────────────┐          │        │
│     │         │         │ OpenRouter  │  │ pacePlan()  │          │        │
│     │         │         │ (AI Model)  │  │ (fit hours) │          │        │
│     │         │         └─────────────┘  └─────────────┘          │        │
│     │         │                                    │               │        │
│     │         ▼                                    ▼               │        │
│     │  ┌─────────────────────────────────────────────────┐        │        │
│     │  │ recordSuccess() or recordFailure()              │        │        │
│     │  │ (atomic: attempt + modules + tasks + status)    │        │        │
│     │  └─────────────────────────────────────────────────┘        │        │
│     └─────────────────────────────────────────────────────────────┘        │
│              │                                                              │
│              ▼                                                              │
│  5. SSE Stream to Client                                                    │
│     ┌─────────────────────────────────────────────────────┐                │
│     │ Events: plan_start → module_summary → progress →    │                │
│     │         complete (or error)                         │                │
│     └─────────────────────────────────────────────────────┘                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## File Responsibility Matrix

### API Layer (`src/app/api/v1/plans/`)

| File                         | Responsibility                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `route.ts`                   | `POST /plans` - Validates input, creates plan record with `generating` status, returns plan ID immediately |
| `stream/route.ts`            | `POST /plans/stream` - Triggers AI generation, streams SSE events to client                                |
| `stream/helpers.ts`          | Stream event handlers (`onSuccess`, `onFailure`) for updating DB                                           |
| `[planId]/status/route.ts`   | `GET /plans/{id}/status` - Returns current generation status for polling                                   |
| `[planId]/attempts/route.ts` | `GET /plans/{id}/attempts` - Returns generation attempt history                                            |

### AI Layer (`src/lib/ai/`)

| File                      | Responsibility                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `orchestrator.ts`         | **Main entry point** - `runGenerationAttempt()` coordinates the entire generation flow  |
| `provider-factory.ts`     | Selects provider: `MockGenerationProvider` (tests) vs `RouterGenerationProvider` (prod) |
| `providers/router.ts`     | Routes to OpenRouter with p-retry fallback logic                                        |
| `providers/openrouter.ts` | OpenRouter SDK integration, constructs prompts, handles API calls                       |
| `providers/mock.ts`       | Deterministic mock for testing (no external calls)                                      |
| `parser.ts`               | Parses AI JSON output into `ParsedModule[]`, validates with Zod                         |
| `pacing.ts`               | `pacePlan()` - Trims/adjusts modules to fit user's weekly hours                         |
| `prompts.ts`              | System and user prompt builders for curriculum generation                               |
| `schema.ts`               | Zod schemas for AI output validation                                                    |
| `classification.ts`       | Classifies failures: `timeout`, `rate_limit`, `provider_error`, `validation`, `capped`  |
| `timeout.ts`              | Adaptive timeout with extension on first module detection                               |

### Database Layer (`src/lib/db/`)

| File                     | Responsibility                                                                  |
| ------------------------ | ------------------------------------------------------------------------------- |
| `schema/tables/plans.ts` | Schema: `learning_plans`, `modules`, `tasks`, `generation_attempts`             |
| `queries/attempts.ts`    | `startAttempt()`, `recordSuccess()`, `recordFailure()` with atomic transactions |
| `queries/plans.ts`       | Plan CRUD operations                                                            |
| `runtime.ts`             | `getDb()` - RLS-enforced client for request handlers                            |
| `service-role.ts`        | `db` - Bypasses RLS (tests/workers only)                                        |

### Streaming (`src/lib/ai/streaming/`)

| File        | Responsibility                                  |
| ----------- | ----------------------------------------------- |
| `events.ts` | SSE stream creation utilities, event formatting |

---

## Data Flow: Step by Step

### Step 1: Plan Creation (`POST /api/v1/plans`)

```typescript
// User submits:
{
  topic: "Learn TypeScript fundamentals",
  skillLevel: "beginner",
  weeklyHours: 10,
  learningStyle: "mixed",
  notes: "Focus on practical examples"
}

// API does:
1. Authenticate user (Clerk)
2. Rate limit check (10 requests / 60 minutes)
3. Validate input with Zod
4. Truncate if needed (topic ≤200 chars, notes ≤2000 chars)
5. Insert plan record with status: 'generating'
6. Return { planId, status: 'generating' }
```

### Step 2: Generation Trigger (`POST /api/v1/plans/stream`)

```typescript
// Client calls with planId
// API does:
1. Verify plan exists and belongs to user
2. Check plan isn't already 'ready' or at max attempts
3. Start SSE stream response
4. Call runGenerationAttempt()
5. Stream events as generation progresses
```

### Step 3: AI Generation (`orchestrator.ts`)

```typescript
async function runGenerationAttempt(
  { planId, userId, input },
  { provider, timeoutConfig, signal }
): Promise<GenerationResult> {
  // 1. Record attempt start in DB
  const attempt = await startAttempt(planId, userId);

  // 2. Call AI provider
  const { stream, metadata } = await provider.generate(input, {
    signal,
    timeoutMs: timeoutConfig.baseMs,
  });

  // 3. Parse and validate AI output
  const modules = await parseGenerationStream(stream, {
    onFirstModule: () => timeoutConfig.extend(),
    onProgress: (pct) => emit('progress', pct),
  });

  // 4. Adjust to fit user's hours
  const pacedModules = pacePlan(modules, input.weeklyHours);

  // 5. Persist atomically
  await recordSuccess(attempt.id, pacedModules);

  return { status: 'success', modules: pacedModules };
}
```

### Step 4: Database Persistence (`queries/attempts.ts`)

```typescript
// recordSuccess() does atomic transaction:
await db.transaction(async (tx) => {
  // 1. Update attempt status
  await tx.update(generationAttempts)
    .set({ status: 'completed', completedAt: new Date() })
    .where(eq(generationAttempts.id, attemptId));

  // 2. Insert modules with order (1, 2, 3...)
  for (const [idx, module] of modules.entries()) {
    const [inserted] = await tx.insert(modules)
      .values({ planId, title: module.title, order: idx + 1, ... })
      .returning();

    // 3. Insert tasks for each module
    for (const [taskIdx, task] of module.tasks.entries()) {
      await tx.insert(tasks)
        .values({ moduleId: inserted.id, title: task.title, order: taskIdx + 1, ... });
    }
  }

  // 4. Update plan status to 'ready'
  await tx.update(learningPlans)
    .set({ generationStatus: 'ready', updatedAt: new Date() })
    .where(eq(learningPlans.id, planId));
});
```

---

## Status State Machine

```
┌─────────────────────────────────────────────────────────────────┐
│                    PLAN GENERATION STATUS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────┐                                                  │
│  │ generating │ ◄─── Initial state on plan creation             │
│  └──────┬─────┘                                                  │
│         │                                                        │
│         ├───────────────────────┐                                │
│         │                       │                                │
│         ▼                       ▼                                │
│  ┌────────────┐          ┌────────────┐                         │
│  │   ready    │          │   failed   │                         │
│  └────────────┘          └──────┬─────┘                         │
│  At least one             All attempts│failed                    │
│  module generated         (max 3)     │                          │
│                                       │                          │
│                           ┌───────────┴───────────┐              │
│                           │ Failure Classifications│              │
│                           ├───────────────────────┤              │
│                           │ • timeout             │              │
│                           │ • rate_limit          │              │
│                           │ • provider_error      │              │
│                           │ • validation          │              │
│                           │ • capped (max reached)│              │
│                           └───────────────────────┘              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Status Derivation Logic

```typescript
function deriveStatus(plan: LearningPlan): 'generating' | 'ready' | 'failed' {
  if (plan.modules.length > 0) return 'ready';
  if (plan.attemptCount >= MAX_ATTEMPTS) return 'failed';
  return 'generating';
}
```

---

## SSE Stream Events

The stream endpoint emits these events to the client:

| Event            | Payload                                 | When                      |
| ---------------- | --------------------------------------- | ------------------------- |
| `plan_start`     | `{ planId, attemptNumber }`             | Generation begins         |
| `module_summary` | `{ title, estimatedMinutes }`           | Each module parsed        |
| `progress`       | `{ percent: number }`                   | Periodic progress updates |
| `complete`       | `{ planId, moduleCount, totalMinutes }` | Success                   |
| `error`          | `{ code, message, retryable }`          | Failure                   |

### Client-Side Handling

```typescript
const eventSource = new EventSource(`/api/v1/plans/stream?planId=${planId}`);

eventSource.addEventListener('module_summary', (e) => {
  const data = JSON.parse(e.data);
  addModuleToUI(data.title);
});

eventSource.addEventListener('complete', (e) => {
  eventSource.close();
  navigateToPlan(planId);
});

eventSource.addEventListener('error', (e) => {
  const data = JSON.parse(e.data);
  if (data.retryable) showRetryButton();
  else showErrorMessage(data.message);
});
```

---

## Error Handling & Retry Logic

### Failure Classification

| Classification   | Cause                     | Retryable     | User Message                                       |
| ---------------- | ------------------------- | ------------- | -------------------------------------------------- |
| `timeout`        | AI response too slow      | Yes           | "Generation timed out. Try again."                 |
| `rate_limit`     | OpenRouter throttled      | Yes (backoff) | "Service busy. Please wait."                       |
| `provider_error` | API error from OpenRouter | Maybe         | "AI service error. Try again later."               |
| `validation`     | AI output didn't parse    | No            | "Invalid response. Contact support."               |
| `capped`         | Max 3 attempts reached    | No            | "Generation failed. Please try a different topic." |

### Retry Strategy (p-retry in `providers/router.ts`)

```typescript
const result = await pRetry(() => openRouterClient.generate(prompt), {
  retries: 2,
  onFailedAttempt: (error) => {
    if (error.response?.status === 429) {
      // Rate limited - use exponential backoff
      throw error; // Will retry
    }
    if (error.response?.status >= 500) {
      throw error; // Will retry
    }
    // 4xx errors (except 429) - don't retry
    throw new AbortError(error.message);
  },
});
```

### Timeout Strategy (Adaptive)

```typescript
const timeout = createAdaptiveTimeout({
  baseMs: 15_000, // Initial: 15 seconds
  extensionMs: 10_000, // Add 10s when first module detected
  maxMs: 45_000, // Never exceed 45 seconds
});

// In parser:
onFirstModuleDetected: () => timeout.extend();
```

---

## Provider Abstraction

All providers implement `AiPlanGenerationProvider`:

```typescript
interface AiPlanGenerationProvider {
  generate(
    input: GenerationInput,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<{
    stream: ReadableStream<Uint8Array>;
    metadata: ProviderMetadata;
  }>;
}
```

### Provider Selection (`provider-factory.ts`)

```typescript
export function getGenerationProvider(): AiPlanGenerationProvider {
  // Check environment
  if (process.env.AI_PROVIDER === 'mock') {
    return new MockGenerationProvider({
      deterministicSeed: process.env.MOCK_GENERATION_SEED,
    });
  }

  return new RouterGenerationProvider();
}

// For user-selected models:
export function getGenerationProviderWithModel(
  modelId: string
): AiPlanGenerationProvider {
  return new RouterGenerationProvider({ modelId });
}
```

### Available Providers

| Provider                   | Use Case         | External Calls |
| -------------------------- | ---------------- | -------------- |
| `MockGenerationProvider`   | Tests, local dev | None           |
| `RouterGenerationProvider` | Production       | OpenRouter API |

---

## Database Schema (Relevant Tables)

### `learning_plans`

```sql
CREATE TABLE learning_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  skill_level skill_level NOT NULL,
  weekly_hours INTEGER NOT NULL,
  learning_style learning_style NOT NULL,
  notes TEXT,
  generation_status generation_status DEFAULT 'generating',
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `modules`

```sql
CREATE TABLE modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES learning_plans(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  estimated_minutes INTEGER NOT NULL,
  "order" INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(plan_id, "order")  -- Enforces sequential ordering
);
```

### `tasks`

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  estimated_minutes INTEGER NOT NULL,
  "order" INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(module_id, "order")  -- Enforces sequential ordering
);
```

### `generation_attempts`

```sql
CREATE TABLE generation_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES learning_plans(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL,  -- 'pending', 'completed', 'failed'
  failure_classification TEXT,  -- 'timeout', 'rate_limit', etc.
  error_message TEXT,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(plan_id, attempt_number)
);
```

---

## RLS (Row Level Security)

All plan-related tables have RLS policies. In request handlers:

```typescript
// CORRECT: Use RLS-enforced client
import { getDb } from '@/lib/db/runtime';

export async function GET(request: Request) {
  const db = getDb(); // Respects RLS
  const plans = await db.select().from(learningPlans);
  // User only sees their own plans
}

// WRONG: Bypasses RLS - NEVER in request handlers
import { db } from '@/lib/db/service-role';
```

### How RLS Works

`getDb()` returns the request-scoped client created by middleware/context setup. The underlying RLS client (`src/lib/db/rls.ts`) does two security-critical steps:

1. `SET ROLE authenticated` or `SET ROLE anonymous`
2. `auth.jwt_session_init('<clerk_jwt>')` to validate identity for authenticated sessions

Current product policy scopes app-data RLS to `authenticated`; anonymous role has no app-data read policies.

```sql
-- Authenticated: own plans only
CREATE POLICY learning_plans_select
  ON learning_plans
  FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM users
      WHERE clerk_user_id = auth.user_id()
    )
  );
```

---

## Testing Patterns

### Unit Tests (No DB, No External Calls)

```typescript
// Test orchestrator with mock provider
describe('runGenerationAttempt', () => {
  it('returns success with parsed modules', async () => {
    const mockProvider = new MockGenerationProvider({
      deterministicSeed: 42,
    });

    const result = await runGenerationAttempt(
      { planId: 'test-plan', userId: 'test-user', input: mockInput },
      { provider: mockProvider }
    );

    expect(result.status).toBe('success');
    expect(result.modules).toHaveLength(3);
  });
});
```

### Integration Tests (Real DB, Mock Provider)

```typescript
describe('Plan generation flow', () => {
  it('persists modules atomically', async () => {
    // Setup: Create plan in DB
    const plan = await createTestPlan();

    // Act: Run generation with mock
    await runGenerationAttempt({ planId: plan.id, ... });

    // Assert: Check DB state
    const modules = await db.select().from(modulesTable)
      .where(eq(modulesTable.planId, plan.id));

    expect(modules).toHaveLength(3);
    expect(modules[0].order).toBe(1);
    expect(modules[1].order).toBe(2);
  });
});
```

### Capturing AI Input (for debugging)

```typescript
// In tests, capture what was sent to the provider:
globalThis.__capturedInputs = [];

const mockProvider = {
  async generate(input) {
    globalThis.__capturedInputs.push(input);
    return mockResponse;
  },
};

// After test:
expect(globalThis.__capturedInputs[0].topic).toBe('TypeScript');
```

---

## Common Tasks

### Adding a New AI Model

1. Add model to `docs/rules/ai/available-models.md`
2. Ensure model ID works with OpenRouter
3. Test with `getGenerationProviderWithModel(modelId)`

### Changing Prompt Structure

1. Modify `src/lib/ai/prompts.ts`
2. Update Zod schemas in `src/lib/ai/schema.ts` if output shape changes
3. Update parser in `src/lib/ai/parser.ts`
4. Run integration tests

### Adjusting Timeout Behavior

1. Modify `src/lib/ai/timeout.ts`
2. Update `baseMs`, `extensionMs`, `maxMs` as needed
3. Test with slow mock provider

### Adding a New Stream Event

1. Define event type in `src/lib/ai/streaming/events.ts`
2. Emit from orchestrator at appropriate point
3. Handle in client-side EventSource listener

---

## Anti-Patterns to Avoid

| Don't                            | Why                                    | Do Instead                                |
| -------------------------------- | -------------------------------------- | ----------------------------------------- |
| Call OpenRouter directly         | Bypasses retry logic, timeout handling | Use `getGenerationProvider()`             |
| Ignore `signal` parameter        | Breaks request cancellation            | Always pass `signal` to provider          |
| Hardcode timeout values          | Can't adapt to AI response speed       | Use `createAdaptiveTimeout()`             |
| Use `db` in API routes           | Bypasses RLS security                  | Use `getDb()` from `runtime.ts`           |
| Batch-insert without transaction | Partial failures leave bad state       | Use `db.transaction()`                    |
| Log full AI output               | PII/token exposure                     | Log only metadata (duration, token count) |

---

## Related Documentation

- [AI Module AGENTS.md](../../../src/lib/ai/AGENTS.md) - Provider interface, testing patterns
- [Database Client Usage](../database/client-usage.md) - RLS-enforced vs service-role
- [Rate Limiting](../api/rate-limiting.md) - Request limits per endpoint
- [Available Models](./available-models.md) - Model IDs and pricing
