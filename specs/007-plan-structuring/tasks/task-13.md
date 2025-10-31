# Phase 13: Add Integration Test for Full Schedule Flow

**Files:**

- Create: `tests/integration/scheduling/end-to-end.spec.ts`

## Step 1: Write comprehensive integration test

Create `tests/integration/scheduling/end-to-end.spec.ts`:

```typescript
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { db } from '@/lib/db/drizzle';
import {
  learningPlans,
  users,
  modules,
  tasks,
  resources,
  taskResources,
} from '@/lib/db/schema';
import { getPlanSchedule } from '@/lib/api/schedule';
import { eq } from 'drizzle-orm';

describe('End-to-End Schedule Flow', () => {
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

    // Create test plan with start date
    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: testUserId,
        topic: 'Full Stack Development',
        skillLevel: 'intermediate',
        weeklyHours: 10,
        learningStyle: 'mixed',
        generationStatus: 'ready',
        startDate: '2025-02-03',
        deadlineDate: null,
      })
      .returning();
    testPlanId = plan.id;

    // Create modules
    const [mod1, mod2] = await db
      .insert(modules)
      .values([
        {
          planId: testPlanId,
          order: 1,
          title: 'Frontend Basics',
          estimatedMinutes: 300,
        },
        {
          planId: testPlanId,
          order: 2,
          title: 'Backend Basics',
          estimatedMinutes: 300,
        },
      ])
      .returning();

    // Create tasks with resources
    const [task1, task2, task3, task4] = await db
      .insert(tasks)
      .values([
        {
          moduleId: mod1.id,
          order: 1,
          title: 'Learn React',
          estimatedMinutes: 120,
        },
        {
          moduleId: mod1.id,
          order: 2,
          title: 'Build React App',
          estimatedMinutes: 180,
        },
        {
          moduleId: mod2.id,
          order: 1,
          title: 'Learn Node.js',
          estimatedMinutes: 150,
        },
        {
          moduleId: mod2.id,
          order: 2,
          title: 'Build API',
          estimatedMinutes: 150,
        },
      ])
      .returning();

    // Create resources
    const [res1, res2] = await db
      .insert(resources)
      .values([
        {
          type: 'video',
          title: 'React Tutorial',
          url: `https://example.com/react-${Date.now()}`,
        },
        {
          type: 'doc',
          title: 'Node.js Guide',
          url: `https://example.com/node-${Date.now()}`,
        },
      ])
      .returning();

    // Link resources to tasks
    await db.insert(taskResources).values([
      { taskId: task1.id, resourceId: res1.id, order: 1 },
      { taskId: task2.id, resourceId: res1.id, order: 1 },
      { taskId: task3.id, resourceId: res2.id, order: 1 },
      { taskId: task4.id, resourceId: res2.id, order: 1 },
    ]);
  });

  afterEach(async () => {
    await db.delete(learningPlans).where(eq(learningPlans.id, testPlanId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  it('should generate complete schedule with correct structure', async () => {
    const schedule = await getPlanSchedule({
      planId: testPlanId,
      userId: testUserId,
    });

    // Verify schedule structure
    expect(schedule.weeks.length).toBeGreaterThan(0);
    expect(schedule.totalWeeks).toBeGreaterThan(0);
    expect(schedule.totalSessions).toBeGreaterThan(0);

    // Verify first week has correct date
    expect(schedule.weeks[0].startDate).toBe('2025-02-03');

    // Verify all sessions have valid data
    for (const week of schedule.weeks) {
      for (const day of week.days) {
        for (const session of day.sessions) {
          expect(session.taskId).toBeTruthy();
          expect(session.taskTitle).toBeTruthy();
          expect(session.estimatedMinutes).toBeGreaterThan(0);
          expect(session.moduleId).toBeTruthy();
          expect(session.moduleName).toBeTruthy();
        }
      }
    }
  });

  it('should respect weekly hours constraint', async () => {
    const schedule = await getPlanSchedule({
      planId: testPlanId,
      userId: testUserId,
    });

    // Calculate total scheduled minutes
    let totalMinutes = 0;
    for (const week of schedule.weeks) {
      for (const day of week.days) {
        for (const session of day.sessions) {
          totalMinutes += session.estimatedMinutes;
        }
      }
    }

    // Total should be approximately 600 minutes (300 + 300 from modules)
    expect(totalMinutes).toBeGreaterThanOrEqual(590);
    expect(totalMinutes).toBeLessThanOrEqual(610);

    // Each week should have approximately weeklyHours * 60 minutes
    const weeklyHours = 10;
    const expectedMinutesPerWeek = weeklyHours * 60;

    for (const week of schedule.weeks.slice(0, -1)) {
      let weekMinutes = 0;
      for (const day of week.days) {
        for (const session of day.sessions) {
          weekMinutes += session.estimatedMinutes;
        }
      }
      expect(weekMinutes).toBeGreaterThanOrEqual(expectedMinutesPerWeek * 0.8);
      expect(weekMinutes).toBeLessThanOrEqual(expectedMinutesPerWeek * 1.2);
    }
  });
});
```

## Step 2: Run integration test

Run: `pnpm vitest run tests/integration/scheduling/end-to-end.spec.ts`
Expected: PASS (2 tests)

## Step 3: Commit

```bash
git add tests/integration/scheduling/end-to-end.spec.ts
git commit -m "test: add end-to-end integration test for schedule generation"
```
