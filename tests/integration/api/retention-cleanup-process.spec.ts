import { POST as POST_RETENTION_CLEANUP } from '@/app/api/internal/maintenance/retention/cleanup/route';
import {
  jobQueue,
  oauthStateTokens,
  stripeWebhookEvents,
} from '@supabase/schema';
import { db } from '@supabase/service-role';
import { seedRetentionCleanupRows } from '@tests/helpers/db/retention-fixtures';
import { and, eq, inArray } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

const ORIGINAL_ENV = {
  MAINTENANCE_WORKER_TOKEN: process.env.MAINTENANCE_WORKER_TOKEN,
  RETENTION_CLEANUP_ENABLED: process.env.RETENTION_CLEANUP_ENABLED,
};

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
    const fixture = await seedRetentionCleanupRows({
      now,
      key: 'route',
    });

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
          fixture.oauth.expiredHash,
          fixture.oauth.futureHash,
        ]),
      );
    expect(remainingOauth).toEqual([{ hash: fixture.oauth.futureHash }]);

    const remainingStripe = await db
      .select({ eventId: stripeWebhookEvents.eventId })
      .from(stripeWebhookEvents)
      .where(
        inArray(stripeWebhookEvents.eventId, [
          fixture.stripe.oldEventId,
          fixture.stripe.recentEventId,
        ]),
      );
    expect(remainingStripe).toEqual([
      { eventId: fixture.stripe.recentEventId },
    ]);

    const remainingJobs = await db
      .select({ id: jobQueue.id, status: jobQueue.status })
      .from(jobQueue)
      .where(
        and(
          eq(jobQueue.userId, fixture.userId),
          inArray(jobQueue.id, fixture.jobRowIds),
        ),
      );
    expect(remainingJobs).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'pending' })]),
    );
    expect(remainingJobs).toHaveLength(1);
  });
});
