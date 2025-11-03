## Task 3: Regeneration API + job + worker

**Files:**

- Modify: `src/lib/jobs/types.ts:1`
- Modify: `src/lib/jobs/worker-service.ts:1`
- Create: `src/workers/plan-regenerator.ts`
- Implement: `src/app/api/v1/plans/[planId]/regenerate/route.ts`
- Create: `tests/integration/api/plans.regenerate.spec.ts`

**Step 1: Write the failing test (API)**

```ts
// tests/integration/api/plans.regenerate.spec.ts
import { describe, it, expect } from 'vitest';
import { regeneratePlan as apiRegeneratePlan } from '../helpers/api';

describe('POST /api/v1/plans/:id/regenerate', () => {
  it('enqueues regeneration with priority', async () => {
    const res = await apiRegeneratePlan({
      planId: 'PLAN_UUID',
      overrides: { topic: 'interview prep' },
    });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('pending');
    expect(res.body.generationId).toBeTruthy();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `vitest run tests/integration/api/plans.regenerate.spec.ts`
Expected: FAIL

**Step 3: Add job type and processing**

```ts
// src/lib/jobs/types.ts
export const JOB_TYPES = {
  PLAN_GENERATION: 'plan_generation',
  PLAN_REGENERATION: 'plan_regeneration',
} as const;

export interface PlanRegenerationJobData {
  planId: string;
  overrides?: Partial<{
    topic: string;
    skillLevel: 'beginner' | 'intermediate' | 'advanced';
    weeklyHours: number;
    learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
    startDate: string | null;
    deadlineDate: string | null;
    notes: string | null;
  }>;
}
```

```ts
// src/lib/jobs/worker-service.ts (add)
import type { PlanRegenerationJobData } from './types';

export async function processPlanRegenerationJob(
  job: Job,
  opts?: { signal?: AbortSignal }
) {
  if (job.type !== JOB_TYPES.PLAN_REGENERATION) {
    return {
      status: 'failure',
      error: `Unsupported job type: ${String(job.type)}`,
      classification: 'validation',
      retryable: false,
    };
  }
  if (!job.planId) {
    return {
      status: 'failure',
      error: 'Regeneration job missing planId',
      classification: 'validation',
      retryable: false,
    };
  }
  const data = job.data as PlanRegenerationJobData;
  // Strategy: runGenerationAttempt with merged overrides, then mark success/failure as in generation
  const provider = getGenerationProvider();
  const result = await runGenerationAttempt(
    {
      planId: job.planId,
      userId: job.userId,
      input: {
        /* merge current plan input with overrides (fetched in impl) */ ...(data.overrides as any),
      },
    },
    { provider, signal: opts?.signal }
  );

  if (result.status === 'success') {
    const payload = buildJobResult(
      result.modules,
      result.durationMs,
      result.attempt.id,
      result.metadata
    );
    await markPlanGenerationSuccess(job.planId);
    return { status: 'success', result: payload };
  }
  const message =
    typeof result.error === 'string'
      ? result.error
      : ((result.error as Error)?.message ?? 'Regeneration failed');
  if (
    result.classification !== 'validation' &&
    result.classification !== 'capped'
  ) {
    return {
      status: 'failure',
      error: message,
      classification: result.classification,
      retryable: true,
    };
  }
  await markPlanGenerationFailure(job.planId);
  return {
    status: 'failure',
    error: message,
    classification: result.classification,
    retryable: false,
  };
}
```

```ts
// src/workers/plan-regenerator.ts
import { client } from '@/lib/db/drizzle';
import { completeJob, failJob, getNextJob } from '@/lib/jobs/queue';
import { JOB_TYPES, type Job } from '@/lib/jobs/types';
import { processPlanRegenerationJob } from '@/lib/jobs/worker-service';

// Minimal worker loop mirroring plan-generator, polling PLAN_REGENERATION
async function main() {
  const shutdown = new AbortController();
  process.on('SIGINT', () => shutdown.abort());
  process.on('SIGTERM', () => shutdown.abort());

  while (!shutdown.signal.aborted) {
    const job = await getNextJob([JOB_TYPES.PLAN_REGENERATION]);
    if (!job) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    try {
      const result = await processPlanRegenerationJob(job, {
        signal: shutdown.signal,
      });
      if (result.status === 'success') {
        await completeJob(job.id, result.result);
      } else {
        await failJob(
          job.id,
          result.error,
          result.retryable ? undefined : { retryable: false }
        );
      }
    } catch (e: any) {
      await failJob(job.id, e?.message ?? 'Unhandled regeneration error');
    }
  }
  await client.end({ timeout: 5 });
}

void main();
```

**Step 4: Implement route**

```ts
// src/app/api/v1/plans/[planId]/regenerate/route.ts
import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { json, jsonError } from '@/lib/api/response';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { getPlanById } from '@/lib/db/queries/plans';
import { enqueueJob } from '@/lib/jobs/queue';
import { JOB_TYPES, type PlanRegenerationJobData } from '@/lib/jobs/types';
import { isPriorityTopic, computeJobPriority } from '@/lib/queue/priority';
import { resolveUserTier } from '@/lib/stripe/usage';
import { z } from 'zod';

const overridesSchema = z
  .object({
    topic: z.string().trim().min(3).optional(),
    notes: z.string().trim().max(2000).optional(),
    skillLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    weeklyHours: z.number().int().min(1).max(80).optional(),
    learningStyle: z.enum(['reading', 'video', 'practice', 'mixed']).optional(),
    startDate: z.string().datetime().optional(),
    deadlineDate: z.string().datetime().optional(),
  })
  .strict();

export const POST = withErrorBoundary(
  withAuth(async ({ params, req, userId }) => {
    const body = (await req.json().catch(() => ({}))) as Partial<{
      overrides: unknown;
    }>;
    const overrides = overridesSchema.parse(body.overrides ?? {});

    const user = await getUserByClerkId(userId);
    if (!user) return jsonError('User not found', { status: 404 });

    const planId = String((params as any).planId);
    const plan = await getPlanById(planId);
    if (!plan || plan.userId !== user.id) {
      return jsonError('Plan not found', { status: 404 });
    }

    // TODO: enforce regeneration feature limits via gates if needed

    const tier = await resolveUserTier(user.id);
    const priority = computeJobPriority({
      tier,
      isPriorityTopic: isPriorityTopic(overrides.topic ?? plan.topic),
    });

    const payload: PlanRegenerationJobData = { planId, overrides };
    await enqueueJob(
      JOB_TYPES.PLAN_REGENERATION,
      planId,
      user.id,
      payload,
      priority
    );

    return json(
      { generationId: planId, planId, status: 'pending' },
      { status: 202 }
    );
  })
);
```

**Step 5: Run tests**

Run: `vitest run tests/integration/api/plans.regenerate.spec.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/jobs/types.ts src/lib/jobs/worker-service.ts src/workers/plan-regenerator.ts src/app/api/v1/plans/[planId]/regenerate/route.ts
git commit -m "feat(regen): add regeneration API, job type, and worker"
```

---
