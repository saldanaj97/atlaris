import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '@/lib/db/drizzle';
import { jobQueue, learningPlans } from '@/lib/db/schema';
import { ensureUser } from '../../helpers/db';

describe('GET /api/health/worker', () => {
  let userId: string;
  let planId: string;

  beforeEach(async () => {
    // Clean up any existing test jobs
    await db.delete(jobQueue);

    // Ensure we have a valid user and plan to satisfy FK constraints
    userId = await ensureUser({
      clerkUserId: 'worker-health-test-user',
      email: 'worker-health@example.com',
    });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Health Check Plan',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'manual',
      })
      .returning();

    planId = plan.id;
  });

  it('should return healthy status when no issues', async () => {
    const { GET } = await import('@/app/api/health/worker/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toHaveProperty('status', 'healthy');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('checks');
    expect(body.checks).toHaveProperty('stuckJobs');
    expect(body.checks).toHaveProperty('backlog');
    expect(body.checks.stuckJobs.status).toBe('ok');
    expect(body.checks.backlog.status).toBe('ok');
  });

  it('should return unhealthy status when stuck jobs exist', async () => {
    // Create a stuck job (processing for > 10 minutes)
    const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000);

    await db.insert(jobQueue).values({
      planId,
      userId,
      jobType: 'plan_generation',
      status: 'processing',
      payload: { planId },
      startedAt: elevenMinutesAgo,
    });

    const { GET } = await import('@/app/api/health/worker/route');
    const response = await GET();

    expect(response.status).toBe(503);
    const body = await response.json();

    expect(body.status).toBe('unhealthy');
    expect(body.checks.stuckJobs.status).toBe('fail');
    expect(body.checks.stuckJobs.count).toBeGreaterThan(0);
    expect(body.reason).toContain('stuck job');
  });

  it('should return unhealthy status when backlog is excessive', async () => {
    // Create 101 pending jobs (threshold is 100)
    const jobs = Array.from({ length: 101 }, (_, i) => ({
      planId,
      userId,
      jobType: 'plan_generation' as const,
      status: 'pending' as const,
      payload: { planId: `test-plan-${i}` },
    }));

    await db.insert(jobQueue).values(jobs);

    const { GET } = await import('@/app/api/health/worker/route');
    const response = await GET();

    expect(response.status).toBe(503);
    const body = await response.json();

    expect(body.status).toBe('unhealthy');
    expect(body.checks.backlog.status).toBe('fail');
    expect(body.checks.backlog.count).toBeGreaterThan(100);
    expect(body.reason).toContain('backlog');
  });

  it('should report both stuck jobs and backlog issues', async () => {
    // Create a stuck job
    const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000);
    await db.insert(jobQueue).values({
      planId,
      userId,
      jobType: 'plan_generation',
      status: 'processing',
      payload: { planId: 'stuck-plan' },
      startedAt: elevenMinutesAgo,
    });

    // Create excessive backlog
    const jobs = Array.from({ length: 101 }, (_, i) => ({
      planId,
      userId,
      jobType: 'plan_generation' as const,
      status: 'pending' as const,
      payload: { planId: `backlog-plan-${i}` },
    }));
    await db.insert(jobQueue).values(jobs);

    const { GET } = await import('@/app/api/health/worker/route');
    const response = await GET();

    expect(response.status).toBe(503);
    const body = await response.json();

    expect(body.status).toBe('unhealthy');
    expect(body.checks.stuckJobs.status).toBe('fail');
    expect(body.checks.backlog.status).toBe('fail');
    expect(body.reason).toContain('stuck job');
    expect(body.reason).toContain('backlog');
  });

  it('should not flag recently started processing jobs as stuck', async () => {
    // Create a job that started 5 minutes ago (within threshold)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    await db.insert(jobQueue).values({
      planId,
      userId,
      jobType: 'plan_generation',
      status: 'processing',
      payload: { planId: 'recent-plan' },
      startedAt: fiveMinutesAgo,
    });

    const { GET } = await import('@/app/api/health/worker/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.status).toBe('healthy');
    expect(body.checks.stuckJobs.status).toBe('ok');
    expect(body.checks.stuckJobs.count).toBe(0);
  });

  it('should not count completed jobs in backlog', async () => {
    // Create 101 completed jobs
    const jobs = Array.from({ length: 101 }, (_, i) => ({
      planId,
      userId,
      jobType: 'plan_generation' as const,
      status: 'completed' as const,
      payload: { planId: `completed-plan-${i}` },
      startedAt: new Date(),
      completedAt: new Date(),
    }));

    await db.insert(jobQueue).values(jobs);

    const { GET } = await import('@/app/api/health/worker/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.status).toBe('healthy');
    expect(body.checks.backlog.status).toBe('ok');
    expect(body.checks.backlog.count).toBe(0);
  });

  it('should include threshold values in response', async () => {
    const { GET } = await import('@/app/api/health/worker/route');
    const response = await GET();

    const body = await response.json();

    expect(body.checks.stuckJobs.threshold).toBe(10 * 60 * 1000); // 10 minutes in ms
    expect(body.checks.backlog.threshold).toBe(100);
  });
});
