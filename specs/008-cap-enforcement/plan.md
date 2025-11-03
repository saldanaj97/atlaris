# Freemium SaaS Caps, Regeneration, and Priority Implementation Plan

> Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enforce free-tier plan duration caps, add plan regeneration (API + worker + UI), and prioritize jobs for premium tiers/priority topics with clear UI messaging.

**Architecture:** Server validates tier caps before AI work; job queue stores priority and orders by priority desc + FIFO. Add a dedicated regeneration route that enqueues a regeneration job. Workers process generation and regeneration job types. UI surfaces gates and upgrade prompts.

**Tech Stack:** Next.js 15 App Router (TypeScript), Drizzle ORM, Vercel AI SDK, Stripe, Clerk, Vitest.

---

## Task 1: Define tier caps and priority topics

**Files:**

- Modify: `src/lib/stripe/usage.ts:1`
- Create: `src/lib/queue/priority.ts`
- Test: `tests/unit/stripe/usage.caps.spec.ts`, `tests/unit/queue/priority.spec.ts`

**Step 1: Write the failing test (caps)**

```ts
// tests/unit/stripe/usage.caps.spec.ts
import { describe, it, expect } from 'vitest';
import { checkPlanDurationCap, __test__ } from '@/lib/stripe/usage';

describe('checkPlanDurationCap', () => {
  it('blocks free > 2 weeks', async () => {
    const weeks = 3;
    const res = await checkPlanDurationCap({
      tier: 'free',
      weeklyHours: 5,
      totalWeeks: weeks,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/2-week/);
  });

  it('allows free == 2 weeks', async () => {
    const res = await checkPlanDurationCap({
      tier: 'free',
      weeklyHours: 5,
      totalWeeks: 2,
    });
    expect(res.allowed).toBe(true);
  });

  it('allows pro unlimited', async () => {
    const res = await checkPlanDurationCap({
      tier: 'pro',
      weeklyHours: 10,
      totalWeeks: 52,
    });
    expect(res.allowed).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `vitest run tests/unit/stripe/usage.caps.spec.ts -t "blocks free > 2 weeks"`
Expected: FAIL (function not found)

**Step 3: Implement tier caps + helper**

```ts
// src/lib/stripe/usage.ts
export const TIER_LIMITS = {
  free: {
    maxActivePlans: 3,
    monthlyRegenerations: 5,
    monthlyExports: 10,
    maxWeeks: 2 as number | null,
    maxHours: null as number | null,
  },
  starter: {
    maxActivePlans: 10,
    monthlyRegenerations: 10,
    monthlyExports: 50,
    maxWeeks: 8 as number | null,
    maxHours: null as number | null,
  },
  pro: {
    maxActivePlans: Infinity,
    monthlyRegenerations: 50,
    monthlyExports: Infinity,
    maxWeeks: null as number | null, // unlimited
    maxHours: null as number | null,
  },
} as const;

type SubscriptionTier = keyof typeof TIER_LIMITS;

export async function resolveUserTier(
  userId: string
): Promise<SubscriptionTier> {
  // existing getUserTier, exported for reuse
  // implementation remains same, exposed for API routes
  return await getUserTier(userId);
}

export function checkPlanDurationCap(params: {
  tier: SubscriptionTier;
  weeklyHours: number;
  totalWeeks: number;
}): { allowed: boolean; reason?: string; upgradeUrl?: string } {
  const caps = TIER_LIMITS[params.tier];
  if (caps.maxWeeks !== null && params.totalWeeks > caps.maxWeeks) {
    const recommended = params.totalWeeks > 8 ? 'pro' : 'starter';
    return {
      allowed: false,
      reason: `${params.tier} tier limited to ${caps.maxWeeks}-week plans. Upgrade to ${recommended} for longer plans.`,
      upgradeUrl: '/pricing',
    };
  }
  if (
    caps.maxHours !== null &&
    params.weeklyHours * params.totalWeeks > caps.maxHours
  ) {
    return {
      allowed: false,
      reason: `${params.tier} tier limited to ${caps.maxHours} total hours. Upgrade for more time.`,
      upgradeUrl: '/pricing',
    };
  }
  return { allowed: true };
}

export const __test__ = { TIER_LIMITS };
```

**Step 4: Run test to verify it passes**

Run: `vitest run tests/unit/stripe/usage.caps.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/stripe/usage.ts tests/unit/stripe/usage.caps.spec.ts
git commit -m "feat(caps): add plan duration caps and checkPlanDurationCap()"
```

—

**Step 1: Write the failing test (priority)**

```ts
// tests/unit/queue/priority.spec.ts
import { describe, it, expect } from 'vitest';
import { computeJobPriority, PRIORITY_TOPICS } from '@/lib/queue/priority';

describe('computeJobPriority', () => {
  it('gives higher base priority to paid tiers', () => {
    expect(
      computeJobPriority({ tier: 'pro', isPriorityTopic: false })
    ).toBeGreaterThan(
      computeJobPriority({ tier: 'free', isPriorityTopic: false })
    );
  });
  it('boosts priority for priority topics', () => {
    const freeBase = computeJobPriority({
      tier: 'free',
      isPriorityTopic: false,
    });
    const freePriority = computeJobPriority({
      tier: 'free',
      isPriorityTopic: true,
    });
    expect(freePriority).toBeGreaterThan(freeBase);
  });
  it('PRIORITY_TOPICS contains non-empty list', () => {
    expect(PRIORITY_TOPICS.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `vitest run tests/unit/queue/priority.spec.ts -t "gives higher base priority"`
Expected: FAIL (module not found)

**Step 3: Implement priority helper**

```ts
// src/lib/queue/priority.ts
export const PRIORITY_TOPICS = [
  // seed examples; business can tune this list
  'interview prep',
  'ai engineering',
  'machine learning',
  'data structures',
] as const;

type Tier = 'free' | 'starter' | 'pro';

export function isPriorityTopic(topic: string): boolean {
  const lower = topic.trim().toLowerCase();
  return PRIORITY_TOPICS.some((t) => lower.includes(t));
}

export function computeJobPriority(params: {
  tier: Tier;
  isPriorityTopic: boolean;
}): number {
  const base = params.tier === 'pro' ? 10 : params.tier === 'starter' ? 5 : 1;
  const topicBoost = params.isPriorityTopic ? 3 : 0;
  return base + topicBoost;
}
```

**Step 4: Run test to verify it passes**

Run: `vitest run tests/unit/queue/priority.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/queue/priority.ts tests/unit/queue/priority.spec.ts
git commit -m "feat(priority): add priority topic list and job priority computation"
```

---

## Task 2: Enforce free-tier cap at API validation

**Files:**

- Modify: `src/app/api/v1/plans/route.ts:1`
- Modify: `src/lib/stripe/usage.ts:1`
- Test: `tests/integration/api/plans.caps.spec.ts`

**Step 1: Write the failing integration test**

```ts
// tests/integration/api/plans.caps.spec.ts
import { describe, it, expect } from 'vitest';
import { createPlan as apiCreatePlan } from '../helpers/api';

describe('POST /api/v1/plans - caps', () => {
  it('rejects free > 2 weeks before enqueue', async () => {
    const res = await apiCreatePlan({
      tier: 'free',
      topic: 'ai engineering',
      weeklyHours: 5,
      // 3 weeks from now
      startDate: undefined,
      deadlineDate: new Date(Date.now() + 21 * 24 * 3600 * 1000).toISOString(),
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/2-week/);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `vitest run tests/integration/api/plans.caps.spec.ts`
Expected: FAIL

**Step 3: Implement server validation**

```ts
// src/app/api/v1/plans/route.ts (snippet inside POST handler, before enqueueJob)
import { resolveUserTier, checkPlanDurationCap } from '@/lib/stripe/usage';
import { jsonError } from '@/lib/api/response';
import { isPriorityTopic, computeJobPriority } from '@/lib/queue/priority';

// ... after payload validated and user loaded
const userTier = await resolveUserTier(user.id);

// Compute requested totalWeeks (deadline - start or default to 2 if missing)
const start = body.startDate ? new Date(body.startDate) : new Date();
const end = body.deadlineDate
  ? new Date(body.deadlineDate)
  : new Date(start.getTime() + 14 * 24 * 3600 * 1000);
const totalWeeks = Math.max(
  1,
  Math.ceil((end.getTime() - start.getTime()) / (7 * 24 * 3600 * 1000))
);

const cap = checkPlanDurationCap({
  tier: userTier,
  weeklyHours: body.weeklyHours,
  totalWeeks,
});
if (!cap.allowed) {
  return jsonError(cap.reason ?? 'Plan duration exceeds tier cap', {
    status: 403,
  });
}
```

Also set job priority at enqueue time:

```ts
const priority = computeJobPriority({
  tier: userTier,
  isPriorityTopic: isPriorityTopic(body.topic),
});
await enqueueJob(
  JOB_TYPES.PLAN_GENERATION,
  plan.id,
  user.id,
  jobData,
  priority
);
```

**Step 4: Run test to verify it passes**

Run: `vitest run tests/integration/api/plans.caps.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/v1/plans/route.ts
git commit -m "feat(api): enforce plan duration cap and set job priority"
```

---

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

## Task 4: UI controls and copy

**Files:**

- Create: `src/components/plans/RegenerateButton.tsx`
- Modify: `src/components/plans/PlanDetails.tsx:1`
- Modify: `src/components/plans/OnboardingForm.tsx:1`
- Modify: `src/app/pricing/page.tsx:1`
- Test: `tests/e2e/regeneration.ui.spec.ts`

**Step 1: Write the failing e2e test outline**

```ts
// tests/e2e/regeneration.ui.spec.ts
import { test, expect } from '@playwright/test';

test('free user sees 2-week cap prompt', async ({ page }) => {
  // setup user tier = free, navigate to onboarding
  // select >2 week deadline -> expect upgrade prompt text
});

test('paid user sees Regenerate button and regenerates', async ({ page }) => {
  // setup user tier = pro, visit plan details -> Regenerate
});
```

**Step 2: Implement components**

```tsx
// src/components/plans/RegenerateButton.tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function RegenerateButton({ planId }: { planId: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const res = await fetch(`/api/v1/plans/${planId}/regenerate`, {
            method: 'POST',
          });
          if (!res.ok) throw new Error('Failed to enqueue regeneration');
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? 'Regenerating…' : 'Regenerate Plan'}
    </Button>
  );
}
```

Hook into plan details:

```tsx
// src/components/plans/PlanDetails.tsx (add near TODO)
// <RegenerateButton planId={plan.id} />
```

Add client-side cap hint:

```tsx
// src/components/plans/OnboardingForm.tsx (deadline step effect)
// If user tier known on client, show inline upgrade prompt when > 2 weeks.
```

Pricing copy update:

```tsx
// src/app/pricing/page.tsx
// Add bullet like: "Priority topics and faster queue for Starter/Pro"
```

**Step 3: Verify locally (manual)**

Run: `pnpm dev` and `pnpm dev:worker` (regenerator worker as separate script)
Expected: Regenerate button enqueues, worker picks up jobs.

**Step 4: Commit**

```bash
git add src/components/plans/RegenerateButton.tsx src/components/plans/PlanDetails.tsx src/components/plans/OnboardingForm.tsx src/app/pricing/page.tsx
git commit -m "feat(ui): add Regenerate button, cap prompt, and priority copy"
```

---

## Task 5: Queue priority behavior verification

**Files:**

- Modify: `src/lib/jobs/__tests__/queue.test.ts:1`

**Step 1: Extend existing test to prove priority > FIFO**

```ts
// src/lib/jobs/__tests__/queue.test.ts (add a case)
it('picks paid+priority before free', async () => {
  // enqueue free low priority, then paid high priority
  // expect getNextJob returns paid job first
});
```

**Step 2: Run tests**

Run: `vitest run src/lib/jobs/__tests__/queue.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/jobs/__tests__/queue.test.ts
git commit -m "test(queue): verify priority topics outrank FIFO"
```

---

## Task 6: Stripe webhook and gates coherence check

**Files:**

- Review: `src/app/api/v1/stripe/webhook/route.ts`
- Modify: `src/lib/api/gates.ts` (if needed)

**Step 1: Fetch docs with Context7 MCP (Stripe webhooks)**

Action: Use `/websites/stripe` via context7 MCP to confirm events used and signatures.

**Step 2: Ensure subscription tier updates flow to UI usage summary**

No code if already correct; otherwise adjust mapping.

**Step 3: Commit (if changes)**

---

## Task 7: Developer ergonomics and scripts

**Files:**

- Modify: `package.json` scripts or `pnpm` scripts to include `dev:regenerator`

**Step 1: Add worker script**

```json
// package.json scripts (example)
"dev:regenerator": "tsx src/workers/plan-regenerator.ts",
"dev:all": "concurrently \"pnpm dev\" \"pnpm dev:worker\" \"pnpm dev:regenerator\""
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "chore(workers): add regenerator dev script"
```

---

## Notes

- Sub-issue alignment:
  - #39 (caps): handled in Task 1–2
  - #51 (regeneration): handled in Task 3–4
  - #52 (priority): handled in Task 1–2 and Task 5
- Use @superpowers:test-driven-development when implementing each task section.
- Only run targeted Vitest files. Avoid full suite.
- For docs, update `docs/testing/testing.md` to record new test files.
