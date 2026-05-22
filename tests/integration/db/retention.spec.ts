import {
  cleanupExpiredOauthStateTokens,
  cleanupRetainedJobQueueRows,
  cleanupRetainedStripeWebhookEvents,
  JOB_QUEUE_RETENTION_DAYS,
  STRIPE_WEBHOOK_EVENT_RETENTION_DAYS,
} from '@/lib/db/queries/admin/retention';
import {
  jobQueue,
  learningPlans,
  oauthStateTokens,
  stripeWebhookEvents,
} from '@supabase/schema';
import { ensureUser } from '@tests/helpers/db/users';
import { and, eq, inArray } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '@supabase/service-role';

const NOW = new Date('2026-05-22T12:00:00.000Z');

function daysBefore(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

async function createPlanFixture(key: string): Promise<{
  planId: string;
  userId: string;
}> {
  const authUserId = `retention-${key}`;
  const userId = await ensureUser({
    authUserId,
    email: `${authUserId}@example.com`,
  });

  const [plan] = await db
    .insert(learningPlans)
    .values({
      userId,
      topic: `Retention ${key}`,
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      origin: 'ai',
      generationStatus: 'ready',
      isQuotaEligible: true,
    })
    .returning({ id: learningPlans.id });

  if (!plan) {
    throw new Error('Failed to create retention plan fixture');
  }

  return { planId: plan.id, userId };
}

describe('database retention cleanup', () => {
  it('deletes expired OAuth state tokens while keeping future tokens', async () => {
    await db.insert(oauthStateTokens).values([
      {
        stateTokenHash: 'expired-oauth-state',
        authUserId: 'retention-oauth',
        expiresAt: daysBefore(1),
      },
      {
        stateTokenHash: 'future-oauth-state',
        authUserId: 'retention-oauth',
        expiresAt: new Date(NOW.getTime() + 10 * 60 * 1000),
      },
    ]);

    const deleted = await cleanupExpiredOauthStateTokens({
      now: NOW,
      dbClient: db,
    });

    expect(deleted).toBe(1);

    const remaining = await db
      .select({ hash: oauthStateTokens.stateTokenHash })
      .from(oauthStateTokens)
      .where(
        inArray(oauthStateTokens.stateTokenHash, [
          'expired-oauth-state',
          'future-oauth-state',
        ]),
      );
    expect(remaining).toEqual([{ hash: 'future-oauth-state' }]);
  });

  it('keeps Stripe webhook idempotency rows inside the replay window', async () => {
    await db.insert(stripeWebhookEvents).values([
      {
        eventId: 'evt_retention_old',
        livemode: false,
        type: 'customer.subscription.updated',
        createdAt: daysBefore(STRIPE_WEBHOOK_EVENT_RETENTION_DAYS + 1),
      },
      {
        eventId: 'evt_retention_recent',
        livemode: false,
        type: 'customer.subscription.updated',
        createdAt: daysBefore(STRIPE_WEBHOOK_EVENT_RETENTION_DAYS - 1),
      },
    ]);

    const deleted = await cleanupRetainedStripeWebhookEvents({
      now: NOW,
      dbClient: db,
    });

    expect(deleted).toBe(1);

    const remaining = await db
      .select({ eventId: stripeWebhookEvents.eventId })
      .from(stripeWebhookEvents)
      .where(
        inArray(stripeWebhookEvents.eventId, [
          'evt_retention_old',
          'evt_retention_recent',
        ]),
      );
    expect(remaining).toEqual([{ eventId: 'evt_retention_recent' }]);
  });

  it('deletes old completed and failed jobs without deleting active jobs', async () => {
    const { planId, userId } = await createPlanFixture('jobs');
    const oldCompletedAt = daysBefore(JOB_QUEUE_RETENTION_DAYS + 1);
    const recentCompletedAt = daysBefore(JOB_QUEUE_RETENTION_DAYS - 1);

    const rows = await db
      .insert(jobQueue)
      .values([
        {
          planId,
          userId,
          jobType: 'plan_regeneration',
          status: 'completed',
          payload: {},
          completedAt: oldCompletedAt,
          createdAt: oldCompletedAt,
          updatedAt: oldCompletedAt,
        },
        {
          planId,
          userId,
          jobType: 'plan_regeneration',
          status: 'failed',
          payload: {},
          completedAt: oldCompletedAt,
          createdAt: oldCompletedAt,
          updatedAt: oldCompletedAt,
        },
        {
          planId,
          userId,
          jobType: 'plan_regeneration',
          status: 'completed',
          payload: {},
          completedAt: recentCompletedAt,
          createdAt: recentCompletedAt,
          updatedAt: recentCompletedAt,
        },
        {
          planId,
          userId,
          jobType: 'plan_regeneration',
          status: 'pending',
          payload: {},
          completedAt: null,
          createdAt: oldCompletedAt,
          updatedAt: oldCompletedAt,
        },
      ])
      .returning({ id: jobQueue.id, status: jobQueue.status });

    const deleted = await cleanupRetainedJobQueueRows({
      now: NOW,
      dbClient: db,
    });

    expect(deleted).toBe(2);

    const remaining = await db
      .select({ id: jobQueue.id, status: jobQueue.status })
      .from(jobQueue)
      .where(
        and(
          eq(jobQueue.userId, userId),
          inArray(
            jobQueue.id,
            rows.map((row) => row.id),
          ),
        ),
      );
    expect(remaining).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'completed' }),
        expect.objectContaining({ status: 'pending' }),
      ]),
    );
    expect(remaining).toHaveLength(2);
  });
});
