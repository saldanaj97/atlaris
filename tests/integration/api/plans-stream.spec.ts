import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST } from '@/app/api/v1/plans/stream/route';
import { learningPlans, modules } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';

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
    const clerkUserId = `stream-user-${Date.now()}`;
    await ensureUser({
      clerkUserId,
      email: `${clerkUserId}@example.com`,
    });
    setTestUser(clerkUserId);

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

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    if (!reader) {
      throw new Error('Expected streaming response body');
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
    }

    const events = buffer
      .split('\n')
      .map((line) => line.replace(/^data:\s*/, '').trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Array<{
      type: string;
      data?: Record<string, unknown>;
    }>;

    const completeEvent = events.find((event) => event?.type === 'complete');
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

  it('accepts valid model override via query param', async () => {
    const clerkUserId = `stream-model-override-${Date.now()}`;
    await ensureUser({
      clerkUserId,
      email: `${clerkUserId}@example.com`,
    });
    setTestUser(clerkUserId);

    const payload = {
      topic: 'Learning React',
      skillLevel: 'intermediate',
      weeklyHours: 8,
      learningStyle: 'video',
      deadlineDate: '2030-06-01',
      visibility: 'private',
    };

    // Use a valid model override in the query param
    const request = new Request(
      'http://localhost/api/v1/plans/stream?model=google/gemini-2.0-flash-exp:free',
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

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    if (!reader) {
      throw new Error('Expected streaming response body');
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
    }

    const events = buffer
      .split('\n')
      .map((line) => line.replace(/^data:\s*/, '').trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Array<{
      type: string;
      data?: Record<string, unknown>;
    }>;

    const completeEvent = events.find((event) => event?.type === 'complete');
    expect(completeEvent?.data?.planId).toBeTruthy();
  });

  it('falls back to default model when invalid model override is provided', async () => {
    const clerkUserId = `stream-invalid-model-${Date.now()}`;
    await ensureUser({
      clerkUserId,
      email: `${clerkUserId}@example.com`,
    });
    setTestUser(clerkUserId);

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

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    if (!reader) {
      throw new Error('Expected streaming response body');
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
    }

    const events = buffer
      .split('\n')
      .map((line) => line.replace(/^data:\s*/, '').trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Array<{
      type: string;
      data?: Record<string, unknown>;
    }>;

    const completeEvent = events.find((event) => event?.type === 'complete');
    expect(completeEvent?.data?.planId).toBeTruthy();
  });

  it('works without model param (uses default)', async () => {
    const clerkUserId = `stream-no-model-${Date.now()}`;
    await ensureUser({
      clerkUserId,
      email: `${clerkUserId}@example.com`,
    });
    setTestUser(clerkUserId);

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

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    if (!reader) {
      throw new Error('Expected streaming response body');
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
    }

    const events = buffer
      .split('\n')
      .map((line) => line.replace(/^data:\s*/, '').trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Array<{
      type: string;
      data?: Record<string, unknown>;
    }>;

    const completeEvent = events.find((event) => event?.type === 'complete');
    expect(completeEvent?.data?.planId).toBeTruthy();
  });
});
