import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { GET as GET_STATUS } from '@/app/api/v1/plans/[planId]/status/route';
import { POST } from '@/app/api/v1/plans/route';
import {
  generationAttempts,
  jobQueue,
  learningPlans,
  modules,
} from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';

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
  const authUserId = buildTestAuthUserId('phase4-user');
  const authEmail = buildTestEmail(authUserId);

  afterEach(async () => {
    // Clean up test data (order matters due to foreign key constraints)
    await db.delete(generationAttempts);
    await db.delete(modules);
    await db.delete(jobQueue);
    await db.delete(learningPlans);
  });

  describe('T040: Plan creation creates plan record', () => {
    it('POST /api/v1/plans returns 201 with status generating and creates plan record', async () => {
      setTestUser(authUserId);
      await ensureUser({ authUserId, email: authEmail });

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
        status: 'generating',
      });
      expect(payload).toHaveProperty('id');

      // Verify a plan was created in the database
      const plan = await db.query.learningPlans.findFirst({
        where: (fields, operators) => operators.eq(fields.id, payload.id),
      });

      expect(plan).toBeDefined();
      expect(plan!.topic).toBe('Applied Machine Learning');
      expect(plan!.skillLevel).toBe('intermediate');
      expect(plan!.generationStatus).toBe('generating');
    });
  });

  describe('T041: Status endpoint state transition test', () => {
    it('maps generationStatus to plan status correctly: generating -> ready', async () => {
      setTestUser(authUserId);
      const userId = await ensureUser({ authUserId, email: authEmail });

      // Create a plan with default generationStatus (generating)
      // Note: The API maps 'generating' -> 'processing' for the frontend
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
          generationStatus: 'generating',
        })
        .returning();

      // Test processing status (generationStatus = 'generating' maps to 'processing')
      let statusRequest = await createStatusRequest(plan.id);
      let statusResponse = await GET_STATUS(statusRequest);
      expect(statusResponse.status).toBe(200);
      let statusPayload = await statusResponse.json();
      expect(statusPayload.status).toBe('processing');
      expect(statusPayload.planId).toBe(plan.id);

      // Complete generation: set generationStatus to ready and add modules
      await db
        .update(learningPlans)
        .set({ generationStatus: 'ready' })
        .where(eq(learningPlans.id, plan.id));

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
      setTestUser(authUserId);
      const userId = await ensureUser({ authUserId, email: authEmail });

      // Create a plan with failed status
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
          generationStatus: 'failed',
        })
        .returning();

      // Create a generation attempt with error classification
      await db.insert(generationAttempts).values({
        planId: plan.id,
        status: 'failure',
        classification: 'timeout',
        durationMs: 5000,
        modulesCount: 0,
        tasksCount: 0,
      });

      // Test failed status
      const statusRequest = await createStatusRequest(plan.id);
      const statusResponse = await GET_STATUS(statusRequest);
      const statusPayload = await statusResponse.json();
      expect(statusPayload.status).toBe('failed');
      expect(statusPayload.latestError).toBe(
        'Generation timed out. Please try again.'
      );
    });
  });

  describe('T042: Rate limit exceeded test', () => {
    it('returns 429 with retryAfter when rate limit is exceeded', async () => {
      setTestUser(authUserId);
      const userId = await ensureUser({ authUserId, email: authEmail });

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
      setTestUser(authUserId);
      await ensureUser({ authUserId, email: authEmail });

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
      setTestUser(authUserId);
      await ensureUser({ authUserId, email: authEmail });

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
