import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/v1/plans/stream/route';
import { learningPlans, modules } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';
import {
  readStreamingResponse,
  type StreamingEvent,
} from '../../helpers/streaming';

const ORIGINAL_ENV = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  MOCK_GENERATION_DELAY_MS: process.env.MOCK_GENERATION_DELAY_MS,
};

beforeAll(() => {
  process.env.AI_PROVIDER = 'mock';
  process.env.MOCK_GENERATION_DELAY_MS = '10';
});

afterAll(() => {
  process.env.AI_PROVIDER = ORIGINAL_ENV.AI_PROVIDER;
  process.env.MOCK_GENERATION_DELAY_MS = ORIGINAL_ENV.MOCK_GENERATION_DELAY_MS;
});

describe('POST /api/v1/plans/stream', () => {
  it('streams generation and persists plan data', async () => {
    const authUserId = buildTestAuthUserId('stream-user');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    setTestUser(authUserId);

    const payload = {
      topic: 'Learning TypeScript',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      deadlineDate: '2030-01-01',
      visibility: 'private',
      origin: 'ai',
    };

    const request = new Request('http://localhost/api/v1/plans/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const events = await readStreamingResponse(response);
    const completeEvent = events.find((event) => event.type === 'complete');
    expect(completeEvent?.data?.planId).toBeTruthy();
    const planId = completeEvent?.data?.planId as string;

    const [plan] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, planId))
      .limit(1);

    expect(plan?.generationStatus).toBe('ready');
    expect(plan?.isQuotaEligible).toBe(true);

    const moduleRows = await db
      .select()
      .from(modules)
      .where(eq(modules.planId, planId));

    expect(moduleRows.length).toBeGreaterThan(0);
  });

  it('marks plan failed on generation error', async () => {
    const authUserId = buildTestAuthUserId('stream-failure');
    await ensureUser({ authUserId, email: buildTestEmail(authUserId) });
    setTestUser(authUserId);

    // Mock the orchestrator to throw during generation
    const orchestrator = await import('@/lib/ai/orchestrator');
    vi.spyOn(orchestrator, 'runGenerationAttempt').mockImplementation(
      async () => {
        throw new Error('boom');
      }
    );

    const payload = {
      topic: 'Failing Plan',
      skillLevel: 'beginner',
      weeklyHours: 1,
      learningStyle: 'mixed',
      deadlineDate: '2030-01-01',
      visibility: 'private',
      origin: 'ai',
    };

    const request = new Request('http://localhost/api/v1/plans/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    let events: StreamingEvent[] = [];
    try {
      events = await readStreamingResponse(response);
    } catch {
      // Stream may error after marking failure; swallow the stream error
    } finally {
      vi.restoreAllMocks();
    }

    const startEvent = events.find((e) => e.type === 'plan_start');
    expect(startEvent?.data?.planId).toBeTruthy();
    const planId = startEvent?.data?.planId as string;

    const [plan] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, planId))
      .limit(1);

    expect(plan?.generationStatus).toBe('failed');
  });

  it('accepts valid model override via query param', async () => {
    const authUserId = buildTestAuthUserId('stream-model-override');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    setTestUser(authUserId);

    const payload = {
      topic: 'Learning React',
      skillLevel: 'intermediate',
      weeklyHours: 8,
      learningStyle: 'video',
      deadlineDate: '2030-06-01',
      visibility: 'private',
    };

    // Use a different valid model to verify override is working
    // (using a model different from the default AI_DEFAULT_MODEL)
    const request = new Request(
      'http://localhost/api/v1/plans/stream?model=openai/gpt-oss-20b:free',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(200);

    const events = await readStreamingResponse(response);
    const completeEvent = events.find((event) => event.type === 'complete');
    expect(completeEvent?.data?.planId).toBeTruthy();
  });

  it('falls back to default model when invalid model override is provided', async () => {
    const authUserId = buildTestAuthUserId('stream-invalid-model');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    setTestUser(authUserId);

    const payload = {
      topic: 'Learning Vue',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      deadlineDate: '2030-03-01',
      visibility: 'private',
    };

    // Use an invalid model override - should fall back to default
    const request = new Request(
      'http://localhost/api/v1/plans/stream?model=invalid/model-id',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const response = await POST(request);
    // Should succeed with default model fallback, not error
    expect(response.status).toBe(200);

    const events = await readStreamingResponse(response);
    const completeEvent = events.find((event) => event.type === 'complete');
    expect(completeEvent?.data?.planId).toBeTruthy();
  });

  it('works without model param (uses default)', async () => {
    const authUserId = buildTestAuthUserId('stream-no-model');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    setTestUser(authUserId);

    const payload = {
      topic: 'Learning Python',
      skillLevel: 'advanced',
      weeklyHours: 10,
      learningStyle: 'practice',
      deadlineDate: '2030-12-01',
      visibility: 'private',
    };

    // No model param - should use default
    const request = new Request('http://localhost/api/v1/plans/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const events = await readStreamingResponse(response);
    const completeEvent = events.find((event) => event.type === 'complete');
    expect(completeEvent?.data?.planId).toBeTruthy();
  });
});
