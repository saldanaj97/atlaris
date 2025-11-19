import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { db } from '@/lib/db/service-role';
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

    expect(schedule2).toEqual(schedule1);
  });

  it('should recompute schedule when tasks change', async () => {
    // Generate initial schedule
    const schedule1 = await getPlanSchedule({
      planId: testPlanId,
      userId: testUserId,
    });

    const initialTotalMinutes = schedule1.weeks.reduce(
      (sum, week) =>
        sum +
        week.days.reduce(
          (daySum, day) =>
            daySum +
            day.sessions.reduce(
              (sessionSum, session) => sessionSum + session.estimatedMinutes,
              0
            ),
          0
        ),
      0
    );

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

    const newTotalMinutes = schedule2.weeks.reduce(
      (sum, week) =>
        sum +
        week.days.reduce(
          (daySum, day) =>
            daySum +
            day.sessions.reduce(
              (sessionSum, session) => sessionSum + session.estimatedMinutes,
              0
            ),
          0
        ),
      0
    );

    // The new schedule should include the additional 90 minutes
    expect(newTotalMinutes).toBeGreaterThan(initialTotalMinutes);
  });
});
