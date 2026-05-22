import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  jobQueue,
  learningPlans,
  oauthStateTokens,
  stripeWebhookEvents,
} from '@supabase/schema';
import { db } from '@supabase/service-role';

import { ensureUser } from '../../helpers/db/users';

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

describe('private.cleanup_retained_db_rows', () => {
  it('prunes only expired OAuth state, old Stripe events, and old terminal jobs', async () => {
    const now = new Date('2026-05-22T03:00:00.000Z');

    await db.insert(oauthStateTokens).values([
      {
        stateTokenHash: 'sql-expired-oauth-state',
        authUserId: 'retention-sql',
        expiresAt: daysBefore(now, 1),
      },
      {
        stateTokenHash: 'sql-future-oauth-state',
        authUserId: 'retention-sql',
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
      },
    ]);

    await db.insert(stripeWebhookEvents).values([
      {
        eventId: 'evt_sql_old',
        livemode: false,
        type: 'customer.subscription.updated',
        createdAt: daysBefore(now, 46),
      },
      {
        eventId: 'evt_sql_recent',
        livemode: false,
        type: 'customer.subscription.updated',
        createdAt: daysBefore(now, 44),
      },
    ]);

    const authUserId = 'retention-sql-jobs';
    const userId = await ensureUser({
      authUserId,
      email: `${authUserId}@example.com`,
    });
    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Retention SQL jobs',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        origin: 'ai',
        generationStatus: 'ready',
        isQuotaEligible: true,
      })
      .returning({ id: learningPlans.id });

    const oldCompletedAt = daysBefore(now, 31);
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
        old_job_queue_rows: 1,
      },
    ]);

    const remainingRows = (await db.execute(sql`
      select
        (select count(*)::int from "oauth_state_tokens" where "state_token_hash" = 'sql-future-oauth-state') as future_oauth_state_tokens,
        (select count(*)::int from "oauth_state_tokens" where "state_token_hash" = 'sql-expired-oauth-state') as expired_oauth_state_tokens,
        (select count(*)::int from "stripe_webhook_events" where "event_id" = 'evt_sql_recent') as recent_stripe_events,
        (select count(*)::int from "stripe_webhook_events" where "event_id" = 'evt_sql_old') as old_stripe_events,
        (select count(*)::int from "job_queue" where "status" = 'pending' and "plan_id" = ${plan!.id}) as pending_jobs,
        (select count(*)::int from "job_queue" where "status" = 'completed' and "plan_id" = ${plan!.id}) as completed_jobs
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
        completed_jobs: 0,
      },
    ]);
  });
});
