import {
  clerkWebhookEvents,
  jobQueue,
  learningPlans,
  oauthStateTokens,
  stripeWebhookEvents,
} from '@supabase/schema';
import { db } from '@supabase/service-role';
import { ensureUser } from '@tests/helpers/db/users';
import { and, eq, inArray } from 'drizzle-orm';

export const JOB_QUEUE_RETENTION_DAYS = 30;
export const STRIPE_WEBHOOK_EVENT_RETENTION_DAYS = 45;
export const CLERK_WEBHOOK_EVENT_RETENTION_DAYS = 45;

export function retentionDaysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export type SeedRetentionCleanupRowsOptions = {
  now: Date;
  /** Unique prefix for row identifiers within a test file. */
  key: string;
  /** Adds failed and recent-completed jobs for broader terminal-status coverage. */
  extendedJobCoverage?: boolean;
};

export type SeedRetentionCleanupRowsResult = {
  planId: string;
  userId: string;
  oauth: {
    expiredHash: string;
    futureHash: string;
  };
  stripe: {
    oldEventId: string;
    recentEventId: string;
  };
  clerk: {
    oldEventId: string;
    recentEventId: string;
  };
  jobRowIds: string[];
};

export async function selectRetentionJobRows(
  fixture: Pick<SeedRetentionCleanupRowsResult, 'userId' | 'jobRowIds'>,
) {
  return db
    .select({ id: jobQueue.id, status: jobQueue.status })
    .from(jobQueue)
    .where(
      and(
        eq(jobQueue.userId, fixture.userId),
        inArray(jobQueue.id, fixture.jobRowIds),
      ),
    );
}

export async function seedRetentionCleanupRows(
  options: SeedRetentionCleanupRowsOptions,
): Promise<SeedRetentionCleanupRowsResult> {
  const { now, key, extendedJobCoverage = false } = options;
  const expiredHash = `${key}-expired-oauth-state`;
  const futureHash = `${key}-future-oauth-state`;
  const oldEventId = `evt_${key}_old`;
  const recentEventId = `evt_${key}_recent`;
  const oldClerkEventId = `clerk_${key}_old`;
  const recentClerkEventId = `clerk_${key}_recent`;

  await db.insert(oauthStateTokens).values([
    {
      stateTokenHash: expiredHash,
      authUserId: `${key}-oauth`,
      expiresAt: retentionDaysBefore(now, 1),
    },
    {
      stateTokenHash: futureHash,
      authUserId: `${key}-oauth`,
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
    },
  ]);

  await db.insert(stripeWebhookEvents).values([
    {
      eventId: oldEventId,
      livemode: false,
      type: 'customer.subscription.updated',
      createdAt: retentionDaysBefore(
        now,
        STRIPE_WEBHOOK_EVENT_RETENTION_DAYS + 1,
      ),
    },
    {
      eventId: recentEventId,
      livemode: false,
      type: 'customer.subscription.updated',
      createdAt: retentionDaysBefore(
        now,
        STRIPE_WEBHOOK_EVENT_RETENTION_DAYS - 1,
      ),
    },
  ]);

  await db.insert(clerkWebhookEvents).values([
    {
      eventId: oldClerkEventId,
      type: 'subscription.updated',
      createdAt: retentionDaysBefore(
        now,
        CLERK_WEBHOOK_EVENT_RETENTION_DAYS + 1,
      ),
    },
    {
      eventId: recentClerkEventId,
      type: 'subscription.updated',
      createdAt: retentionDaysBefore(
        now,
        CLERK_WEBHOOK_EVENT_RETENTION_DAYS - 1,
      ),
    },
  ]);

  const authUserId = `${key}-jobs`;
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

  const oldCompletedAt = retentionDaysBefore(now, JOB_QUEUE_RETENTION_DAYS + 1);
  const recentCompletedAt = retentionDaysBefore(
    now,
    JOB_QUEUE_RETENTION_DAYS - 1,
  );

  const extendedJobs = extendedJobCoverage
    ? [
        {
          planId: plan.id,
          userId,
          jobType: 'plan_regeneration' as const,
          status: 'failed' as const,
          payload: {},
          completedAt: oldCompletedAt,
          createdAt: oldCompletedAt,
          updatedAt: oldCompletedAt,
        },
        {
          planId: plan.id,
          userId,
          jobType: 'plan_regeneration' as const,
          status: 'completed' as const,
          payload: {},
          completedAt: recentCompletedAt,
          createdAt: recentCompletedAt,
          updatedAt: recentCompletedAt,
        },
      ]
    : [];

  const rows = await db
    .insert(jobQueue)
    .values([
      ...extendedJobs,
      {
        planId: plan.id,
        userId,
        jobType: 'plan_regeneration' as const,
        status: 'completed' as const,
        payload: {},
        completedAt: oldCompletedAt,
        createdAt: oldCompletedAt,
        updatedAt: oldCompletedAt,
      },
      {
        planId: plan.id,
        userId,
        jobType: 'plan_regeneration' as const,
        status: 'pending' as const,
        payload: {},
        completedAt: null,
        createdAt: oldCompletedAt,
        updatedAt: oldCompletedAt,
      },
    ])
    .returning({ id: jobQueue.id });

  return {
    planId: plan.id,
    userId,
    oauth: {
      expiredHash,
      futureHash,
    },
    stripe: {
      oldEventId,
      recentEventId,
    },
    clerk: {
      oldEventId: oldClerkEventId,
      recentEventId: recentClerkEventId,
    },
    jobRowIds: rows.map((row) => row.id),
  };
}
