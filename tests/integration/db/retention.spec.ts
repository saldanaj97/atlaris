import { cleanupRetainedDbRows } from '@/lib/db/queries/admin/retention';
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
  it('delegates to the canonical SQL retention function', async () => {
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

    await db.insert(stripeWebhookEvents).values([
      {
        eventId: 'evt_retention_old',
        livemode: false,
        type: 'customer.subscription.updated',
        createdAt: daysBefore(46),
      },
      {
        eventId: 'evt_retention_recent',
        livemode: false,
        type: 'customer.subscription.updated',
        createdAt: daysBefore(44),
      },
    ]);

    const { planId, userId } = await createPlanFixture('jobs');
    const oldCompletedAt = daysBefore(31);
    const recentCompletedAt = daysBefore(29);

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

    const deleted = await cleanupRetainedDbRows({
      now: NOW,
      dbClient: db,
    });

    expect(deleted).toEqual({
      expiredOauthStateTokens: 1,
      oldStripeWebhookEvents: 1,
      oldJobQueueRows: 2,
    });

    const remainingOauth = await db
      .select({ hash: oauthStateTokens.stateTokenHash })
      .from(oauthStateTokens)
      .where(
        inArray(oauthStateTokens.stateTokenHash, [
          'expired-oauth-state',
          'future-oauth-state',
        ]),
      );
    expect(remainingOauth).toEqual([{ hash: 'future-oauth-state' }]);

    const remainingStripe = await db
      .select({ eventId: stripeWebhookEvents.eventId })
      .from(stripeWebhookEvents)
      .where(
        inArray(stripeWebhookEvents.eventId, [
          'evt_retention_old',
          'evt_retention_recent',
        ]),
      );
    expect(remainingStripe).toEqual([{ eventId: 'evt_retention_recent' }]);

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
