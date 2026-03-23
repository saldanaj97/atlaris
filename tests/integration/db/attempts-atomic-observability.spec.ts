import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  finalizeAttemptFailure,
  finalizeAttemptSuccess,
  reserveAttemptSlot,
} from '@/lib/db/queries/attempts';
import { learningPlans } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { createPlan } from '../../fixtures/plans';
import { ensureUser } from '../../helpers/db';

const TEST_INPUT = {
  topic: 'Atomic observability',
  skillLevel: 'beginner' as const,
  weeklyHours: 5,
  learningStyle: 'mixed' as const,
};

describe('Atomic attempt observability', () => {
  let userId = '';
  let planId = '';
  let consoleInfoSpy: MockInstance<(...args: unknown[]) => void> | undefined;

  beforeEach(async () => {
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const authUserId = `auth-${randomUUID()}`;
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

  afterEach(() => {
    consoleInfoSpy?.mockRestore();
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
      })
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
      })
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
      })
    );
  });
});
