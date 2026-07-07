import type { DbClient } from '@/lib/db/types';

import { db as serviceRoleDb } from '@supabase/service-role';
import { sql } from 'drizzle-orm';

export async function cleanupRetainedDbRows({
  now = new Date(),
  dbClient = serviceRoleDb,
}: {
  now?: Date;
  dbClient?: DbClient;
} = {}): Promise<{
  expiredOauthStateTokens: number;
  oldStripeWebhookEvents: number;
  oldClerkWebhookEvents: number;
  oldJobQueueRows: number;
}> {
  const [deleted] = (await dbClient.execute(sql`
    select *
    from "private"."cleanup_retained_db_rows"(${now.toISOString()}::timestamptz)
  `)) as Array<{
    expired_oauth_state_tokens: number;
    old_stripe_webhook_events: number;
    old_clerk_webhook_events: number;
    old_job_queue_rows: number;
  }>;

  return {
    expiredOauthStateTokens: deleted?.expired_oauth_state_tokens ?? 0,
    oldStripeWebhookEvents: deleted?.old_stripe_webhook_events ?? 0,
    oldClerkWebhookEvents: deleted?.old_clerk_webhook_events ?? 0,
    oldJobQueueRows: deleted?.old_job_queue_rows ?? 0,
  };
}
