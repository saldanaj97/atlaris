import { cleanupOldJobs } from '@/lib/db/queries/jobs/monitoring';
import type { DbClient } from '@/lib/db/types';
import { oauthStateTokens, stripeWebhookEvents } from '@supabase/schema';
import { lt } from 'drizzle-orm';
import { db as serviceRoleDb } from '@supabase/service-role';
import { normalizeMutationCount } from '../jobs/shared';

export const JOB_QUEUE_RETENTION_DAYS = 30;
export const STRIPE_WEBHOOK_EVENT_RETENTION_DAYS = 45;

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export async function cleanupExpiredOauthStateTokens({
  now = new Date(),
  dbClient = serviceRoleDb,
}: {
  now?: Date;
  dbClient?: DbClient;
} = {}): Promise<number> {
  const result = await dbClient
    .delete(oauthStateTokens)
    .where(lt(oauthStateTokens.expiresAt, now));

  return normalizeMutationCount(result);
}

export async function cleanupRetainedStripeWebhookEvents({
  now = new Date(),
  dbClient = serviceRoleDb,
}: {
  now?: Date;
  dbClient?: DbClient;
} = {}): Promise<number> {
  const olderThan = daysBefore(now, STRIPE_WEBHOOK_EVENT_RETENTION_DAYS);
  const result = await dbClient
    .delete(stripeWebhookEvents)
    .where(lt(stripeWebhookEvents.createdAt, olderThan));

  return normalizeMutationCount(result);
}

export async function cleanupRetainedJobQueueRows({
  now = new Date(),
  dbClient = serviceRoleDb,
}: {
  now?: Date;
  dbClient?: DbClient;
} = {}): Promise<number> {
  return cleanupOldJobs(daysBefore(now, JOB_QUEUE_RETENTION_DAYS), dbClient);
}

export async function cleanupRetainedDbRows({
  now = new Date(),
  dbClient = serviceRoleDb,
}: {
  now?: Date;
  dbClient?: DbClient;
} = {}): Promise<{
  expiredOauthStateTokens: number;
  oldStripeWebhookEvents: number;
  oldJobQueueRows: number;
}> {
  const [expiredOauthStateTokens, oldStripeWebhookEvents, oldJobQueueRows] =
    await Promise.all([
      cleanupExpiredOauthStateTokens({ now, dbClient }),
      cleanupRetainedStripeWebhookEvents({ now, dbClient }),
      cleanupRetainedJobQueueRows({ now, dbClient }),
    ]);

  return {
    expiredOauthStateTokens,
    oldStripeWebhookEvents,
    oldJobQueueRows,
  };
}
