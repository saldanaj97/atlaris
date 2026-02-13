import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  cleanupOldJobs,
  getActiveRegenerationJob,
  getFailedJobs,
  getJobStats,
  insertJobRecord,
} from '@/lib/db/queries/jobs';
import { jobQueue, learningPlans } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { JOB_TYPES } from '@/lib/jobs/types';
import { ensureUser } from '../../helpers/db';

type JobInsert = InferInsertModel<typeof jobQueue>;

describe('Job Queries', () => {
  let userId: string;
  let planId: string;

  async function createJob(
    overrides: Partial<JobInsert> = {}
  ): Promise<InferSelectModel<typeof jobQueue>> {
    const defaults: Partial<JobInsert> = {
      jobType: 'plan_generation',
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
    // Create a user and plan for testing
    userId = await ensureUser({
      authUserId: 'auth_job_test_user',
      email: 'jobtest@example.com',
    });

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

    planId = plan.id;
  });

  describe('getFailedJobs', () => {
    it('should return failed jobs', async () => {
      await createJob({
        status: 'failed',
        attempts: 3,
        maxAttempts: 3,
        error: 'Generation failed',
        completedAt: new Date(),
      });
      await createJob({
        status: 'completed',
        attempts: 1,
        completedAt: new Date(),
      });

      const failedJobs = await getFailedJobs(10, db);

      expect(failedJobs.length).toBe(1);
      expect(failedJobs[0].status).toBe('failed');
      expect(failedJobs[0].error).toBe('Generation failed');
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await createJob({
          status: 'failed',
          attempts: 3,
          maxAttempts: 3,
          error: `Error ${i}`,
          completedAt: new Date(Date.now() - i * 1000),
        });
      }

      const failedJobs = await getFailedJobs(3, db);

      expect(failedJobs.length).toBe(3);
    });

    it('should return most recent failed jobs first', async () => {
      await createJob({
        status: 'failed',
        attempts: 3,
        maxAttempts: 3,
        error: 'Old error',
        completedAt: new Date(Date.now() - 60000),
      });
      await createJob({
        status: 'failed',
        attempts: 3,
        maxAttempts: 3,
        error: 'Recent error',
        completedAt: new Date(),
      });

      const failedJobs = await getFailedJobs(10, db);

      expect(failedJobs.length).toBeGreaterThanOrEqual(2);
      expect(failedJobs[0].error).toBe('Recent error');
    });

    it('should not return non-failed jobs', async () => {
      await createJob({ status: 'pending' });
      await createJob({
        status: 'processing',
        attempts: 1,
        startedAt: new Date(),
      });
      await createJob({
        status: 'completed',
        attempts: 1,
        completedAt: new Date(),
      });

      const failedJobs = await getFailedJobs(10, db);

      expect(failedJobs.length).toBe(0);
    });
  });

  describe('getJobStats', () => {
    it('should return correct job statistics', async () => {
      const since = new Date(Date.now() - 3600000); // 1 hour ago

      await createJob({ status: 'pending' });
      await createJob({
        status: 'processing',
        attempts: 1,
        startedAt: new Date(),
      });
      await createJob({
        status: 'completed',
        attempts: 1,
        startedAt: new Date(Date.now() - 5000),
        completedAt: new Date(),
      });
      await createJob({
        status: 'failed',
        attempts: 3,
        maxAttempts: 3,
        completedAt: new Date(),
      });

      const stats = await getJobStats(since, db);

      expect(stats.pendingCount).toBe(1);
      expect(stats.processingCount).toBe(1);
      expect(stats.completedCount).toBe(1);
      expect(stats.failedCount).toBe(1);
      expect(stats.failureRate).toBe(0.5); // 1 failed out of 2 finished (1 completed + 1 failed)
    });

    it('should only count jobs since specified date', async () => {
      const recentDate = new Date();
      const oldDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      await createJob({
        status: 'completed',
        attempts: 1,
        scheduledFor: oldDate,
        createdAt: oldDate,
        completedAt: oldDate,
      });
      await createJob({
        status: 'completed',
        attempts: 1,
        scheduledFor: recentDate,
        createdAt: recentDate,
        completedAt: recentDate,
      });

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours
      const stats = await getJobStats(since, db);

      // Should only count the recent job
      expect(stats.completedCount).toBe(1);
    });

    it('should calculate average processing time correctly', async () => {
      const now = new Date();
      const since = new Date(Date.now() - 3600000);

      await createJob({
        status: 'completed',
        attempts: 1,
        scheduledFor: now,
        startedAt: new Date(now.getTime() - 2000),
        completedAt: now,
      });
      await createJob({
        status: 'completed',
        attempts: 1,
        scheduledFor: now,
        startedAt: new Date(now.getTime() - 4000),
        completedAt: now,
      });

      const stats = await getJobStats(since, db);

      expect(stats.averageProcessingTimeMs).not.toBeNull();
      // Average should be around 3000ms (2000 + 4000) / 2
      expect(stats.averageProcessingTimeMs).toBeGreaterThan(2500);
      expect(stats.averageProcessingTimeMs).toBeLessThan(3500);
    });

    it('should return zero failure rate when all jobs succeed', async () => {
      const since = new Date(Date.now() - 3600000);

      await createJob({
        status: 'completed',
        attempts: 1,
        completedAt: new Date(),
      });
      await createJob({
        status: 'completed',
        attempts: 1,
        completedAt: new Date(),
      });

      const stats = await getJobStats(since, db);

      expect(stats.failureRate).toBe(0);
    });
  });

  describe('cleanupOldJobs', () => {
    it('should delete old completed jobs', async () => {
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const recentDate = new Date();

      await createJob({
        status: 'completed',
        attempts: 1,
        scheduledFor: oldDate,
        completedAt: oldDate,
      });
      await createJob({
        status: 'completed',
        attempts: 1,
        scheduledFor: recentDate,
        completedAt: recentDate,
      });

      const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      const deletedCount = await cleanupOldJobs(threshold, db);

      expect(deletedCount).toBeGreaterThanOrEqual(1);

      // Verify old job is gone
      const remainingJobs = await db.select().from(jobQueue);
      expect(remainingJobs.length).toBeGreaterThanOrEqual(1);
      expect(
        remainingJobs.every(
          (job) => job.completedAt && job.completedAt > threshold
        )
      ).toBe(true);
    });

    it('should delete old failed jobs', async () => {
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

      await createJob({
        status: 'failed',
        attempts: 3,
        maxAttempts: 3,
        error: 'Test error',
        scheduledFor: oldDate,
        completedAt: oldDate,
      });

      const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const deletedCount = await cleanupOldJobs(threshold, db);

      expect(deletedCount).toBeGreaterThanOrEqual(1);
    });

    it('should not delete pending or processing jobs', async () => {
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

      await createJob({ status: 'pending', scheduledFor: oldDate });
      await createJob({
        status: 'processing',
        attempts: 1,
        scheduledFor: oldDate,
        startedAt: oldDate,
      });

      const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      await cleanupOldJobs(threshold, db);

      // Should not delete these jobs
      const remainingJobs = await db.select().from(jobQueue);
      const hasPending = remainingJobs.some((job) => job.status === 'pending');
      const hasProcessing = remainingJobs.some(
        (job) => job.status === 'processing'
      );

      expect(hasPending).toBe(true);
      expect(hasProcessing).toBe(true);
    });

    it('should return zero when no jobs to clean up', async () => {
      const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const deletedCount = await cleanupOldJobs(threshold, db);

      expect(deletedCount).toBe(0);
    });

    it('should handle cleanup of large number of jobs', async () => {
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

      for (let i = 0; i < 20; i++) {
        await createJob({
          status: 'completed',
          attempts: 1,
          scheduledFor: oldDate,
          completedAt: oldDate,
        });
      }

      const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const deletedCount = await cleanupOldJobs(threshold, db);

      expect(deletedCount).toBe(20);
    });
  });

  describe('insertJobRecord deduplication', () => {
    it('deduplicates regeneration jobs per user and plan', async () => {
      const secondUserId = await ensureUser({
        authUserId: 'auth_job_test_user_2',
        email: 'jobtest-2@example.com',
      });

      const firstInsert = await insertJobRecord(
        {
          type: JOB_TYPES.PLAN_REGENERATION,
          planId,
          userId,
          data: { planId },
          priority: 0,
        },
        db
      );

      const dedupedForSameUser = await insertJobRecord(
        {
          type: JOB_TYPES.PLAN_REGENERATION,
          planId,
          userId,
          data: { planId },
          priority: 0,
        },
        db
      );

      const secondUserInsert = await insertJobRecord(
        {
          type: JOB_TYPES.PLAN_REGENERATION,
          planId,
          userId: secondUserId,
          data: { planId },
          priority: 0,
        },
        db
      );

      expect(firstInsert.deduplicated).toBe(false);
      expect(dedupedForSameUser.deduplicated).toBe(true);
      expect(dedupedForSameUser.id).toBe(firstInsert.id);
      expect(secondUserInsert.deduplicated).toBe(false);
      expect(secondUserInsert.id).not.toBe(firstInsert.id);

      const activeForFirstUser = await getActiveRegenerationJob(
        planId,
        userId,
        db
      );
      const activeForSecondUser = await getActiveRegenerationJob(
        planId,
        secondUserId,
        db
      );

      expect(activeForFirstUser?.id).toBe(firstInsert.id);
      expect(activeForSecondUser?.id).toBe(secondUserInsert.id);
    });
  });
});
