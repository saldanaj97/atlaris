import { describe, expect, it } from 'vitest';

import { db } from '@/lib/db/service-role';
import { cleanupOldJobs, getFailedJobs, getJobStats } from '@/lib/db/queries';
import { jobQueue } from '@/lib/db/schema';
import { JOB_TYPES } from '@/lib/jobs/types';
import { ensureUser } from '../helpers/db';

describe('Monitoring Queries', () => {
  describe('getJobStats', () => {
    it('should return correct counts and statistics for jobs', async () => {
      // T060: Monitoring queries test
      const userId = await ensureUser({
        authUserId: 'test-auth-id',
        email: 'test@example.com',
      });

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      // Create synthetic jobs with different statuses
      // 2 pending jobs
      await db.insert(jobQueue).values([
        {
          userId,
          jobType: JOB_TYPES.PLAN_GENERATION,
          status: 'pending',
          payload: { test: 'data1' },
          createdAt: oneHourAgo,
          updatedAt: oneHourAgo,
        },
        {
          userId,
          jobType: JOB_TYPES.PLAN_GENERATION,
          status: 'pending',
          payload: { test: 'data2' },
          createdAt: oneHourAgo,
          updatedAt: oneHourAgo,
        },
      ]);

      // 1 processing job
      await db.insert(jobQueue).values({
        userId,
        jobType: JOB_TYPES.PLAN_GENERATION,
        status: 'processing',
        payload: { test: 'data3' },
        startedAt: new Date(now.getTime() - 5 * 1000), // started 5s ago
        createdAt: oneHourAgo,
        updatedAt: oneHourAgo,
      });

      // 3 completed jobs with known durations
      const completedJobs = [
        {
          userId,
          jobType: JOB_TYPES.PLAN_GENERATION,
          status: 'completed' as const,
          payload: { test: 'data4' },
          startedAt: new Date(now.getTime() - 10 * 1000), // 10s duration
          completedAt: now,
          result: { success: true },
          createdAt: oneHourAgo,
          updatedAt: now,
        },
        {
          userId,
          jobType: JOB_TYPES.PLAN_GENERATION,
          status: 'completed' as const,
          payload: { test: 'data5' },
          startedAt: new Date(now.getTime() - 20 * 1000), // 20s duration
          completedAt: now,
          result: { success: true },
          createdAt: oneHourAgo,
          updatedAt: now,
        },
        {
          userId,
          jobType: JOB_TYPES.PLAN_GENERATION,
          status: 'completed' as const,
          payload: { test: 'data6' },
          startedAt: new Date(now.getTime() - 30 * 1000), // 30s duration
          completedAt: now,
          result: { success: true },
          createdAt: oneHourAgo,
          updatedAt: now,
        },
      ];

      await db.insert(jobQueue).values(completedJobs);

      // 2 failed jobs
      const failedJobs = [
        {
          userId,
          jobType: JOB_TYPES.PLAN_GENERATION,
          status: 'failed' as const,
          payload: { test: 'data7' },
          error: 'Test error 1',
          startedAt: new Date(now.getTime() - 5 * 1000),
          completedAt: now,
          createdAt: oneHourAgo,
          updatedAt: now,
        },
        {
          userId,
          jobType: JOB_TYPES.PLAN_GENERATION,
          status: 'failed' as const,
          payload: { test: 'data8' },
          error: 'Test error 2',
          startedAt: new Date(now.getTime() - 10 * 1000),
          completedAt: now,
          createdAt: oneHourAgo,
          updatedAt: now,
        },
      ];

      await db.insert(jobQueue).values(failedJobs);

      // Query stats since 2 hours ago (should include all jobs)
      const stats = await getJobStats(twoHoursAgo);

      // Assert correct counts
      expect(stats.pendingCount).toBe(2);
      expect(stats.processingCount).toBe(1);
      expect(stats.completedCount).toBe(3);
      expect(stats.failedCount).toBe(2);

      // Assert average processing time (10s + 20s + 30s) / 3 = 20s = 20000ms
      expect(stats.averageProcessingTimeMs).toBeCloseTo(20000, -2); // tolerance to nearest 100ms

      // Assert failure rate: 2 failed / (3 completed + 2 failed) = 2/5 = 0.4
      expect(stats.failureRate).toBeCloseTo(0.4, 2);
    });

    it('should only count jobs since the specified timestamp', async () => {
      const userId = await ensureUser({
        authUserId: 'test-auth-id-2',
        email: 'test2@example.com',
      });

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      // Old job (2 hours ago)
      await db.insert(jobQueue).values({
        userId,
        jobType: JOB_TYPES.PLAN_GENERATION,
        status: 'completed',
        payload: { test: 'old' },
        startedAt: twoHoursAgo,
        completedAt: twoHoursAgo,
        result: { success: true },
        createdAt: twoHoursAgo,
        updatedAt: twoHoursAgo,
      });

      // Recent job (30 min ago)
      await db.insert(jobQueue).values({
        userId,
        jobType: JOB_TYPES.PLAN_GENERATION,
        status: 'completed',
        payload: { test: 'recent' },
        startedAt: oneHourAgo,
        completedAt: oneHourAgo,
        result: { success: true },
        createdAt: oneHourAgo,
        updatedAt: oneHourAgo,
      });

      // Query only jobs since 1 hour ago
      const stats = await getJobStats(oneHourAgo);

      // Should only count the recent job
      expect(stats.completedCount).toBe(1);
    });
  });

  describe('getFailedJobs', () => {
    it('should retrieve most recent failed jobs with correct limit', async () => {
      // T061: Failed jobs retrieval test
      const userId = await ensureUser({
        authUserId: 'test-auth-id-3',
        email: 'test3@example.com',
      });

      const now = new Date();
      const timestamps = [
        new Date(now.getTime() - 50 * 1000), // 50s ago
        new Date(now.getTime() - 40 * 1000), // 40s ago
        new Date(now.getTime() - 30 * 1000), // 30s ago
        new Date(now.getTime() - 20 * 1000), // 20s ago
        new Date(now.getTime() - 10 * 1000), // 10s ago (most recent)
      ];

      // Create 5 failed jobs with different timestamps
      for (let i = 0; i < 5; i++) {
        await db.insert(jobQueue).values({
          userId,
          jobType: JOB_TYPES.PLAN_GENERATION,
          status: 'failed',
          payload: { test: `data${i}` },
          error: `Error message ${i}`,
          completedAt: timestamps[i],
          createdAt: timestamps[i],
          updatedAt: timestamps[i],
        });
      }

      // Request only 3 most recent failed jobs
      const failedJobs = await getFailedJobs(3);

      expect(failedJobs).toHaveLength(3);

      // Verify they are ordered by most recent first
      expect(failedJobs[0]?.error).toBe('Error message 4'); // most recent
      expect(failedJobs[1]?.error).toBe('Error message 3');
      expect(failedJobs[2]?.error).toBe('Error message 2');

      // Verify all have error messages
      failedJobs.forEach((job) => {
        expect(job.error).toBeTruthy();
        expect(job.status).toBe('failed');
      });
    });

    it('should return empty array when no failed jobs exist', async () => {
      const userId = await ensureUser({
        authUserId: 'test-auth-id-4',
        email: 'test4@example.com',
      });

      // Create only successful jobs
      await db.insert(jobQueue).values({
        userId,
        jobType: JOB_TYPES.PLAN_GENERATION,
        status: 'completed',
        payload: { test: 'data' },
        result: { success: true },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const failedJobs = await getFailedJobs(10);

      expect(failedJobs).toHaveLength(0);
    });
  });

  describe('cleanupOldJobs', () => {
    it('should delete only old completed and failed jobs', async () => {
      // T062: Cleanup test
      const userId = await ensureUser({
        authUserId: 'test-auth-id-5',
        email: 'test5@example.com',
      });

      const now = new Date();
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Old completed job (should be deleted)
      await db.insert(jobQueue).values({
        userId,
        jobType: JOB_TYPES.PLAN_GENERATION,
        status: 'completed',
        payload: { test: 'old-completed' },
        completedAt: twoWeeksAgo,
        result: { success: true },
        createdAt: twoWeeksAgo,
        updatedAt: twoWeeksAgo,
      });

      // Old failed job (should be deleted)
      await db.insert(jobQueue).values({
        userId,
        jobType: JOB_TYPES.PLAN_GENERATION,
        status: 'failed',
        payload: { test: 'old-failed' },
        error: 'Old error',
        completedAt: twoWeeksAgo,
        createdAt: twoWeeksAgo,
        updatedAt: twoWeeksAgo,
      });

      // Recent completed job (should remain)
      await db.insert(jobQueue).values({
        userId,
        jobType: JOB_TYPES.PLAN_GENERATION,
        status: 'completed',
        payload: { test: 'recent-completed' },
        completedAt: oneDayAgo,
        result: { success: true },
        createdAt: oneDayAgo,
        updatedAt: oneDayAgo,
      });

      // Pending job (should remain regardless of age)
      await db.insert(jobQueue).values({
        userId,
        jobType: JOB_TYPES.PLAN_GENERATION,
        status: 'pending',
        payload: { test: 'old-pending' },
        createdAt: twoWeeksAgo,
        updatedAt: twoWeeksAgo,
      });

      // Processing job (should remain regardless of age)
      await db.insert(jobQueue).values({
        userId,
        jobType: JOB_TYPES.PLAN_GENERATION,
        status: 'processing',
        payload: { test: 'old-processing' },
        startedAt: twoWeeksAgo,
        createdAt: twoWeeksAgo,
        updatedAt: twoWeeksAgo,
      });

      // Cleanup jobs older than 1 week
      const deletedCount = await cleanupOldJobs(oneWeekAgo);

      expect(deletedCount).toBe(2); // Should delete 2 old completed/failed jobs

      // Verify remaining jobs
      const remainingJobs = await db.select().from(jobQueue);

      expect(remainingJobs).toHaveLength(3);

      const statuses = remainingJobs.map((j) => j.status);
      expect(statuses).toContain('completed'); // recent completed
      expect(statuses).toContain('pending'); // old pending
      expect(statuses).toContain('processing'); // old processing

      // Verify old completed/failed jobs are gone
      const oldJobs = remainingJobs.filter(
        (j) =>
          j.createdAt < oneWeekAgo &&
          (j.status === 'completed' || j.status === 'failed')
      );
      expect(oldJobs).toHaveLength(0);
    });

    it('should return 0 when no jobs match cleanup criteria', async () => {
      const userId = await ensureUser({
        authUserId: 'test-auth-id-6',
        email: 'test6@example.com',
      });

      const now = new Date();

      // Recent completed job
      await db.insert(jobQueue).values({
        userId,
        jobType: JOB_TYPES.PLAN_GENERATION,
        status: 'completed',
        payload: { test: 'recent' },
        completedAt: now,
        result: { success: true },
        createdAt: now,
        updatedAt: now,
      });

      // Try to cleanup jobs older than 1 year ago
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      const deletedCount = await cleanupOldJobs(oneYearAgo);

      expect(deletedCount).toBe(0);

      // Verify job still exists
      const remainingJobs = await db.select().from(jobQueue);
      expect(remainingJobs).toHaveLength(1);
    });
  });
});
