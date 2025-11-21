import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db/service-role';
import { truncateAll } from '../../helpers/db';
import {
  users,
  learningPlans,
  jobQueue,
  usageMetrics,
  generationAttempts,
  modules,
  tasks,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Safety net test to ensure truncateAll properly clears all critical tables.
 * This test catches cases where new tables are added but not included in truncateAll.
 */
describe('truncateAll', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('clears users table used by integration tests', async () => {
    // Seed
    await db.insert(users).values({
      clerkUserId: 'test-user-reset',
      email: 'test-reset@example.com',
      name: 'Test Reset',
    });

    const [user] = await db.select().from(users).limit(1);
    expect(user).toBeDefined();

    // Reset
    await truncateAll();

    // Assert emptiness
    const afterReset = await db.select().from(users).limit(1);
    expect(afterReset).toHaveLength(0);
  });

  it('clears learningPlans table', async () => {
    // Seed a user first
    const [testUser] = await db
      .insert(users)
      .values({
        clerkUserId: 'test-user-plans',
        email: 'test-plans@example.com',
        name: 'Test Plans',
      })
      .returning();

    if (!testUser) {
      throw new Error('Failed to create test user');
    }

    // Seed a plan
    await db.insert(learningPlans).values({
      userId: testUser.id,
      topic: 'Test Topic',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
    });

    const [plan] = await db.select().from(learningPlans).limit(1);
    expect(plan).toBeDefined();

    // Reset
    await truncateAll();

    // Assert emptiness
    const afterReset = await db.select().from(learningPlans).limit(1);
    expect(afterReset).toHaveLength(0);
  });

  it('clears jobQueue table', async () => {
    // Seed a user first
    const [testUser] = await db
      .insert(users)
      .values({
        clerkUserId: 'test-user-jobs',
        email: 'test-jobs@example.com',
        name: 'Test Jobs',
      })
      .returning();

    if (!testUser) {
      throw new Error('Failed to create test user');
    }

    // Seed a job
    await db.insert(jobQueue).values({
      type: 'plan_generation',
      userId: testUser.id,
      status: 'pending',
      priority: 0,
      attempts: 0,
      maxAttempts: 3,
      data: {},
    });

    const [job] = await db.select().from(jobQueue).limit(1);
    expect(job).toBeDefined();

    // Reset
    await truncateAll();

    // Assert emptiness
    const afterReset = await db.select().from(jobQueue).limit(1);
    expect(afterReset).toHaveLength(0);
  });

  it('clears usageMetrics table', async () => {
    // Seed a user first
    const [testUser] = await db
      .insert(users)
      .values({
        clerkUserId: 'test-user-metrics',
        email: 'test-metrics@example.com',
        name: 'Test Metrics',
      })
      .returning();

    if (!testUser) {
      throw new Error('Failed to create test user');
    }

    // Seed usage metrics
    await db.insert(usageMetrics).values({
      userId: testUser.id,
      month: '2025-11',
    });

    const [metric] = await db.select().from(usageMetrics).limit(1);
    expect(metric).toBeDefined();

    // Reset
    await truncateAll();

    // Assert emptiness
    const afterReset = await db.select().from(usageMetrics).limit(1);
    expect(afterReset).toHaveLength(0);
  });

  it('clears generationAttempts, modules, and tasks tables (full hierarchy)', async () => {
    // Seed a user first
    const [testUser] = await db
      .insert(users)
      .values({
        clerkUserId: 'test-user-hierarchy',
        email: 'test-hierarchy@example.com',
        name: 'Test Hierarchy',
      })
      .returning();

    if (!testUser) {
      throw new Error('Failed to create test user');
    }

    // Seed a plan
    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: testUser.id,
        topic: 'Test Hierarchy',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    if (!plan) {
      throw new Error('Failed to create test plan');
    }

    // Seed an attempt
    await db.insert(generationAttempts).values({
      planId: plan.id,
      userId: testUser.id,
      status: 'success',
      classification: null,
    });

    // Seed a module
    const [module] = await db
      .insert(modules)
      .values({
        planId: plan.id,
        title: 'Test Module',
        description: 'Test',
        order: 1,
        estimatedMinutes: 60,
      })
      .returning();

    if (!module) {
      throw new Error('Failed to create test module');
    }

    // Seed a task
    await db.insert(tasks).values({
      moduleId: module.id,
      title: 'Test Task',
      description: 'Test',
      order: 1,
      estimatedMinutes: 30,
    });

    // Verify they exist
    const [attempt] = await db.select().from(generationAttempts).limit(1);
    const [mod] = await db.select().from(modules).limit(1);
    const [task] = await db.select().from(tasks).limit(1);
    expect(attempt).toBeDefined();
    expect(mod).toBeDefined();
    expect(task).toBeDefined();

    // Reset
    await truncateAll();

    // Assert all are empty
    const afterAttempts = await db.select().from(generationAttempts).limit(1);
    const afterModules = await db.select().from(modules).limit(1);
    const afterTasks = await db.select().from(tasks).limit(1);
    expect(afterAttempts).toHaveLength(0);
    expect(afterModules).toHaveLength(0);
    expect(afterTasks).toHaveLength(0);
  });
});
