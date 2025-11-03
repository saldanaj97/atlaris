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
