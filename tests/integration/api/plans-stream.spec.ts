import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';

import { POST } from '@/app/api/v1/plans/stream/route';
import { db } from '@/lib/db/service-role';
import { learningPlans, modules } from '@/lib/db/schema';

import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';

const ORIGINAL_ENV = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  MOCK_GENERATION_DELAY_MS: process.env.MOCK_GENERATION_DELAY_MS,
  ENABLE_STREAMING_GENERATION: process.env.ENABLE_STREAMING_GENERATION,
  DEV_CLERK_USER_ID: process.env.DEV_CLERK_USER_ID,
};

beforeAll(() => {
  process.env.AI_PROVIDER = 'mock';
  process.env.MOCK_GENERATION_DELAY_MS = '10';
  process.env.ENABLE_STREAMING_GENERATION = '1';
});

afterAll(() => {
  process.env.AI_PROVIDER = ORIGINAL_ENV.AI_PROVIDER;
  process.env.MOCK_GENERATION_DELAY_MS = ORIGINAL_ENV.MOCK_GENERATION_DELAY_MS;
  process.env.ENABLE_STREAMING_GENERATION =
    ORIGINAL_ENV.ENABLE_STREAMING_GENERATION;
  process.env.DEV_CLERK_USER_ID = ORIGINAL_ENV.DEV_CLERK_USER_ID;
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
});
