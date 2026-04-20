import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createStreamHandler, POST } from '@/app/api/v1/plans/stream/route';
import { AVAILABLE_MODELS } from '@/features/ai/ai-models';
import { generationAttempts, learningPlans, modules } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
import {
  readStreamingResponse,
  type StreamingEvent,
} from '../../helpers/streaming';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';

const NUMERIC_HEADER_PATTERN = /^\d+$/;
const FREE_QUERY_OVERRIDE_MODEL = AVAILABLE_MODELS.find(
  ({ tier, id }) => tier === 'free' && id !== 'openrouter/free'
)?.id;

if (!FREE_QUERY_OVERRIDE_MODEL) {
  throw new Error('Expected free model fixture for plans stream tests');
}

function assertNumericHeader(response: Response, name: string): void {
  const value = response.headers.get(name);
  expect(value, `Header ${name} should be present`).toBeTruthy();
  expect(value ?? '', `Header ${name} should be numeric`).toMatch(
    NUMERIC_HEADER_PATTERN
  );
}

function expectJsonObject(value: unknown): Record<string, unknown> {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  return value as Record<string, unknown>;
}

async function expectCompletedPlanId(
  events: StreamingEvent[]
): Promise<string> {
  const start = expectPlanStartEvent(events, 1);
  const completeEvent = expectTerminalEventAfterStart(events, 'complete');
  const completeData = expectJsonObject(completeEvent.data);
  expect(completeData.planId).toBe(start.planId);
  await expect(getPlanGenerationStatus(start.planId)).resolves.toBe('ready');
  await expect(listAttempts(start.planId)).resolves.toMatchObject([
    {
      status: 'success',
      classification: null,
    },
  ]);
  return start.planId;
}

function expectPlanStartEvent(
  events: StreamingEvent[],
  expectedAttemptNumber: number
): { planId: string } {
  const startEvent = events.find((event) => event.type === 'plan_start');
  if (!startEvent) {
    throw new Error('Expected plan_start event');
  }

  const startData = expectJsonObject(startEvent.data);
  expect(startData.planId).toEqual(expect.any(String));
  expect(startData.attemptNumber).toBe(expectedAttemptNumber);

  const planId = startData.planId;
  if (typeof planId !== 'string' || planId.length === 0) {
    throw new Error('Expected plan_start event to include a planId');
  }

  return { planId };
}

function expectTerminalEventAfterStart(
  events: StreamingEvent[],
  terminalType: 'complete' | 'error' | 'cancelled'
): StreamingEvent {
  const eventTypes = events.map((event) => event.type);
  const startIndex = eventTypes.indexOf('plan_start');
  const terminalIndex = eventTypes.indexOf(terminalType);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(terminalIndex).toBeGreaterThan(startIndex);
  expect(
    eventTypes
      .slice(0, terminalIndex)
      .filter((type) => ['complete', 'error', 'cancelled'].includes(type))
  ).toEqual([]);

  const terminalEvent = events[terminalIndex];
  if (!terminalEvent) {
    throw new Error(`Expected ${terminalType} event`);
  }

  return terminalEvent;
}

async function listAttempts(planId: string) {
  return db
    .select({
      status: generationAttempts.status,
      classification: generationAttempts.classification,
    })
    .from(generationAttempts)
    .where(eq(generationAttempts.planId, planId))
    .orderBy(desc(generationAttempts.createdAt));
}

async function getPlanGenerationStatus(planId: string) {
  const [plan] = await db
    .select({ generationStatus: learningPlans.generationStatus })
    .from(learningPlans)
    .where(eq(learningPlans.id, planId))
    .limit(1);

  return plan?.generationStatus;
}

// Stubbing env in beforeAll/afterAll is safe: Vitest runs each file in a separate worker,
// so process.env is isolated per file. If the project switches to --pool=threads with
// shared state, these stubs could leak; keep this assumption in mind.
beforeAll(() => {
  vi.stubEnv('AI_PROVIDER', 'mock');
  vi.stubEnv('MOCK_GENERATION_DELAY_MS', '10');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/v1/plans/stream — HTTP preflight + default boundary smoke', () => {
  it('returns 400 with reason details when body is not valid JSON', async () => {
    const authUserId = buildTestAuthUserId('stream-bad-json');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    setTestUser(authUserId);

    const request = new Request('http://localhost/api/v1/plans/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{ not json',
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = expectJsonObject(await response.json());
    expect(body.error).toBe('Invalid request body.');
    expect(body.details).toEqual({
      reason: 'Malformed or invalid JSON payload.',
    });
  });

  it('warns when payload log fails and still returns an error response', async () => {
    const authUserId = buildTestAuthUserId('stream-payload-log-throw');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    setTestUser(authUserId);

    const base = {
      topic: 'Learning TypeScript',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      deadlineDate: '2030-01-01',
      visibility: 'private' as const,
      origin: 'ai' as const,
    };
    const payload = new Proxy(base, {
      get(_, prop) {
        // Promise resolution probes `then`; every other access should fail so
        // the warn-path assertion does not depend on field access order.
        if (prop === 'then') {
          return undefined;
        }
        throw new Error('payload log boom');
      },
    });

    const testLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const post = createStreamHandler({ logger: testLogger });
    const request = new Request('http://localhost/api/v1/plans/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    Object.defineProperty(request, 'json', {
      value: async () => payload,
    });

    const response = await post(request);

    expect(testLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        authUserId,
        error: expect.objectContaining({
          message: 'payload log boom',
        }),
        payload: expect.objectContaining({
          payloadType: 'object',
        }),
      }),
      'Plan stream payload log failed'
    );
    expect(response.status).toBe(400);
  });

  it('streams generation and persists plan data via the default boundary', async () => {
    const authUserId = buildTestAuthUserId('stream-user');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
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

    const rateLimitHeaders = [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ];
    for (const name of rateLimitHeaders) {
      assertNumericHeader(response, name);
    }

    const events = await readStreamingResponse(response);
    const planId = await expectCompletedPlanId(events);
    const attempts = await listAttempts(planId);

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
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      status: 'success',
      classification: null,
    });
  });

  it('accepts valid model override via query param', async () => {
    const authUserId = buildTestAuthUserId('stream-model-override');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    setTestUser(authUserId);

    const payload = {
      topic: 'Learning React',
      skillLevel: 'intermediate',
      weeklyHours: 8,
      learningStyle: 'video',
      deadlineDate: '2030-06-01',
      visibility: 'private',
      origin: 'ai',
    };

    const request = new Request(
      `http://localhost/api/v1/plans/stream?model=${encodeURIComponent(FREE_QUERY_OVERRIDE_MODEL)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(200);

    const events = await readStreamingResponse(response);
    await expectCompletedPlanId(events);
  });

  it('falls back to default model when invalid model override is provided', async () => {
    const authUserId = buildTestAuthUserId('stream-invalid-model');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    setTestUser(authUserId);

    const payload = {
      topic: 'Learning Vue',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      deadlineDate: '2030-03-01',
      visibility: 'private',
      origin: 'ai',
    };

    const request = new Request(
      'http://localhost/api/v1/plans/stream?model=invalid/model-id',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    const response = await POST(request);
    // Should succeed with default model fallback, not error.
    expect(response.status).toBe(200);

    const events = await readStreamingResponse(response);
    await expectCompletedPlanId(events);
  });
});
