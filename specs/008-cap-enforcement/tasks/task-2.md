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
