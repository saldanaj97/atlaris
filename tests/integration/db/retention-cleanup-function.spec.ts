import { jobQueue } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { seedRetentionCleanupRows } from '@tests/helpers/db/retention-fixtures';
import { sql, and, eq, inArray } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

describe('private.cleanup_retained_db_rows', () => {
  it('prunes only expired OAuth state, old Stripe events, and old terminal jobs', async () => {
    const now = new Date('2026-05-22T03:00:00.000Z');
    const fixture = await seedRetentionCleanupRows({
      now,
      key: 'sql',
      extendedJobCoverage: true,
    });

    const rows = (await db.execute(sql`
      select *
      from "private"."cleanup_retained_db_rows"(${now.toISOString()}::timestamptz)
    `)) as Array<{
      expired_oauth_state_tokens: number;
      old_stripe_webhook_events: number;
      old_job_queue_rows: number;
    }>;

    expect(rows).toEqual([
      {
        expired_oauth_state_tokens: 1,
        old_stripe_webhook_events: 1,
        old_job_queue_rows: 2,
      },
    ]);

    const remainingRows = (await db.execute(sql`
      select
        (select count(*)::int from "oauth_state_tokens" where "state_token_hash" = ${fixture.oauth.futureHash}) as future_oauth_state_tokens,
        (select count(*)::int from "oauth_state_tokens" where "state_token_hash" = ${fixture.oauth.expiredHash}) as expired_oauth_state_tokens,
        (select count(*)::int from "stripe_webhook_events" where "event_id" = ${fixture.stripe.recentEventId}) as recent_stripe_events,
        (select count(*)::int from "stripe_webhook_events" where "event_id" = ${fixture.stripe.oldEventId}) as old_stripe_events,
        (select count(*)::int from "job_queue" where "status" = 'pending' and "plan_id" = ${fixture.planId}) as pending_jobs,
        (select count(*)::int from "job_queue" where "status" = 'completed' and "plan_id" = ${fixture.planId}) as completed_jobs
    `)) as Array<{
      future_oauth_state_tokens: number;
      expired_oauth_state_tokens: number;
      recent_stripe_events: number;
      old_stripe_events: number;
      pending_jobs: number;
      completed_jobs: number;
    }>;

    expect(remainingRows).toEqual([
      {
        future_oauth_state_tokens: 1,
        expired_oauth_state_tokens: 0,
        recent_stripe_events: 1,
        old_stripe_events: 0,
        pending_jobs: 1,
        completed_jobs: 1,
      },
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
      expect.arrayContaining([
        expect.objectContaining({ status: 'completed' }),
        expect.objectContaining({ status: 'pending' }),
      ]),
    );
    expect(remainingJobs).toHaveLength(2);
  });
});
