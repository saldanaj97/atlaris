import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import { createTestUser } from '../../fixtures/users';
import { JOB_TYPES } from '@/features/jobs/types';
import {
  claimRegenerationJobById,
  getActiveRegenerationJob,
  insertJobRecord,
} from '@/lib/db/queries/jobs';
import { jobQueue, learningPlans } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { beforeEach, describe, expect, it } from 'vitest';

type JobInsert = InferInsertModel<typeof jobQueue>;

describe('Job Queries', () => {
  let userId: string;
  let planId: string;

  function expectPresent<T>(
    value: T | null | undefined,
    message: string,
  ): NonNullable<T> {
    expect(value).toBeDefined();
    if (value == null) {
      throw new Error(message);
    }
    return value;
  }

  async function createJob(
    overrides: Partial<JobInsert> = {},
  ): Promise<InferSelectModel<typeof jobQueue>> {
    const defaults: Partial<JobInsert> = {
      jobType: 'plan_regeneration',
      planId,
      userId,
      priority: 0,
      attempts: 0,
      maxAttempts: 3,
      payload: {},
      scheduledFor: new Date(),
    };
    const [row] = await db
      .insert(jobQueue)
      .values({ ...defaults, ...overrides } as JobInsert)
      .returning();
    if (!row) throw new Error('createJob: no row returned');
    return row;
  }

  beforeEach(async () => {
    // Create a user and plan for testing (unique per run to avoid parallel collisions)
    const user = await createTestUser();
    userId = user.id;

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Test Job Plan',
        skillLevel: 'intermediate',
        weeklyHours: 10,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
        generationStatus: 'ready',
      })
      .returning();

    planId = expectPresent(plan, 'Failed to create plan fixture').id;
  });

  it('atomically claims a regeneration job with workflow ownership metadata', async () => {
    const pending = await createJob({
      status: 'pending',
      payload: { planId },
    });
    const payload = {
      planId,
      workflow: {
        provider: 'workflow-sdk' as const,
        runId: 'wrun_atomic_claim',
        startedAt: '2026-06-22T18:00:00.000Z',
      },
    };

    const claimed = await claimRegenerationJobById(
      pending.id,
      { planId, userId },
      payload,
      db,
    );

    expect(claimed).toMatchObject({
      id: pending.id,
      status: 'processing',
      data: payload,
    });
    expect(claimed?.processingStartedAt).toBeInstanceOf(Date);

    const competing = await claimRegenerationJobById(
      pending.id,
      { planId, userId },
      {
        ...payload,
        workflow: { ...payload.workflow, runId: 'wrun_competing' },
      },
      db,
    );
    expect(competing).toBeNull();
  });

  describe('insertJobRecord deduplication', () => {
    it('deduplicates regeneration jobs per owner and plan', async () => {
      const secondUser = await createTestUser();
      const secondUserId = secondUser.id;
      const [secondUserPlan] = await db
        .insert(learningPlans)
        .values({
          userId: secondUserId,
          topic: 'Second User Job Plan',
          skillLevel: 'intermediate',
          weeklyHours: 8,
          learningStyle: 'mixed',
          visibility: 'private',
          origin: 'ai',
          generationStatus: 'ready',
        })
        .returning({ id: learningPlans.id });

      if (!secondUserPlan) {
        throw new Error('Failed to create second user plan for dedupe test');
      }

      const firstInsert = await insertJobRecord(
        {
          type: JOB_TYPES.PLAN_REGENERATION,
          planId,
          userId,
          data: { planId },
          priority: 0,
        },
        db,
      );

      const dedupedForSameUser = await insertJobRecord(
        {
          type: JOB_TYPES.PLAN_REGENERATION,
          planId,
          userId,
          data: { planId },
          priority: 0,
        },
        db,
      );

      const secondUserInsert = await insertJobRecord(
        {
          type: JOB_TYPES.PLAN_REGENERATION,
          planId: secondUserPlan.id,
          userId: secondUserId,
          data: { planId: secondUserPlan.id },
          priority: 0,
        },
        db,
      );

      await expect(
        insertJobRecord(
          {
            type: JOB_TYPES.PLAN_REGENERATION,
            planId,
            userId: secondUserId,
            data: { planId },
            priority: 0,
          },
          db,
        ),
      ).rejects.toThrow(`Plan not found or inaccessible: ${planId}`);

      expect(firstInsert.deduplicated).toBe(false);
      expect(dedupedForSameUser.deduplicated).toBe(true);
      expect(dedupedForSameUser.id).toBe(firstInsert.id);
      expect(secondUserInsert.deduplicated).toBe(false);
      expect(secondUserInsert.id).not.toBe(firstInsert.id);

      const activeForFirstUser = await getActiveRegenerationJob(
        planId,
        userId,
        db,
      );
      const activeForSecondUser = await getActiveRegenerationJob(
        secondUserPlan.id,
        secondUserId,
        db,
      );

      const secondUserActiveJob = expectPresent(
        activeForSecondUser,
        'Expected active job for second user',
      );
      const firstUserActiveJob = expectPresent(
        activeForFirstUser,
        'Expected active job for first user',
      );
      expect(firstUserActiveJob.id).toBe(firstInsert.id);
      expect(secondUserActiveJob.id).toBe(secondUserInsert.id);
    });
  });
});
