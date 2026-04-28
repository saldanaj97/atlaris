import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  finalizeAttemptFailure,
  finalizeAttemptSuccess,
  reserveAttemptSlot,
} from '@/lib/db/queries/attempts';
import {
  generationAttempts,
  learningPlans,
  modules,
  tasks,
} from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { createPlan } from '../../fixtures/plans';
import { ensureUser } from '../../helpers/db';
import {
  cleanupTrackedRlsClients,
  createRlsDbForUser,
} from '../../helpers/rls';

const TEST_INPUT = {
  topic: 'Atomic observability',
  skillLevel: 'beginner' as const,
  weeklyHours: 5,
  learningStyle: 'mixed' as const,
};

describe('Atomic attempt observability', () => {
  let authUserId = '';
  let userId = '';
  let planId = '';
  let consoleInfoSpy: MockInstance<(...args: unknown[]) => void> | undefined;

  beforeEach(async () => {
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    authUserId = `auth-${randomUUID()}`;
    userId = await ensureUser({
      authUserId,
      email: `${authUserId}@example.com`,
    });

    const plan = await createPlan(userId, {
      topic: 'Observability Plan',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      generationStatus: 'failed',
    });
    planId = plan.id;
  });

  afterEach(async () => {
    await cleanupTrackedRlsClients();
    consoleInfoSpy?.mockRestore();
  });

  it('rejects a second reservation while the first attempt is still in progress', async () => {
    const firstReservation = await reserveAttemptSlot({
      planId,
      userId,
      input: TEST_INPUT,
      dbClient: db,
      now: () => new Date('2026-01-01T09:00:00.000Z'),
    });

    if (!firstReservation.reserved) {
      throw new Error(`Expected reservation, got ${firstReservation.reason}`);
    }

    const secondReservation = await reserveAttemptSlot({
      planId,
      userId,
      input: TEST_INPUT,
      dbClient: db,
      now: () => new Date('2026-01-01T09:00:05.000Z'),
    });

    expect(secondReservation).toEqual({
      reserved: false,
      reason: 'in_progress',
    });

    const plan = await db.query.learningPlans.findFirst({
      where: eq(learningPlans.id, planId),
    });

    expect(plan?.generationStatus).toBe('generating');
  });

  it('emits success log event after attempt finalization', async () => {
    const startedAt = new Date('2026-01-01T10:00:00.000Z');
    const finishedAt = new Date('2026-01-01T10:00:01.250Z');

    const reservation = await reserveAttemptSlot({
      planId,
      userId,
      input: TEST_INPUT,
      dbClient: db,
      now: () => startedAt,
    });
    if (!reservation.reserved) {
      throw new Error(`Expected reservation, got ${reservation.reason}`);
    }

    const attempt = await finalizeAttemptSuccess({
      attemptId: reservation.attemptId,
      planId,
      preparation: reservation,
      modules: [
        {
          title: 'Module 1',
          description: 'One module for metrics',
          estimatedMinutes: 60,
          tasks: [
            {
              title: 'Task 1',
              description: 'One task for metrics',
              estimatedMinutes: 30,
            },
          ],
        },
      ],
      durationMs: 9_999,
      extendedTimeout: false,
      dbClient: db,
      now: () => finishedAt,
    });

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[attempts] success',
      expect.objectContaining({
        planId,
        attemptId: attempt.id,
        correlationId: null,
      }),
    );
  });

  it('replaces prior modules/tasks atomically and succeeds through an RLS client', async () => {
    const [staleModule] = await db
      .insert(modules)
      .values({
        planId,
        order: 1,
        title: 'Stale Module',
        description: 'Should be replaced',
        estimatedMinutes: 15,
      })
      .returning({ id: modules.id });

    if (!staleModule) {
      throw new Error('Failed to seed stale module');
    }

    await db.insert(tasks).values({
      moduleId: staleModule.id,
      order: 1,
      title: 'Stale Task',
      description: 'Should be replaced',
      estimatedMinutes: 5,
    });

    const rlsDb = await createRlsDbForUser(authUserId);
    const reservation = await reserveAttemptSlot({
      planId,
      userId,
      input: TEST_INPUT,
      dbClient: rlsDb,
      now: () => new Date('2026-01-03T08:00:00.000Z'),
    });

    if (!reservation.reserved) {
      throw new Error(`Expected reservation, got ${reservation.reason}`);
    }

    const attempt = await finalizeAttemptSuccess({
      attemptId: reservation.attemptId,
      planId,
      preparation: reservation,
      modules: [
        {
          title: 'Fresh Module 1',
          description: 'Fresh description 1',
          estimatedMinutes: 60,
          tasks: [
            {
              title: 'Fresh Task 1',
              description: 'Fresh task description 1',
              estimatedMinutes: 30,
            },
            {
              title: 'Fresh Task 2',
              description: 'Fresh task description 2',
              estimatedMinutes: 30,
            },
          ],
        },
        {
          title: 'Fresh Module 2',
          description: 'Fresh description 2',
          estimatedMinutes: 45,
          tasks: [
            {
              title: 'Fresh Task 3',
              description: 'Fresh task description 3',
              estimatedMinutes: 45,
            },
          ],
        },
      ],
      durationMs: 321,
      extendedTimeout: false,
      dbClient: rlsDb,
      now: () => new Date('2026-01-03T08:00:03.000Z'),
    });

    const persistedAttempt = await db.query.generationAttempts.findFirst({
      where: eq(generationAttempts.id, attempt.id),
    });
    const persistedModules = await db
      .select()
      .from(modules)
      .where(eq(modules.planId, planId))
      .orderBy(asc(modules.order), asc(modules.id));
    const persistedTasks = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        moduleId: tasks.moduleId,
      })
      .from(tasks)
      .innerJoin(modules, eq(tasks.moduleId, modules.id))
      .where(eq(modules.planId, planId))
      .orderBy(asc(modules.order), asc(tasks.order), asc(tasks.id));
    const plan = await db.query.learningPlans.findFirst({
      where: eq(learningPlans.id, planId),
    });

    expect(persistedAttempt).toMatchObject({
      id: attempt.id,
      status: 'success',
      modulesCount: 2,
      tasksCount: 3,
    });
    expect(plan?.generationStatus).toBe('generating');
    expect(persistedModules).toHaveLength(2);
    expect(persistedModules.map((module) => module.title)).toEqual([
      'Fresh Module 1',
      'Fresh Module 2',
    ]);
    expect(
      persistedModules.some((module) => module.title === 'Stale Module'),
    ).toBe(false);
    expect(persistedTasks).toHaveLength(3);
    expect(persistedTasks.map((task) => task.title)).toEqual([
      'Fresh Task 1',
      'Fresh Task 2',
      'Fresh Task 3',
    ]);
    expect(persistedTasks.some((task) => task.title === 'Stale Task')).toBe(
      false,
    );
  });

  it('does not mutate plan status during retryable attempt finalization and emits failure log event', async () => {
    const startedAt = new Date('2026-01-02T10:00:00.000Z');
    const finishedAt = new Date('2026-01-02T10:00:02.000Z');

    const reservation = await reserveAttemptSlot({
      planId,
      userId,
      input: TEST_INPUT,
      dbClient: db,
      now: () => startedAt,
    });
    if (!reservation.reserved) {
      throw new Error(`Expected reservation, got ${reservation.reason}`);
    }

    const attempt = await finalizeAttemptFailure({
      attemptId: reservation.attemptId,
      planId,
      preparation: reservation,
      classification: 'timeout',
      durationMs: 123,
      timedOut: true,
      extendedTimeout: true,
      dbClient: db,
      now: () => finishedAt,
    });

    const plan = await db.query.learningPlans.findFirst({
      where: eq(learningPlans.id, planId),
    });

    expect(plan?.generationStatus).toBe('generating');

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[attempts] failure',
      expect.objectContaining({
        planId,
        attemptId: attempt.id,
        classification: 'timeout',
        timedOut: true,
        correlationId: null,
      }),
    );
  });

  it('does not mutate plan status during terminal attempt finalization', async () => {
    const reservation = await reserveAttemptSlot({
      planId,
      userId,
      input: TEST_INPUT,
      dbClient: db,
    });
    if (!reservation.reserved) {
      throw new Error(`Expected reservation, got ${reservation.reason}`);
    }

    await finalizeAttemptFailure({
      attemptId: reservation.attemptId,
      planId,
      preparation: reservation,
      classification: 'validation',
      durationMs: 500,
      dbClient: db,
    });

    const plan = await db.query.learningPlans.findFirst({
      where: eq(learningPlans.id, planId),
    });

    expect(plan?.generationStatus).toBe('generating');
    expect(plan?.isQuotaEligible).toBe(true);
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[attempts] failure',
      expect.objectContaining({
        planId,
        classification: 'validation',
        correlationId: null,
      }),
    );
  });
});
