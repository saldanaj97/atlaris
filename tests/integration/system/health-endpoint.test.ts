import { describe, expect, it } from 'vitest';

import { db } from '@/lib/db/drizzle';
import { jobQueue } from '@/lib/db/schema';
import { JOB_TYPES } from '@/lib/jobs/types';
import { GET } from '@/app/api/health/worker/route';
import { ensureUser } from '../helpers/db';

describe('Health Endpoint', () => {
  describe('Healthy State', () => {
    it('should return 200 with healthy status when no issues exist', async () => {
      // T064: Health endpoint healthy
      const userId = await ensureUser({
        clerkUserId: 'test-clerk-health',
        email: 'health@example.com',
      });

      // Create some normal jobs that don't trigger alerts
      const now = new Date();

      // Recent pending job (not a backlog yet)
      await db.insert(jobQueue).values({
        userId,
        jobType: JOB_TYPES.PLAN_GENERATION,
        status: 'pending',
        payload: { test: 'data1' },
        createdAt: now,
        updatedAt: now,
      });

      // Recent processing job (not stuck)
      await db.insert(jobQueue).values({
        userId,
        jobType: JOB_TYPES.PLAN_GENERATION,
        status: 'processing',
        payload: { test: 'data2' },
        startedAt: new Date(now.getTime() - 60 * 1000), // 1 minute ago (not stuck)
        createdAt: now,
        updatedAt: now,
      });

      // Completed job
      await db.insert(jobQueue).values({
        userId,
        jobType: JOB_TYPES.PLAN_GENERATION,
        status: 'completed',
        payload: { test: 'data3' },
        result: { success: true },
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('checks');
      expect(data.checks.stuckJobs.status).toBe('ok');
      expect(data.checks.stuckJobs.count).toBe(0);
      expect(data.checks.backlog.status).toBe('ok');
      expect(data.checks.backlog.count).toBeLessThanOrEqual(100);
    });
  });

  describe('Unhealthy State - Stuck Jobs', () => {
    it('should return 503 when stuck jobs are detected', async () => {
      // T065: Health endpoint unhealthy (stuck job)
      const userId = await ensureUser({
        clerkUserId: 'test-clerk-stuck',
        email: 'stuck@example.com',
      });

      const now = new Date();
      const elevenMinutesAgo = new Date(now.getTime() - 11 * 60 * 1000);

      // Create a stuck job (processing for > 10 minutes)
      await db.insert(jobQueue).values({
        userId,
        jobType: JOB_TYPES.PLAN_GENERATION,
        status: 'processing',
        payload: { test: 'stuck-job' },
        startedAt: elevenMinutesAgo,
        createdAt: elevenMinutesAgo,
        updatedAt: elevenMinutesAgo,
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.status).toBe('unhealthy');
      expect(data).toHaveProperty('reason');
      expect(data.reason).toContain('stuck job');
      expect(data.checks.stuckJobs.status).toBe('fail');
      expect(data.checks.stuckJobs.count).toBeGreaterThan(0);
      expect(data.checks.stuckJobs.threshold).toBe(10 * 60 * 1000); // 10 minutes in ms
    });

    it('should not detect recent processing jobs as stuck', async () => {
      const userId = await ensureUser({
        clerkUserId: 'test-clerk-recent',
        email: 'recent@example.com',
      });

      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      // Create a recent processing job (not stuck)
      await db.insert(jobQueue).values({
        userId,
        jobType: JOB_TYPES.PLAN_GENERATION,
        status: 'processing',
        payload: { test: 'recent-job' },
        startedAt: fiveMinutesAgo,
        createdAt: fiveMinutesAgo,
        updatedAt: fiveMinutesAgo,
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.checks.stuckJobs.status).toBe('ok');
      expect(data.checks.stuckJobs.count).toBe(0);
    });
  });

  describe('Unhealthy State - Backlog', () => {
    it('should return 503 when backlog exceeds threshold', async () => {
      // T066: Health endpoint backlog
      const userId = await ensureUser({
        clerkUserId: 'test-clerk-backlog',
        email: 'backlog@example.com',
      });

      const now = new Date();
      const BACKLOG_THRESHOLD = 100;

      // Create > threshold pending jobs
      const jobs = [];
      for (let i = 0; i < BACKLOG_THRESHOLD + 10; i++) {
        jobs.push({
          userId,
          jobType: JOB_TYPES.PLAN_GENERATION,
          status: 'pending' as const,
          payload: { test: `data${i}` },
          createdAt: now,
          updatedAt: now,
        });
      }

      await db.insert(jobQueue).values(jobs);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.status).toBe('unhealthy');
      expect(data).toHaveProperty('reason');
      expect(data.reason).toContain('backlog');
      expect(data.checks.backlog.status).toBe('fail');
      expect(data.checks.backlog.count).toBeGreaterThan(BACKLOG_THRESHOLD);
      expect(data.checks.backlog.threshold).toBe(BACKLOG_THRESHOLD);
    });

    it('should return healthy when backlog is below threshold', async () => {
      const userId = await ensureUser({
        clerkUserId: 'test-clerk-small-backlog',
        email: 'small-backlog@example.com',
      });

      const now = new Date();

      // Create only 5 pending jobs (well below threshold)
      const jobs = [];
      for (let i = 0; i < 5; i++) {
        jobs.push({
          userId,
          jobType: JOB_TYPES.PLAN_GENERATION,
          status: 'pending' as const,
          payload: { test: `data${i}` },
          createdAt: now,
          updatedAt: now,
        });
      }

      await db.insert(jobQueue).values(jobs);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.checks.backlog.status).toBe('ok');
      expect(data.checks.backlog.count).toBeLessThanOrEqual(100);
    });
  });

  describe('Multiple Issues', () => {
    it('should report both stuck jobs and backlog in reason', async () => {
      const userId = await ensureUser({
        clerkUserId: 'test-clerk-multiple',
        email: 'multiple@example.com',
      });

      const now = new Date();
      const elevenMinutesAgo = new Date(now.getTime() - 11 * 60 * 1000);

      // Create stuck job
      await db.insert(jobQueue).values({
        userId,
        jobType: JOB_TYPES.PLAN_GENERATION,
        status: 'processing',
        payload: { test: 'stuck' },
        startedAt: elevenMinutesAgo,
        createdAt: elevenMinutesAgo,
        updatedAt: elevenMinutesAgo,
      });

      // Create backlog
      const jobs = [];
      for (let i = 0; i < 110; i++) {
        jobs.push({
          userId,
          jobType: JOB_TYPES.PLAN_GENERATION,
          status: 'pending' as const,
          payload: { test: `data${i}` },
          createdAt: now,
          updatedAt: now,
        });
      }

      await db.insert(jobQueue).values(jobs);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.status).toBe('unhealthy');
      expect(data.reason).toContain('stuck job');
      expect(data.reason).toContain('backlog');
      expect(data.checks.stuckJobs.status).toBe('fail');
      expect(data.checks.backlog.status).toBe('fail');
    });
  });

  describe('Error Handling', () => {
    it('should include timestamp in all responses', async () => {
      const response = await GET();
      const data = await response.json();

      expect(data).toHaveProperty('timestamp');
      expect(() => new Date(data.timestamp)).not.toThrow();

      // Verify timestamp is recent (within last minute)
      const timestamp = new Date(data.timestamp);
      const now = new Date();
      const diffMs = now.getTime() - timestamp.getTime();
      expect(diffMs).toBeLessThan(60 * 1000); // within 1 minute
    });
  });
});
