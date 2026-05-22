import { inArray } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { POST as POST_RETENTION_CLEANUP } from '@/app/api/internal/maintenance/retention/cleanup/route';
import {
  jobQueue,
  learningPlans,
  oauthStateTokens,
  stripeWebhookEvents,
} from '@supabase/schema';
import { db } from '@supabase/service-role';

import { ensureUser } from '../../helpers/db/users';

const JOB_QUEUE_RETENTION_DAYS = 30;
const STRIPE_WEBHOOK_EVENT_RETENTION_DAYS = 45;

const ORIGINAL_ENV = {
  MAINTENANCE_WORKER_TOKEN: process.env.MAINTENANCE_WORKER_TOKEN,
  RETENTION_CLEANUP_ENABLED: process.env.RETENTION_CLEANUP_ENABLED,
};

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function restoreEnvVar(name: keyof typeof ORIGINAL_ENV): void {
  const originalValue = ORIGINAL_ENV[name];
  if (originalValue === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = originalValue;
}

describe('POST /api/internal/maintenance/retention/cleanup', () => {
  afterEach(() => {
    const envKeys: Array<keyof typeof ORIGINAL_ENV> = [
      'MAINTENANCE_WORKER_TOKEN',
      'RETENTION_CLEANUP_ENABLED',
    ];
    envKeys.forEach(restoreEnvVar);
  });

  it('rejects unauthorized requests when a worker token is configured', async () => {
    process.env.MAINTENANCE_WORKER_TOKEN = 'maintenance-secret';
    process.env.RETENTION_CLEANUP_ENABLED = 'true';

    const response = await POST_RETENTION_CLEANUP(
      new Request(
        'http://localhost/api/internal/maintenance/retention/cleanup',
        { method: 'POST' },
      ),
    );

    expect(response.status).toBe(401);
  });

  it('runs retention cleanup and returns deleted row counts', async () => {
    process.env.RETENTION_CLEANUP_ENABLED = 'true';
    delete process.env.MAINTENANCE_WORKER_TOKEN;

    const now = new Date();

    await db.insert(oauthStateTokens).values([
      {
        stateTokenHash: 'route-expired-oauth-state',
        authUserId: 'retention-route',
        expiresAt: daysBefore(now, 1),
      },
      {
        stateTokenHash: 'route-future-oauth-state',
        authUserId: 'retention-route',
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
      },
    ]);

    await db.insert(stripeWebhookEvents).values([
      {
        eventId: 'evt_route_old',
        livemode: false,
        type: 'customer.subscription.updated',
        createdAt: daysBefore(now, STRIPE_WEBHOOK_EVENT_RETENTION_DAYS + 1),
      },
      {
        eventId: 'evt_route_recent',
        livemode: false,
        type: 'customer.subscription.updated',
        createdAt: daysBefore(now, STRIPE_WEBHOOK_EVENT_RETENTION_DAYS - 1),
      },
    ]);

    const authUserId = 'retention-route-jobs';
    const userId = await ensureUser({
      authUserId,
      email: `${authUserId}@example.com`,
    });
    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Retention route jobs',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        origin: 'ai',
        generationStatus: 'ready',
        isQuotaEligible: true,
      })
      .returning({ id: learningPlans.id });

    const oldCompletedAt = daysBefore(now, JOB_QUEUE_RETENTION_DAYS + 1);
    await db.insert(jobQueue).values([
      {
        planId: plan!.id,
        userId,
        jobType: 'plan_regeneration',
        status: 'completed',
        payload: {},
        completedAt: oldCompletedAt,
        createdAt: oldCompletedAt,
        updatedAt: oldCompletedAt,
      },
      {
        planId: plan!.id,
        userId,
        jobType: 'plan_regeneration',
        status: 'pending',
        payload: {},
        completedAt: null,
        createdAt: oldCompletedAt,
        updatedAt: oldCompletedAt,
      },
    ]);

    const response = await POST_RETENTION_CLEANUP(
      new Request(
        'http://localhost/api/internal/maintenance/retention/cleanup',
        { method: 'POST' },
      ),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      expiredOauthStateTokens: number;
      oldStripeWebhookEvents: number;
      oldJobQueueRows: number;
    };
    expect(body.ok).toBe(true);
    expect(body.expiredOauthStateTokens).toBeGreaterThanOrEqual(1);
    expect(body.oldStripeWebhookEvents).toBeGreaterThanOrEqual(1);
    expect(body.oldJobQueueRows).toBeGreaterThanOrEqual(1);

    const remainingOauth = await db
      .select({ hash: oauthStateTokens.stateTokenHash })
      .from(oauthStateTokens)
      .where(
        inArray(oauthStateTokens.stateTokenHash, [
          'route-expired-oauth-state',
          'route-future-oauth-state',
        ]),
      );
    expect(remainingOauth).toEqual([{ hash: 'route-future-oauth-state' }]);

    const remainingStripe = await db
      .select({ eventId: stripeWebhookEvents.eventId })
      .from(stripeWebhookEvents)
      .where(
        inArray(stripeWebhookEvents.eventId, [
          'evt_route_old',
          'evt_route_recent',
        ]),
      );
    expect(remainingStripe).toEqual([{ eventId: 'evt_route_recent' }]);
  });
});
