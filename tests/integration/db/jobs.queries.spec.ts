import { describe, expect, it, beforeEach } from 'vitest';

import { db } from '@/lib/db/service-role';
import {
  getFailedJobs,
  getJobStats,
  cleanupOldJobs,
} from '@/lib/db/queries/jobs';
import { jobQueue, learningPlans } from '@/lib/db/schema';
import { ensureUser } from '../../helpers/db';

describe('Job Queries', () => {
  let userId: string;
  let planId: string;

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
      // Create some jobs
      await db.insert(jobQueue).values([
        {
          jobType: 'plan_generation',
          planId,
          userId,
          status: 'failed',
          priority: 0,
          attempts: 3,
          maxAttempts: 3,
          payload: {},
          error: 'Generation failed',
          scheduledFor: new Date(),
          completedAt: new Date(),
        },
        {
          jobType: 'plan_generation',
          planId,
          userId,
          status: 'completed',
          priority: 0,
          attempts: 1,
          maxAttempts: 3,
          payload: {},
          scheduledFor: new Date(),
          completedAt: new Date(),
        },
      ]);

      const failedJobs = await getFailedJobs(10);

      expect(failedJobs.length).toBe(1);
      expect(failedJobs[0].status).toBe('failed');
      expect(failedJobs[0].error).toBe('Generation failed');
    });

    it('should respect limit parameter', async () => {
      // Create multiple failed jobs
      const jobValues = Array.from({ length: 5 }, (_, i) => ({
        jobType: 'plan_generation' as const,
        planId,
        userId,
        status: 'failed' as const,
        priority: 0,
        attempts: 3,
        maxAttempts: 3,
        payload: {},
        error: `Error ${i}`,
        scheduledFor: new Date(),
        completedAt: new Date(Date.now() - i * 1000), // Different completion times
      }));

      await db.insert(jobQueue).values(jobValues);

      const failedJobs = await getFailedJobs(3);

      expect(failedJobs.length).toBe(3);
    });

    it('should return most recent failed jobs first', async () => {
      // Create failed jobs with different completion times
      await db.insert(jobQueue).values([
        {
          jobType: 'plan_generation',
          planId,
          userId,
          status: 'failed',
          priority: 0,
          attempts: 3,
          maxAttempts: 3,
          payload: {},
          error: 'Old error',
          scheduledFor: new Date(),
          completedAt: new Date(Date.now() - 60000), // 1 minute ago
        },
        {
          jobType: 'plan_generation',
          planId,
          userId,
          status: 'failed',
          priority: 0,
          attempts: 3,
          maxAttempts: 3,
          payload: {},
          error: 'Recent error',
          scheduledFor: new Date(),
          completedAt: new Date(), // Now
        },
      ]);

      const failedJobs = await getFailedJobs(10);

      expect(failedJobs.length).toBeGreaterThanOrEqual(2);
      expect(failedJobs[0].error).toBe('Recent error');
    });

    it('should not return non-failed jobs', async () => {
      await db.insert(jobQueue).values([
        {
          jobType: 'plan_generation',
          planId,
          userId,
          status: 'pending',
          priority: 0,
          attempts: 0,
          maxAttempts: 3,
          payload: {},
          scheduledFor: new Date(),
        },
        {
          jobType: 'plan_generation',
          planId,
          userId,
          status: 'processing',
          priority: 0,
          attempts: 1,
          maxAttempts: 3,
          payload: {},
          scheduledFor: new Date(),
          startedAt: new Date(),
        },
        {
          jobType: 'plan_generation',
          planId,
          userId,
          status: 'completed',
          priority: 0,
          attempts: 1,
          maxAttempts: 3,
          payload: {},
          scheduledFor: new Date(),
          completedAt: new Date(),
        },
      ]);

      const failedJobs = await getFailedJobs(10);

      expect(failedJobs.length).toBe(0);
    });
  });

  describe('getJobStats', () => {
    it('should return correct job statistics', async () => {
      const since = new Date(Date.now() - 3600000); // 1 hour ago

      // Create jobs with different statuses
      await db.insert(jobQueue).values([
        {
          jobType: 'plan_generation',
          planId,
          userId,
          status: 'pending',
          priority: 0,
          attempts: 0,
          maxAttempts: 3,
          payload: {},
          scheduledFor: new Date(),
        },
        {
          jobType: 'plan_generation',
          planId,
          userId,
          status: 'processing',
          priority: 0,
          attempts: 1,
          maxAttempts: 3,
          payload: {},
          scheduledFor: new Date(),
          startedAt: new Date(),
        },
        {
          jobType: 'plan_generation',
          planId,
          userId,
          status: 'completed',
          priority: 0,
          attempts: 1,
          maxAttempts: 3,
          payload: {},
          scheduledFor: new Date(),
          startedAt: new Date(Date.now() - 5000),
          completedAt: new Date(),
        },
        {
          jobType: 'plan_generation',
          planId,
          userId,
          status: 'failed',
          priority: 0,
          attempts: 3,
          maxAttempts: 3,
          payload: {},
          scheduledFor: new Date(),
          completedAt: new Date(),
        },
      ]);

      const stats = await getJobStats(since);

      expect(stats.pendingCount).toBe(1);
      expect(stats.processingCount).toBe(1);
      expect(stats.completedCount).toBe(1);
      expect(stats.failedCount).toBe(1);
      expect(stats.failureRate).toBe(0.5); // 1 failed out of 2 finished (1 completed + 1 failed)
    });

    it('should only count jobs since specified date', async () => {
      const recentDate = new Date();
      const oldDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      // Create old job
      await db.insert(jobQueue).values({
        jobType: 'plan_generation',
        planId,
        userId,
        status: 'completed',
        priority: 0,
        attempts: 1,
        maxAttempts: 3,
        payload: {},
        scheduledFor: oldDate,
        createdAt: oldDate,
        completedAt: oldDate,
      });

      // Create recent job
      await db.insert(jobQueue).values({
        jobType: 'plan_generation',
        planId,
        userId,
        status: 'completed',
        priority: 0,
        attempts: 1,
        maxAttempts: 3,
        payload: {},
        scheduledFor: recentDate,
        createdAt: recentDate,
        completedAt: recentDate,
      });

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours
      const stats = await getJobStats(since);

      // Should only count the recent job
      expect(stats.completedCount).toBe(1);
    });

    it('should calculate average processing time correctly', async () => {
      const now = new Date();
      const since = new Date(Date.now() - 3600000);

      // Create completed jobs with known processing times
      await db.insert(jobQueue).values([
        {
          jobType: 'plan_generation',
          planId,
          userId,
          status: 'completed',
          priority: 0,
          attempts: 1,
          maxAttempts: 3,
          payload: {},
          scheduledFor: now,
          startedAt: new Date(now.getTime() - 2000), // Started 2 seconds before completion
          completedAt: now,
        },
        {
          jobType: 'plan_generation',
          planId,
          userId,
          status: 'completed',
          priority: 0,
          attempts: 1,
          maxAttempts: 3,
          payload: {},
          scheduledFor: now,
          startedAt: new Date(now.getTime() - 4000), // Started 4 seconds before completion
          completedAt: now,
        },
      ]);

      const stats = await getJobStats(since);

      expect(stats.averageProcessingTimeMs).not.toBeNull();
      // Average should be around 3000ms (2000 + 4000) / 2
      expect(stats.averageProcessingTimeMs).toBeGreaterThan(2500);
      expect(stats.averageProcessingTimeMs).toBeLessThan(3500);
    });

    it('should return zero failure rate when all jobs succeed', async () => {
      const since = new Date(Date.now() - 3600000);

      await db.insert(jobQueue).values([
        {
          jobType: 'plan_generation',
          planId,
          userId,
          status: 'completed',
          priority: 0,
          attempts: 1,
          maxAttempts: 3,
          payload: {},
          scheduledFor: new Date(),
          completedAt: new Date(),
        },
        {
          jobType: 'plan_generation',
          planId,
          userId,
          status: 'completed',
          priority: 0,
          attempts: 1,
          maxAttempts: 3,
          payload: {},
          scheduledFor: new Date(),
          completedAt: new Date(),
        },
      ]);

      const stats = await getJobStats(since);

      expect(stats.failureRate).toBe(0);
    });
  });

  describe('cleanupOldJobs', () => {
    it('should delete old completed jobs', async () => {
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const recentDate = new Date();

      // Create old completed job
      await db.insert(jobQueue).values({
        jobType: 'plan_generation',
        planId,
        userId,
        status: 'completed',
        priority: 0,
        attempts: 1,
        maxAttempts: 3,
        payload: {},
        scheduledFor: oldDate,
        completedAt: oldDate,
      });

      // Create recent completed job
      await db.insert(jobQueue).values({
        jobType: 'plan_generation',
        planId,
        userId,
        status: 'completed',
        priority: 0,
        attempts: 1,
        maxAttempts: 3,
        payload: {},
        scheduledFor: recentDate,
        completedAt: recentDate,
      });

      const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      const deletedCount = await cleanupOldJobs(threshold);

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

      await db.insert(jobQueue).values({
        jobType: 'plan_generation',
        planId,
        userId,
        status: 'failed',
        priority: 0,
        attempts: 3,
        maxAttempts: 3,
        payload: {},
        error: 'Test error',
        scheduledFor: oldDate,
        completedAt: oldDate,
      });

      const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const deletedCount = await cleanupOldJobs(threshold);

      expect(deletedCount).toBeGreaterThanOrEqual(1);
    });

    it('should not delete pending or processing jobs', async () => {
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

      await db.insert(jobQueue).values([
        {
          jobType: 'plan_generation',
          planId,
          userId,
          status: 'pending',
          priority: 0,
          attempts: 0,
          maxAttempts: 3,
          payload: {},
          scheduledFor: oldDate,
          createdAt: oldDate,
        },
        {
          jobType: 'plan_generation',
          planId,
          userId,
          status: 'processing',
          priority: 0,
          attempts: 1,
          maxAttempts: 3,
          payload: {},
          scheduledFor: oldDate,
          createdAt: oldDate,
          startedAt: oldDate,
        },
      ]);

      const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      await cleanupOldJobs(threshold);

      // Should not delete these jobs
      const remainingJobs = await db.select().from(jobQueue);
      const hasPending = remainingJobs.some((job) => job.status === 'pending');
      const hasProcessing = remainingJobs.some(
        (job) => job.status === 'processing'
      );

      expect(hasPending || hasProcessing).toBe(true);
    });

    it('should return zero when no jobs to clean up', async () => {
      const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const deletedCount = await cleanupOldJobs(threshold);

      expect(deletedCount).toBe(0);
    });

    it('should handle cleanup of large number of jobs', async () => {
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

      // Create many old completed jobs
      const jobValues = Array.from({ length: 20 }, () => ({
        jobType: 'plan_generation' as const,
        planId,
        userId,
        status: 'completed' as const,
        priority: 0,
        attempts: 1,
        maxAttempts: 3,
        payload: {},
        scheduledFor: oldDate,
        completedAt: oldDate,
      }));

      await db.insert(jobQueue).values(jobValues);

      const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const deletedCount = await cleanupOldJobs(threshold);

      expect(deletedCount).toBe(20);
    });
  });
});
