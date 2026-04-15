import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createStreamHandler, POST } from '@/app/api/v1/plans/stream/route';
import { AVAILABLE_MODELS } from '@/features/ai/ai-models';
import { parsePersistedPdfContext } from '@/features/pdf/context';
import {
  computePdfExtractionHash,
  issuePdfExtractionProof,
} from '@/features/pdf/security/pdf-extraction-proof';
import type {
  GenerationAttemptResult,
  ProcessGenerationInput,
} from '@/features/plans/lifecycle';
import type { PreferredAiModel } from '@/lib/db/enums';
import {
  generationAttempts,
  learningPlans,
  modules,
  users,
} from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import {
  createPdfProof,
  DEFAULT_PDF_PROOF_VERSION,
} from '../../fixtures/validation';
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
const PRO_TIER_MODEL = AVAILABLE_MODELS.find(({ tier }) => tier === 'pro')?.id;

if (!FREE_QUERY_OVERRIDE_MODEL || !PRO_TIER_MODEL) {
  throw new Error(
    'Expected free and pro model fixtures for plans stream tests'
  );
}

const STREAM_MOCK_SUCCESS: GenerationAttemptResult = {
  status: 'generation_success',
  data: {
    modules: [
      {
        title: 'Captured Module',
        estimatedMinutes: 60,
        tasks: [{ title: 'T', estimatedMinutes: 30 }],
      },
    ],
    metadata: {
      provider: 'mock',
      model: 'mock-model',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    },
    durationMs: 5,
  },
};

function createCapturingHandler(): {
  post: ReturnType<typeof createStreamHandler>;
  captured: ProcessGenerationInput[];
} {
  const captured: ProcessGenerationInput[] = [];
  const post = createStreamHandler({
    overrides: {
      processGenerationAttempt: async (input: ProcessGenerationInput) => {
        captured.push(input);
        return STREAM_MOCK_SUCCESS;
      },
    },
  });
  return { post, captured };
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

function expectNoTerminalEvent(events: StreamingEvent[]): void {
  expect(
    events.some((event) =>
      ['complete', 'error', 'cancelled'].includes(event.type)
    )
  ).toBe(false);
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

describe('POST /api/v1/plans/stream', () => {
  it('streams generation and persists plan data', async () => {
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

  it('emits fallback error and preserves reserved attempt on unexpected generation errors', async () => {
    const authUserId = buildTestAuthUserId('stream-failure');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    setTestUser(authUserId);

    const postWithFailingGeneration = createStreamHandler({
      overrides: {
        processGenerationAttempt: async (input: ProcessGenerationInput) => {
          await db.insert(generationAttempts).values({
            planId: input.planId,
            status: 'in_progress',
            classification: null,
            durationMs: 0,
            modulesCount: 0,
            tasksCount: 0,
            promptHash: 'stream-unhandled-exception',
          });
          throw new Error('boom');
        },
      },
    });

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

    const response = await postWithFailingGeneration(request);
    expect(response.status).toBe(200);

    const events: StreamingEvent[] = await readStreamingResponse(response);
    const { planId } = expectPlanStartEvent(events, 1);
    const errorEvent = expectTerminalEventAfterStart(events, 'error');
    expect(errorEvent.data).toMatchObject({
      code: 'GENERATION_FAILED',
      classification: 'provider_error',
      retryable: true,
    });
    const attempts = await listAttempts(planId);

    const [plan] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, planId))
      .limit(1);

    expect(plan?.generationStatus).toBe('failed');
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      status: 'in_progress',
      classification: null,
    });
  });

  it('returns sanitized SSE error payloads to clients on generation failure', async () => {
    const authUserId = buildTestAuthUserId('stream-sanitized-error');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    setTestUser(authUserId);
    const mockedFailure: GenerationAttemptResult = {
      status: 'retryable_failure',
      classification: 'provider_error',
      error: new Error(
        'OpenRouter upstream failure: api_key=sk-live-secret-value'
      ),
    };

    const postWithMockedFailure = createStreamHandler({
      overrides: {
        processGenerationAttempt: async () => mockedFailure,
      },
    });

    const payload = {
      topic: 'Sanitized Failure Plan',
      skillLevel: 'beginner',
      weeklyHours: 2,
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

    const response = await postWithMockedFailure(request);
    expect(response.status).toBe(200);

    const events = await readStreamingResponse(response);
    expectPlanStartEvent(events, 1);
    const errorEvent = expectTerminalEventAfterStart(events, 'error');

    const errorData = expectJsonObject(errorEvent.data);
    expect(errorData).toMatchObject({
      code: 'GENERATION_FAILED',
      message: 'Plan generation encountered an error. Please try again.',
      classification: 'provider_error',
      retryable: true,
    });
    expect(errorData.requestId).toEqual(expect.any(String));
    const errorMessage =
      typeof errorData.message === 'string' ? errorData.message : '';
    expect(errorMessage).not.toContain('api_key');
    expect(errorMessage).not.toContain('sk-live-secret-value');
  });

  it('emits permanent failure parity for validation-classified stream failures', async () => {
    const authUserId = buildTestAuthUserId('stream-permanent-failure');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    setTestUser(authUserId);

    const postWithPermanentFailure = createStreamHandler({
      overrides: {
        processGenerationAttempt: async () => ({
          status: 'permanent_failure',
          classification: 'validation',
          error: new Error('invalid generated payload'),
        }),
      },
    });

    const request = new Request('http://localhost/api/v1/plans/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'Permanent Failure Plan',
        skillLevel: 'beginner',
        weeklyHours: 2,
        learningStyle: 'mixed',
        deadlineDate: '2030-01-01',
        visibility: 'private',
        origin: 'ai',
      }),
    });

    const response = await postWithPermanentFailure(request);
    expect(response.status).toBe(200);

    const events = await readStreamingResponse(response);
    expectPlanStartEvent(events, 1);
    const errorEvent = expectTerminalEventAfterStart(events, 'error');
    expect(errorEvent.data).toMatchObject({
      code: 'INVALID_OUTPUT',
      classification: 'validation',
      retryable: false,
    });
  });

  it('suppresses terminal SSE events on client cancellation but still marks the plan failed', async () => {
    const authUserId = buildTestAuthUserId('stream-cancelled');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    setTestUser(authUserId);

    const controller = new AbortController();
    const postWithCancellation = createStreamHandler({
      overrides: {
        processGenerationAttempt: async (input: ProcessGenerationInput) => {
          await db.insert(generationAttempts).values({
            planId: input.planId,
            status: 'in_progress',
            classification: null,
            durationMs: 0,
            modulesCount: 0,
            tasksCount: 0,
            promptHash: 'stream-cancelled-attempt',
          });
          controller.abort();
          throw new DOMException('Client disconnected', 'AbortError');
        },
      },
    });

    const request = new Request('http://localhost/api/v1/plans/stream', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'Cancelled Plan',
        skillLevel: 'beginner',
        weeklyHours: 2,
        learningStyle: 'mixed',
        deadlineDate: '2030-01-01',
        visibility: 'private',
        origin: 'ai',
      }),
    });

    const response = await postWithCancellation(request);
    expect(response.status).toBe(200);

    const events = await readStreamingResponse(response);
    const { planId } = expectPlanStartEvent(events, 1);
    expectNoTerminalEvent(events);

    const [plan] = await db
      .select({
        generationStatus: learningPlans.generationStatus,
      })
      .from(learningPlans)
      .where(eq(learningPlans.id, planId))
      .limit(1);

    const attempts = await listAttempts(planId);
    expect(plan?.generationStatus).toBe('failed');
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      status: 'in_progress',
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

    // Use a different valid model to verify override is working
    // (using a model different from the default AI_DEFAULT_MODEL)
    const request = new Request(
      `http://localhost/api/v1/plans/stream?model=${encodeURIComponent(FREE_QUERY_OVERRIDE_MODEL)}`,
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
    await expectCompletedPlanId(events);
  });

  it('works without model param (uses default)', async () => {
    const authUserId = buildTestAuthUserId('stream-no-model');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    setTestUser(authUserId);

    const payload = {
      topic: 'Learning Python',
      skillLevel: 'advanced',
      weeklyHours: 10,
      learningStyle: 'practice',
      deadlineDate: '2030-12-01',
      visibility: 'private',
      origin: 'ai',
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
    await expectCompletedPlanId(events);
  });

  it('uses tier default when DB has no saved preference', async () => {
    const authUserId = buildTestAuthUserId('stream-db-null-pref');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    setTestUser(authUserId);

    await db
      .update(users)
      .set({ preferredAiModel: null })
      .where(eq(users.authUserId, authUserId));

    const { post, captured } = createCapturingHandler();

    const payload = {
      topic: 'Learning Python',
      skillLevel: 'advanced',
      weeklyHours: 10,
      learningStyle: 'practice',
      deadlineDate: '2030-12-01',
      visibility: 'private',
      origin: 'ai',
    };

    const request = new Request('http://localhost/api/v1/plans/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const response = await post(request);
    expect(response.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.modelOverride).toBeUndefined();
  });

  it('passes saved preferred model when no query param', async () => {
    const authUserId = buildTestAuthUserId('stream-saved-pref');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    setTestUser(authUserId);

    await db
      .update(users)
      .set({ preferredAiModel: FREE_QUERY_OVERRIDE_MODEL as PreferredAiModel })
      .where(eq(users.authUserId, authUserId));

    const { post, captured } = createCapturingHandler();

    const payload = {
      topic: 'Learning Python',
      skillLevel: 'advanced',
      weeklyHours: 10,
      learningStyle: 'practice',
      deadlineDate: '2030-12-01',
      visibility: 'private',
      origin: 'ai',
    };

    const request = new Request('http://localhost/api/v1/plans/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const response = await post(request);
    expect(response.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.modelOverride).toBe(FREE_QUERY_OVERRIDE_MODEL);
  });

  it('query model override beats saved preference', async () => {
    const authUserId = buildTestAuthUserId('stream-query-beats-saved');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    setTestUser(authUserId);

    await db
      .update(users)
      .set({ preferredAiModel: FREE_QUERY_OVERRIDE_MODEL as PreferredAiModel })
      .where(eq(users.authUserId, authUserId));

    const { post, captured } = createCapturingHandler();

    const payload = {
      topic: 'Learning Rust',
      skillLevel: 'beginner',
      weeklyHours: 4,
      learningStyle: 'reading',
      deadlineDate: '2030-08-01',
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

    const response = await post(request);
    expect(response.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.modelOverride).toBe(FREE_QUERY_OVERRIDE_MODEL);
  });

  it('ignores invalid query param and uses saved preference', async () => {
    const authUserId = buildTestAuthUserId('stream-invalid-query-saved');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    setTestUser(authUserId);

    await db
      .update(users)
      .set({ preferredAiModel: FREE_QUERY_OVERRIDE_MODEL as PreferredAiModel })
      .where(eq(users.authUserId, authUserId));

    const { post, captured } = createCapturingHandler();

    const payload = {
      topic: 'Learning Go',
      skillLevel: 'intermediate',
      weeklyHours: 6,
      learningStyle: 'mixed',
      deadlineDate: '2030-09-01',
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

    const response = await post(request);
    expect(response.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.modelOverride).toBe(FREE_QUERY_OVERRIDE_MODEL);
  });

  it('ignores tier-invalid saved preference and uses tier default', async () => {
    const authUserId = buildTestAuthUserId('stream-tier-invalid-saved');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    setTestUser(authUserId);

    await db
      .update(users)
      .set({
        preferredAiModel: PRO_TIER_MODEL as PreferredAiModel,
      })
      .where(eq(users.authUserId, authUserId));

    const { post, captured } = createCapturingHandler();

    const withinFreeTierWeeks = new Date();
    withinFreeTierWeeks.setUTCDate(withinFreeTierWeeks.getUTCDate() + 10);
    const deadlineDate = withinFreeTierWeeks.toISOString().slice(0, 10);

    const payload = {
      topic: 'Learning Kotlin',
      skillLevel: 'beginner',
      weeklyHours: 3,
      learningStyle: 'video',
      deadlineDate,
      visibility: 'private',
      origin: 'ai',
    };

    const request = new Request('http://localhost/api/v1/plans/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const response = await post(request);
    expect(response.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.modelOverride).toBeUndefined();
  });

  it('rejects PDF-origin stream request with forged extraction hash', async () => {
    const authUserId = buildTestAuthUserId('stream-pdf-forged-hash');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    setTestUser(authUserId);

    const extractedContent = {
      mainTopic: 'TypeScript from PDF',
      sections: [
        {
          title: 'Intro',
          content: 'Basics and setup',
          level: 1,
        },
      ],
    };

    const validHash = computePdfExtractionHash(extractedContent);
    const { token } = await issuePdfExtractionProof({
      authUserId,
      extractionHash: validHash,
      dbClient: db,
    });

    const forgedHash =
      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

    const payload = {
      origin: 'pdf',
      extractedContent,
      pdfProofToken: token,
      pdfExtractionHash: forgedHash,
      pdfProofVersion: 1,
      topic: extractedContent.mainTopic,
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      deadlineDate: '2030-01-01',
      visibility: 'private',
    };

    const request = new Request('http://localhost/api/v1/plans/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    const body = expectJsonObject(await response.json());
    expect(body.error).toBe('Invalid or expired PDF extraction proof.');
  });

  it('rejects replayed PDF extraction proof token', async () => {
    const authUserId = buildTestAuthUserId('stream-pdf-replay');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    setTestUser(authUserId);

    const extractedContent = {
      mainTopic: 'React from PDF',
      sections: [
        {
          title: 'Foundations',
          content: 'Components and props',
          level: 1,
        },
      ],
    };

    const extractionHash = computePdfExtractionHash(extractedContent);
    const { token } = await issuePdfExtractionProof({
      authUserId,
      extractionHash,
      dbClient: db,
    });

    const payload = {
      origin: 'pdf',
      extractedContent,
      pdfProofToken: token,
      pdfExtractionHash: extractionHash,
      pdfProofVersion: 1,
      topic: extractedContent.mainTopic,
      skillLevel: 'beginner',
      weeklyHours: 4,
      learningStyle: 'mixed',
      deadlineDate: '2030-02-01',
      visibility: 'private',
    };

    const firstRequest = new Request('http://localhost/api/v1/plans/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const firstResponse = await POST(firstRequest);
    expect(firstResponse.status).toBe(200);
    // Drain firstResponse stream intentionally before replay test (from POST(firstRequest) above).
    // readStreamingResponse(firstResponse) ensures the server connection/state is settled before we
    // attempt the replay POST; the discarded result is deliberate.
    await readStreamingResponse(firstResponse);

    const replayRequest = new Request('http://localhost/api/v1/plans/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const replayResponse = await POST(replayRequest);
    expect(replayResponse.status).toBe(403);
    const body = expectJsonObject(await replayResponse.json());
    expect(body.error).toBe('Invalid or expired PDF extraction proof.');
  });

  it('rejects PDF proof token issued for a different user', async () => {
    const ownerAuthUserId = buildTestAuthUserId('stream-pdf-owner');
    const attackerAuthUserId = buildTestAuthUserId('stream-pdf-attacker');
    await ensureUser({
      authUserId: ownerAuthUserId,
      email: buildTestEmail(ownerAuthUserId),
      subscriptionTier: 'pro',
    });
    await ensureUser({
      authUserId: attackerAuthUserId,
      email: buildTestEmail(attackerAuthUserId),
      subscriptionTier: 'pro',
    });

    const extractedContent = {
      mainTopic: 'Python from PDF',
      sections: [
        {
          title: 'Basics',
          content: 'Variables and loops',
          level: 1,
        },
      ],
    };

    const extractionHash = computePdfExtractionHash(extractedContent);
    const { token } = await issuePdfExtractionProof({
      authUserId: ownerAuthUserId,
      extractionHash,
      dbClient: db,
    });

    setTestUser(attackerAuthUserId);
    const pdfProof = createPdfProof({
      pdfProofToken: token,
      pdfExtractionHash: extractionHash,
    });
    const payload = {
      origin: 'pdf',
      extractedContent,
      ...pdfProof,
      topic: extractedContent.mainTopic,
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      deadlineDate: '2030-01-01',
      visibility: 'private',
    };

    const request = new Request('http://localhost/api/v1/plans/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    const body = expectJsonObject(await response.json());
    expect(body.error).toBe('Invalid or expired PDF extraction proof.');
  });

  it('rejects expired PDF proof token', async () => {
    const authUserId = buildTestAuthUserId('stream-pdf-expired');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    setTestUser(authUserId);

    const extractedContent = {
      mainTopic: 'Rust from PDF',
      sections: [
        {
          title: 'Ownership',
          content: 'Borrow checker fundamentals',
          level: 1,
        },
      ],
    };

    const extractionHash = computePdfExtractionHash(extractedContent);
    const { token } = await issuePdfExtractionProof({
      authUserId,
      extractionHash,
      dbClient: db,
      now: () => new Date(0),
    });

    const pdfProof = createPdfProof({
      pdfProofToken: token,
      pdfExtractionHash: extractionHash,
    });
    const payload = {
      origin: 'pdf',
      extractedContent,
      ...pdfProof,
      topic: extractedContent.mainTopic,
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      deadlineDate: '2030-01-01',
      visibility: 'private',
    };

    const request = new Request('http://localhost/api/v1/plans/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    const body = expectJsonObject(await response.json());
    expect(body.error).toBe('Invalid or expired PDF extraction proof.');
  });

  it('persists PDF context and forwards it to generation input', async () => {
    const authUserId = buildTestAuthUserId('stream-pdf-context');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    setTestUser(authUserId);

    const extractedContent = {
      mainTopic: 'TypeScript from PDF context',
      sections: [
        {
          title: 'Core concepts',
          content: `${'x'.repeat(3_000)}TAIL_MARKER`,
          level: 1,
          suggestedTopic: 'Type system',
        },
      ],
    };

    const extractionHash = computePdfExtractionHash(extractedContent);
    const { token } = await issuePdfExtractionProof({
      authUserId,
      extractionHash,
      dbClient: db,
    });

    const capturedInputs: ProcessGenerationInput[] = [];
    const postWithCapturing = createStreamHandler({
      overrides: {
        processGenerationAttempt: async (input: ProcessGenerationInput) => {
          capturedInputs.push(input);
          // Delegate to the default lifecycle service behavior.
          // We import createPlanLifecycleService + getDb inline for the real path.
          const { createPlanLifecycleService: createSvc } = await import(
            '@/features/plans/lifecycle'
          );
          const { getDb: getDbFn } = await import('@/lib/db/runtime');
          const svc = createSvc({
            dbClient: getDbFn(),
            jobQueue: {
              async enqueueJob() {
                return '';
              },
              async completeJob() {},
              async failJob() {},
            },
          });
          return svc.processGenerationAttempt(input);
        },
      },
    });

    const payload = {
      origin: 'pdf',
      extractedContent,
      pdfProofToken: token,
      pdfExtractionHash: extractionHash,
      pdfProofVersion: 1,
      topic: extractedContent.mainTopic,
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      deadlineDate: '2030-04-01',
      visibility: 'private',
    };

    const request = new Request('http://localhost/api/v1/plans/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const response = await postWithCapturing(request);
    expect(response.status).toBe(200);

    const events = await readStreamingResponse(response);
    const planId = await expectCompletedPlanId(events);

    expect(capturedInputs).toHaveLength(1);
    const capturedInput = capturedInputs[0];
    expect(capturedInput).toBeDefined();
    if (!capturedInput) {
      throw new Error('Expected captured generation input');
    }
    expect(capturedInput.input).toMatchObject({
      pdfContext: expect.objectContaining({
        mainTopic: 'TypeScript from PDF context',
        sections: expect.arrayContaining([
          expect.objectContaining({
            title: 'Core concepts',
            content: expect.any(String),
          }),
        ]),
      }),
      pdfExtractionHash: extractionHash,
      pdfProofVersion: DEFAULT_PDF_PROOF_VERSION,
    });

    const capturedSection = capturedInput.input.pdfContext?.sections?.[0];
    const extractedSection = extractedContent.sections?.[0];
    expect(capturedSection).toBeDefined();
    expect(extractedSection).toBeDefined();
    if (extractedSection && capturedSection) {
      expect(capturedSection.content.length).toBeLessThan(
        extractedSection.content.length
      );
    }

    const [plan] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, planId))
      .limit(1);

    const persistedPdfContext = parsePersistedPdfContext(
      plan?.extractedContext
    );

    expect(persistedPdfContext).toMatchObject({
      mainTopic: 'TypeScript from PDF context',
      sections: expect.arrayContaining([
        expect.objectContaining({ title: 'Core concepts' }),
      ]),
    });
    expect(persistedPdfContext?.sections?.[0]?.content.length).toBeLessThan(
      extractedContent.sections[0].content.length
    );

    const [attempt] = await db
      .select({ metadata: generationAttempts.metadata })
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, planId))
      .limit(1);

    expect(attempt?.metadata).toMatchObject({
      pdf: {
        extraction_hash: extractionHash,
        proof_version: DEFAULT_PDF_PROOF_VERSION,
        context_digest: expect.any(String),
      },
    });
  });
});
