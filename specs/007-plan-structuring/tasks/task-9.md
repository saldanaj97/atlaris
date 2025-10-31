# Phase 9: Create getPlanSchedule API Composition

**Files:**

- Create: `src/lib/api/schedule.ts`
- Test: `tests/integration/scheduling/api.spec.ts`

## Step 1: Write the failing test

Create `tests/integration/scheduling/api.spec.ts`:

```typescript
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { db } from '@/lib/db/drizzle';
import { learningPlans, users, modules, tasks } from '@/lib/db/schema';
import { getPlanSchedule } from '@/lib/api/schedule';
import { eq } from 'drizzle-orm';

describe('getPlanSchedule API', () => {
  let testUserId: string;
  let testPlanId: string;

  beforeEach(async () => {
    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        clerkUserId: `test-clerk-${Date.now()}`,
        email: `test-${Date.now()}@example.com`,
        name: 'Test User',
      })
      .returning();
    testUserId = user.id;

    // Create test plan
    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: testUserId,
        topic: 'Test Topic',
        skillLevel: 'beginner',
        weeklyHours: 10,
        learningStyle: 'mixed',
        generationStatus: 'ready',
        startDate: '2025-02-03',
        deadlineDate: null,
      })
      .returning();
    testPlanId = plan.id;

    // Create test module
    const [module] = await db
      .insert(modules)
      .values({
        planId: testPlanId,
        order: 1,
        title: 'Module 1',
        estimatedMinutes: 120,
      })
      .returning();

    // Create test tasks
    await db.insert(tasks).values([
      {
        moduleId: module.id,
        order: 1,
        title: 'Task 1',
        estimatedMinutes: 60,
      },
      {
        moduleId: module.id,
        order: 2,
        title: 'Task 2',
        estimatedMinutes: 60,
      },
    ]);
  });

  afterEach(async () => {
    // Cleanup (cascading deletes handle child records)
    await db.delete(learningPlans).where(eq(learningPlans.id, testPlanId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  it('should generate and cache schedule on first call', async () => {
    const schedule = await getPlanSchedule({
      planId: testPlanId,
      userId: testUserId,
    });

    expect(schedule).not.toBeNull();
    expect(schedule.weeks.length).toBeGreaterThan(0);
    expect(schedule.totalWeeks).toBeGreaterThan(0);
  });

  it('should return cached schedule on subsequent calls', async () => {
    // First call - generates and caches
    const schedule1 = await getPlanSchedule({
      planId: testPlanId,
      userId: testUserId,
    });

    // Second call - returns cache
    const schedule2 = await getPlanSchedule({
      planId: testPlanId,
      userId: testUserId,
    });

    expect(JSON.stringify(schedule1)).toBe(JSON.stringify(schedule2));
  });

  it('should recompute schedule when tasks change', async () => {
    // Generate initial schedule
    const schedule1 = await getPlanSchedule({
      planId: testPlanId,
      userId: testUserId,
    });

    // Add new task
    const [module] = await db
      .select()
      .from(modules)
      .where(eq(modules.planId, testPlanId));

    await db.insert(tasks).values({
      moduleId: module.id,
      order: 3,
      title: 'New Task',
      estimatedMinutes: 90,
    });

    // Get schedule again - should recompute
    const schedule2 = await getPlanSchedule({
      planId: testPlanId,
      userId: testUserId,
    });

    expect(schedule2.totalSessions).not.toBe(schedule1.totalSessions);
  });
});
```

## Step 2: Run test to verify it fails

Run: `pnpm vitest run tests/integration/scheduling/api.spec.ts`
Expected: FAIL with "Cannot find module '@/lib/api/schedule'"

## Step 3: Create API composition implementation

Create `src/lib/api/schedule.ts`:

```typescript
import { db } from '@/lib/db/drizzle';
import { learningPlans, modules, tasks } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import {
  getPlanScheduleCache,
  upsertPlanScheduleCache,
} from '@/lib/db/queries/schedules';
import { generateSchedule } from '@/lib/scheduling/generate';
import { computeInputsHash } from '@/lib/scheduling/hash';
import type { ScheduleInputs, ScheduleJson } from '@/lib/scheduling/types';

interface GetPlanScheduleParams {
  planId: string;
  userId: string;
}

/**
 * Retrieves or computes plan schedule with write-through caching
 */
export async function getPlanSchedule(
  params: GetPlanScheduleParams
): Promise<ScheduleJson> {
  const { planId, userId } = params;

  // Load plan
  const [plan] = await db
    .select()
    .from(learningPlans)
    .where(eq(learningPlans.id, planId));

  if (!plan) {
    throw new Error(`Plan not found: ${planId}`);
  }

  if (plan.userId !== userId) {
    throw new Error('Unauthorized access to plan');
  }

  // Load modules and tasks
  const planModules = await db
    .select()
    .from(modules)
    .where(eq(modules.planId, planId))
    .orderBy(asc(modules.order));

  const allTasks = await Promise.all(
    planModules.map(async (module) => {
      const moduleTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.moduleId, module.id))
        .orderBy(asc(tasks.order));

      return moduleTasks.map((task) => ({
        ...task,
        moduleTitle: module.title,
      }));
    })
  );

  const flatTasks = allTasks.flat();

  // Build schedule inputs
  const inputs: ScheduleInputs = {
    planId: plan.id,
    tasks: flatTasks.map((task, idx) => ({
      id: task.id,
      title: task.title,
      estimatedMinutes: task.estimatedMinutes,
      order: idx + 1,
      moduleId: task.moduleId,
    })),
    startDate: plan.startDate || plan.createdAt.toISOString().split('T')[0],
    deadline: plan.deadlineDate,
    weeklyHours: plan.weeklyHours,
    timezone: 'UTC', // TODO: Get from user preferences
  };

  // Compute hash
  const inputsHash = computeInputsHash(inputs);

  // Check cache
  const cached = await getPlanScheduleCache(planId);
  if (cached && cached.inputsHash === inputsHash) {
    return cached.scheduleJson;
  }

  // Generate new schedule
  const schedule = generateSchedule(inputs);

  // Write through cache
  await upsertPlanScheduleCache(planId, {
    scheduleJson: schedule,
    inputsHash,
    timezone: inputs.timezone,
    weeklyHours: inputs.weeklyHours,
    startDate: inputs.startDate,
    deadline: inputs.deadline,
  });

  return schedule;
}
```

## Step 4: Run test to verify it passes

Run: `pnpm vitest run tests/integration/scheduling/api.spec.ts`
Expected: PASS (3 tests)

## Step 5: Commit

```bash
git add src/lib/api/schedule.ts tests/integration/scheduling/api.spec.ts
git commit -m "feat: add getPlanSchedule API with write-through cache"
```
