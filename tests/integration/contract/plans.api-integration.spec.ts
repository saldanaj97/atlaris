import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { GET as GET_STATUS } from '@/app/api/v1/plans/[planId]/status/route';
import { POST } from '@/app/api/v1/plans/route';
import { db } from '@/lib/db/service-role';
import { jobQueue, learningPlans, modules } from '@/lib/db/schema';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';

const BASE_URL = 'http://localhost/api/v1/plans';

async function createPlanRequest(body: unknown) {
  return new Request(BASE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function createStatusRequest(planId: string) {
  return new Request(`${BASE_URL}/${planId}/status`, {
    method: 'GET',
    headers: { 'content-type': 'application/json' },
  });
}

describe('Phase 4: API Integration', () => {
  const clerkUserId = 'clerk_phase4_user';
  const clerkEmail = 'phase4-test@example.com';

  afterEach(async () => {
    // Clean up test data
    await db.delete(jobQueue);
    await db.delete(learningPlans);
  });

  describe('T040: Plan creation enqueues job test', () => {
    it('POST /api/v1/plans returns 201 with status pending and a job row exists with matching planId', async () => {
      setTestUser(clerkUserId);
      const userId = await ensureUser({ clerkUserId, email: clerkEmail });

      const request = await createPlanRequest({
        topic: 'Applied Machine Learning',
        skillLevel: 'intermediate',
        weeklyHours: 6,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
        notes: 'Focus on notebooks and end-to-end projects.',
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const payload = await response.json();
      expect(payload).toMatchObject({
        topic: 'Applied Machine Learning',
        skillLevel: 'intermediate',
        status: 'pending',
      });
      expect(payload).toHaveProperty('id');

      // Verify a job was created
      const jobs = await db.query.jobQueue.findMany({
        where: (fields, operators) => operators.eq(fields.planId, payload.id),
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        planId: payload.id,
        userId,
        jobType: 'plan_generation',
        status: 'pending',
      });
    });
  });

  describe('T041: Status endpoint state transition test', () => {
    it('maps job status to plan status correctly: pending -> processing -> ready', async () => {
      setTestUser(clerkUserId);
      const userId = await ensureUser({ clerkUserId, email: clerkEmail });

      // Create a plan
      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId,
          topic: 'Status Test Plan',
          skillLevel: 'beginner',
          weeklyHours: 4,
          learningStyle: 'reading',
          visibility: 'private',
          origin: 'ai',
        })
        .returning();

      // Create a pending job
      const [job] = await db
        .insert(jobQueue)
        .values({
          planId: plan.id,
          userId,
          jobType: 'plan_generation',
          status: 'pending',
          payload: {
            topic: 'Status Test Plan',
            notes: null,
            skillLevel: 'beginner',
            weeklyHours: 4,
            learningStyle: 'reading',
          },
        })
        .returning();

      // Test pending status
      let statusRequest = await createStatusRequest(plan.id);
      let statusResponse = await GET_STATUS(statusRequest);
      expect(statusResponse.status).toBe(200);
      let statusPayload = await statusResponse.json();
      expect(statusPayload.status).toBe('pending');
      expect(statusPayload.planId).toBe(plan.id);

      // Update job to processing
      await db
        .update(jobQueue)
        .set({ status: 'processing', startedAt: new Date() })
        .where(eq(jobQueue.id, job.id));

      // Test processing status
      statusRequest = await createStatusRequest(plan.id);
      statusResponse = await GET_STATUS(statusRequest);
      statusPayload = await statusResponse.json();
      expect(statusPayload.status).toBe('processing');

      // Complete job and add modules
      await db
        .update(jobQueue)
        .set({ status: 'completed', completedAt: new Date() })
        .where(eq(jobQueue.id, job.id));

      await db.insert(modules).values({
        planId: plan.id,
        order: 1,
        title: 'Module 1',
        description: 'First module',
        estimatedMinutes: 120,
      });

      // Test ready status
      statusRequest = await createStatusRequest(plan.id);
      statusResponse = await GET_STATUS(statusRequest);
      statusPayload = await statusResponse.json();
      expect(statusPayload.status).toBe('ready');
    });

    it('maps failed job status correctly', async () => {
      setTestUser(clerkUserId);
      const userId = await ensureUser({ clerkUserId, email: clerkEmail });

      // Create a plan
      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId,
          topic: 'Failed Plan',
          skillLevel: 'beginner',
          weeklyHours: 4,
          learningStyle: 'reading',
          visibility: 'private',
          origin: 'ai',
        })
        .returning();

      // Create a failed job
      await db.insert(jobQueue).values({
        planId: plan.id,
        userId,
        jobType: 'plan_generation',
        status: 'failed',
        error: 'Test error',
        payload: {
          topic: 'Failed Plan',
          notes: null,
          skillLevel: 'beginner',
          weeklyHours: 4,
          learningStyle: 'reading',
        },
      });

      // Test failed status
      const statusRequest = await createStatusRequest(plan.id);
      const statusResponse = await GET_STATUS(statusRequest);
      const statusPayload = await statusResponse.json();
      expect(statusPayload.status).toBe('failed');
      expect(statusPayload.latestJobError).toBe('Test error');
    });
  });

  describe('T042: Rate limit exceeded test', () => {
    it('returns 429 with retryAfter when rate limit is exceeded', async () => {
      setTestUser(clerkUserId);
      const userId = await ensureUser({ clerkUserId, email: clerkEmail });

      // Create 10 jobs (the limit) within the time window
      const jobPromises = [];
      for (let i = 0; i < 10; i++) {
        const [plan] = await db
          .insert(learningPlans)
          .values({
            userId,
            topic: `Plan ${i}`,
            skillLevel: 'beginner',
            weeklyHours: 4,
            learningStyle: 'reading',
            visibility: 'private',
            origin: 'ai',
          })
          .returning();

        jobPromises.push(
          db.insert(jobQueue).values({
            planId: plan.id,
            userId,
            jobType: 'plan_generation',
            status: 'pending',
            payload: {
              topic: `Plan ${i}`,
              notes: null,
              skillLevel: 'beginner',
              weeklyHours: 4,
              learningStyle: 'reading',
            },
          })
        );
      }
      await Promise.all(jobPromises);

      // Try to create one more plan (should exceed rate limit)
      const request = await createPlanRequest({
        topic: 'Rate Limited Plan',
        skillLevel: 'beginner',
        weeklyHours: 2,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
      });

      const response = await POST(request);
      expect(response.status).toBe(429);

      const payload = await response.json();
      expect(payload).toHaveProperty('error');
      expect(payload).toHaveProperty('retryAfter');
      expect(payload.code).toBe('RATE_LIMITED');
      expect(typeof payload.retryAfter).toBe('number');
    });
  });

  describe('T043: Malformed plan creation input test', () => {
    it('returns validation error for invalid skillLevel without inserting job', async () => {
      setTestUser(clerkUserId);
      await ensureUser({ clerkUserId, email: clerkEmail });

      const initialJobCount = await db.query.jobQueue.findMany();

      const request = await createPlanRequest({
        topic: 'Invalid Plan',
        skillLevel: 'invalid_level', // Invalid value
        weeklyHours: 4,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const payload = await response.json();
      expect(payload).toHaveProperty('error');
      expect(payload.code).toBe('VALIDATION_ERROR');

      // Verify no job was created
      const finalJobCount = await db.query.jobQueue.findMany();
      expect(finalJobCount.length).toBe(initialJobCount.length);
    });

    it('returns validation error for missing topic without inserting job', async () => {
      setTestUser(clerkUserId);
      await ensureUser({ clerkUserId, email: clerkEmail });

      const initialJobCount = await db.query.jobQueue.findMany();

      const request = await createPlanRequest({
        // topic is missing
        skillLevel: 'beginner',
        weeklyHours: 4,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const payload = await response.json();
      expect(payload).toHaveProperty('error');
      expect(payload.code).toBe('VALIDATION_ERROR');

      // Verify no job was created
      const finalJobCount = await db.query.jobQueue.findMany();
      expect(finalJobCount.length).toBe(initialJobCount.length);
    });
  });
});
