import {
  ATTEMPT_CAP,
  finalizeAttemptFailure,
  finalizeAttemptSuccess,
  reserveAttemptSlot,
} from '@/lib/db/queries/attempts';
import { generationAttempts, learningPlans, modules } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createFailedAttemptsInDb,
  getDurableWindowSeedCount,
  seedFailedAttemptsForDurableWindow,
} from '../../fixtures/attempts';
import { createPlan } from '../../fixtures/plans';
import { ensureUser, resetDbForIntegrationTestFile } from '../../helpers/db';

describe('Atomic attempt reservation (Task 1 - Phase 2)', () => {
  let userId: string;
  let planId: string;

  beforeEach(async () => {
    await resetDbForIntegrationTestFile();
    const authUserId = `auth-${randomUUID()}`;
    userId = await ensureUser({
      authUserId,
      email: `${authUserId}@example.com`,
    });

    const plan = await createPlan(userId, {
      topic: 'Test Plan',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      generationStatus: 'failed',
    });
    planId = plan.id;
  });

  it('reserves first attempt slot successfully', async () => {
    const result = await reserveAttemptSlot({
      planId,
      userId,
      input: {
        topic: 'Test Topic',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
      },
      dbClient: db,
    });

    expect(result.reserved).toBe(true);
    if (result.reserved) {
      expect(result.attemptNumber).toBe(1);
      expect(result.attemptId).toBeDefined();
      expect(result.sanitized.topic.value).toBe('Test Topic');
    }

    // Verify plan status changed to 'generating'
    const plan = await db.query.learningPlans.findFirst({
      where: eq(learningPlans.id, planId),
    });
    expect(plan?.generationStatus).toBe('generating');

    // Verify attempt record was created
    const attempts = await db.query.generationAttempts.findMany({
      where: eq(generationAttempts.planId, planId),
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].status).toBe('in_progress');
  });

  it('rejects concurrent attempts with in_progress reason', async () => {
    const input = {
      topic: 'Test',
      skillLevel: 'beginner' as const,
      weeklyHours: 5,
      learningStyle: 'mixed' as const,
    };
    const [first, second] = await Promise.all([
      reserveAttemptSlot({
        planId,
        userId,
        input,
        dbClient: db,
      }),
      reserveAttemptSlot({
        planId,
        userId,
        input,
        dbClient: db,
      }),
    ]);

    const reservedCount = [first, second].filter((r) => r.reserved).length;
    expect(reservedCount).toBe(1);

    const rejected = [first, second].find((r) => !r.reserved);
    expect(rejected).toBeDefined();
    if (rejected && !rejected.reserved) {
      expect(rejected.reason).toBe('in_progress');
    }
  });

  it('enforces durable user window cap atomically across plans', async () => {
    const secondPlan = await createPlan(userId, {
      topic: 'Second Plan',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      generationStatus: 'failed',
    });

    // Seed attempts to leave exactly one slot in the durable window, distributed
    // across throwaway plans so no single plan reaches ATTEMPT_CAP (reserveAttemptSlot
    // should hit durable-window logic only).
    const slotsToFill = getDurableWindowSeedCount(1);
    const maxPerPlan = Math.max(1, ATTEMPT_CAP - 1);
    const numPlans = Math.ceil(slotsToFill / maxPerPlan);
    const throwawayPlans = await Promise.all(
      Array.from({ length: numPlans }, () =>
        createPlan(userId, {
          topic: `Throwaway ${randomUUID()}`,
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          visibility: 'private',
          origin: 'ai',
          generationStatus: 'failed',
        })
      )
    );
    let globalIndex = 0;
    for (const p of throwawayPlans) {
      const remaining = slotsToFill - globalIndex;
      const count = Math.min(maxPerPlan, remaining);
      if (count <= 0) break;
      await createFailedAttemptsInDb(p.id, count, (i) => ({
        classification: 'timeout',
        durationMs: 500,
        metadata: null,
        promptHash: `seed-${globalIndex + i}`,
      }));
      globalIndex += count;
    }
    expect(globalIndex).toBe(slotsToFill);

    const input = {
      topic: 'Durable Limit Test',
      skillLevel: 'beginner' as const,
      weeklyHours: 5,
      learningStyle: 'mixed' as const,
    };

    const [first, second] = await Promise.all([
      reserveAttemptSlot({
        planId,
        userId,
        input,
        dbClient: db,
      }),
      reserveAttemptSlot({
        planId: secondPlan.id,
        userId,
        input,
        dbClient: db,
      }),
    ]);

    const reservedCount = [first, second].filter((r) => r.reserved).length;
    expect(reservedCount).toBe(1);

    const rejected = [first, second].find((r) => !r.reserved);
    expect(rejected).toBeDefined();
    if (rejected && !rejected.reserved) {
      expect(['rate_limited', 'in_progress', 'capped']).toContain(
        rejected.reason
      );
      if (rejected.reason === 'rate_limited') {
        expect(typeof rejected.retryAfter).toBe('number');
        expect(rejected.retryAfter).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('enforces attempt cap', async () => {
    // Create ATTEMPT_CAP failed attempts
    const failedAttempts = await createFailedAttemptsInDb(
      planId,
      ATTEMPT_CAP,
      (i) => ({
        classification: 'timeout',
        durationMs: 1000,
        promptHash: `hash-${i}`,
        metadata: {},
      })
    );
    expect(failedAttempts).toHaveLength(ATTEMPT_CAP);

    // Try to reserve another
    const result = await reserveAttemptSlot({
      planId,
      userId,
      input: {
        topic: 'Test',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
      },
      dbClient: db,
    });

    expect(result.reserved).toBe(false);
    if (!result.reserved) {
      expect(result.reason).toBe('capped');
    }
  });

  it('allows new reservation after previous attempt is finalized', async () => {
    // Reserve and finalize first attempt
    const first = await reserveAttemptSlot({
      planId,
      userId,
      input: {
        topic: 'Test',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
      },
      dbClient: db,
    });
    expect(first.reserved).toBe(true);

    if (first.reserved) {
      await finalizeAttemptFailure({
        attemptId: first.attemptId,
        planId,
        preparation: first,
        classification: 'timeout',
        durationMs: 5000,
        timedOut: true,
        extendedTimeout: false,
        dbClient: db,
      });
    }

    // Try to reserve again - should succeed
    const second = await reserveAttemptSlot({
      planId,
      userId,
      input: {
        topic: 'Test',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
      },
      dbClient: db,
    });

    expect(second.reserved).toBe(true);
    if (second.reserved) {
      expect(second.attemptNumber).toBe(2);
    }
  });

  it('finalizes success correctly', async () => {
    const reservation = await reserveAttemptSlot({
      planId,
      userId,
      input: {
        topic: 'Test',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
      },
      dbClient: db,
    });
    expect(reservation.reserved).toBe(true);

    if (reservation.reserved) {
      const attempt = await finalizeAttemptSuccess({
        attemptId: reservation.attemptId,
        planId,
        preparation: reservation,
        modules: [
          {
            title: 'Module 1',
            description: 'Test module',
            estimatedMinutes: 60,
            tasks: [
              {
                title: 'Task 1',
                description: 'Test task',
                estimatedMinutes: 30,
              },
            ],
          },
        ],
        durationMs: 3000,
        extendedTimeout: false,
        dbClient: db,
      });

      expect(attempt.status).toBe('success');
      expect(attempt.modulesCount).toBe(1);
      expect(attempt.tasksCount).toBe(1);

      // Verify modules were created
      const foundModules = await db.query.modules.findMany({
        where: eq(modules.planId, planId),
      });
      expect(foundModules).toHaveLength(1);
    }
  });
});
