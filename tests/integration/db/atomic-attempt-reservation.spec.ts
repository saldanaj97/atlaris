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
import { ensureUser } from '../../helpers/db';

describe('Atomic attempt reservation (Task 1 - Phase 2)', () => {
  let userId: string;
  let planId: string;

  beforeEach(async () => {
    const authUserId = `auth-${randomUUID()}`;
    userId = await ensureUser({
      authUserId,
      email: `${authUserId}@example.com`,
    });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Test Plan',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
        generationStatus: 'failed',
      })
      .returning();

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

  it('enforces attempt cap', async () => {
    // Create ATTEMPT_CAP failed attempts
    for (let i = 0; i < ATTEMPT_CAP; i++) {
      await db.insert(generationAttempts).values({
        planId,
        status: 'failure',
        classification: 'timeout',
        durationMs: 1000,
        modulesCount: 0,
        tasksCount: 0,
        truncatedTopic: false,
        truncatedNotes: false,
        normalizedEffort: false,
        promptHash: `hash-${i}`,
        metadata: {},
      });
    }

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

    // Reset plan status (normally done by retry route)
    await db
      .update(learningPlans)
      .set({ generationStatus: 'failed' })
      .where(eq(learningPlans.id, planId));

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
