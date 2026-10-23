import type { PlanGenerationSessionBoundary } from '@/features/plans/session/plan-generation-session';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const PLAN_ID = '0c834f38-e9e1-4c7d-bdc0-2e28c505256a';
const ATTEMPT_ID = '5a0d7b6c-1e9f-4d8a-8b3c-2f1a0b9c8d74';

const mocks = vi.hoisted(() => ({
  checkPlanGenerationRateLimit: vi.fn(),
  requirePlanContentAccess: vi.fn(),
  getGroundedModelPreferences: vi.fn(),
  actorTier: 'starter' as 'free' | 'starter' | 'pro',
  captureException: vi.fn(),
}));

vi.mock('@sentry/nextjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nextjs')>()),
  captureException: mocks.captureException,
}));

vi.mock('@/lib/db/queries/user-preferences', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/db/queries/user-preferences')
  >()),
  getGroundedModelPreferences: mocks.getGroundedModelPreferences,
}));

vi.mock('@/lib/api/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/rate-limit')>()),
  checkPlanGenerationRateLimit: mocks.checkPlanGenerationRateLimit,
}));

vi.mock('@/lib/api/parse-json-body', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/api/parse-json-body')>();
  return {
    ...actual,
    parseJsonBody: vi.fn((...args: Parameters<typeof actual.parseJsonBody>) =>
      actual.parseJsonBody(...args),
    ),
  };
});

vi.mock('@/features/plans/api/route-context', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/plans/api/route-context')
  >()),
  requirePlanContentAccess: mocks.requirePlanContentAccess,
}));

vi.mock('@/lib/api/request-boundary', async () => {
  const { withErrorBoundary } = await vi.importActual<
    typeof import('@/lib/api/route-wrappers')
  >('@/lib/api/route-wrappers');

  return {
    requestBoundary: {
      route: (
        _options: unknown,
        handler: (scope: {
          req: Request;
          params: Record<string, string>;
          actor: {
            id: string;
            authUserId: string;
            preferredAiModel: string | null;
            subscriptionTier: 'free' | 'starter' | 'pro';
          };
          db: unknown;
          correlationId: string;
        }) => Promise<Response>,
      ) =>
        withErrorBoundary((req) =>
          handler({
            req,
            params: { planId: PLAN_ID },
            actor: {
              id: 'user-1',
              authUserId: 'auth-1',
              preferredAiModel: 'openai/gpt-4o-mini',
              subscriptionTier: mocks.actorTier,
            },
            db: {},
            correlationId: 'corr-1',
          }),
        ),
    },
  };
});

import { createRetryHandler } from '@/app/api/v1/plans/[planId]/retry/route';
import { createPlanCreateHandler } from '@/app/api/v1/plans/route';
import { AppError, RateLimitError } from '@/lib/api/errors';
import { parseJsonBody } from '@/lib/api/parse-json-body';

const VALID_BODY = {
  topic: 'Learning TypeScript',
  skillLevel: 'beginner',
  weeklyHours: 5,
  learningStyle: 'mixed',
  deadlineDate: '2030-01-01',
  visibility: 'private',
  origin: 'ai',
};

const WRITER_PICKS = {
  preferredWriterAiModel: 'anthropic/claude-haiku-5.5',
  preferredVerifierAiModel: null,
  preferredAdvisorAiModel: null,
};

beforeEach(() => {
  mocks.actorTier = 'starter';
  mocks.getGroundedModelPreferences.mockReset();
  mocks.getGroundedModelPreferences.mockResolvedValue(WRITER_PICKS);
});

const NOT_STARTED = new AppError(
  'Plan generation encountered an error. Please try again.',
  {
    status: 503,
    code: 'GENERATION_FAILED',
    classification: 'provider_error',
    details: { planId: PLAN_ID, retryable: true },
  },
);

function makeBoundary() {
  return {
    startCreate: vi.fn(async () => ({
      planId: PLAN_ID,
      attemptId: ATTEMPT_ID,
    })),
    startRetry: vi.fn(async () => ({
      planId: PLAN_ID,
      attemptId: ATTEMPT_ID,
    })),
  } satisfies PlanGenerationSessionBoundary;
}

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function createRequest(body: string): Request {
  return new Request('http://localhost/api/v1/plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

function retryRequest(): Request {
  return new Request(`http://localhost/api/v1/plans/${PLAN_ID}/retry`, {
    method: 'POST',
  });
}

describe('POST /api/v1/plans', () => {
  beforeEach(() => {
    mocks.checkPlanGenerationRateLimit.mockReset();
    mocks.checkPlanGenerationRateLimit.mockResolvedValue({
      remaining: 4,
      limit: 10,
      reset: 1_700_000_000,
    });
  });

  it('starts generation and returns 202 { planId, attemptId } with rate-limit headers', async () => {
    const boundary = makeBoundary();
    const post = createPlanCreateHandler({ boundary, logger: makeLogger() });

    const response = await post(createRequest(JSON.stringify(VALID_BODY)));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      planId: PLAN_ID,
      attemptId: ATTEMPT_ID,
    });
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('4');
    expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(boundary.startCreate).toHaveBeenCalledWith({
      req: expect.any(Request),
      authUserId: 'auth-1',
      internalUserId: 'user-1',
      body: expect.objectContaining({ topic: 'Learning TypeScript' }),
      savedPreferredAiModel: 'openai/gpt-4o-mini',
      requestId: 'corr-1',
    });
    expect(mocks.getGroundedModelPreferences).not.toHaveBeenCalled();
  });

  it('loads and passes the saved grounded picks for Pro', async () => {
    mocks.actorTier = 'pro';
    const boundary = makeBoundary();
    const post = createPlanCreateHandler({ boundary, logger: makeLogger() });

    const response = await post(createRequest(JSON.stringify(VALID_BODY)));

    expect(response.status).toBe(202);
    expect(mocks.getGroundedModelPreferences).toHaveBeenCalledWith(
      'user-1',
      {},
    );
    expect(boundary.startCreate).toHaveBeenCalledWith(
      expect.objectContaining({ savedGroundedPicks: WRITER_PICKS }),
    );
  });

  it('returns 400 with reason details for malformed JSON', async () => {
    const boundary = makeBoundary();
    const post = createPlanCreateHandler({ boundary, logger: makeLogger() });

    const response = await post(createRequest('{ not json'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request body.',
      details: { reason: 'Malformed or invalid JSON payload.' },
    });
    expect(boundary.startCreate).not.toHaveBeenCalled();
  });

  it('returns 400 and logs only structural metadata for an invalid body', async () => {
    const boundary = makeBoundary();
    const logger = makeLogger();
    const post = createPlanCreateHandler({ boundary, logger });
    const privateTopic = 'Private health diagnosis research';

    const response = await post(
      createRequest(JSON.stringify({ topic: privateTopic })),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request body.',
      code: 'VALIDATION_ERROR',
    });
    const payloadCall = logger.info.mock.calls.find(
      ([, message]) => message === 'Plan create request payload received',
    );
    expect(payloadCall?.[0]).toMatchObject({ payload: { hasTopic: true } });
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(privateTopic);
    expect(boundary.startCreate).not.toHaveBeenCalled();
  });

  it('warns when the payload log fails and still returns an error response', async () => {
    const boundary = makeBoundary();
    const logger = makeLogger();
    const post = createPlanCreateHandler({ boundary, logger });
    mocks.captureException.mockClear();
    // Promise resolution probes `then`; every other access throws so the
    // warn path does not depend on field access order.
    const payload = new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === 'then') {
            return undefined;
          }
          throw new Error('payload log boom');
        },
      },
    );
    vi.mocked(parseJsonBody).mockResolvedValueOnce(payload);

    const response = await post(createRequest('{}'));

    expect(response.status).toBe(400);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        authUserId: 'auth-1',
        error: expect.objectContaining({ message: 'payload log boom' }),
        payload: { payloadType: 'object' },
      }),
      'Plan create payload log failed',
    );
    expect(mocks.captureException).toHaveBeenCalledOnce();
    const [, captureContext] = mocks.captureException.mock.calls[0] ?? [];
    expect(captureContext).toMatchObject({
      extra: { payload: { payloadType: 'object' } },
    });
    expect(captureContext.extra).not.toHaveProperty('authUserId');
    expect(JSON.stringify(captureContext)).not.toContain('auth-1');
    expect(boundary.startCreate).not.toHaveBeenCalled();
  });

  it('returns 429 before anything is created when the generation window is full', async () => {
    mocks.checkPlanGenerationRateLimit.mockRejectedValue(
      new RateLimitError('Rate limit exceeded.', {
        retryAfter: 60,
        remaining: 0,
        limit: 10,
        reset: 1_700_000_000,
      }),
    );
    const boundary = makeBoundary();
    const post = createPlanCreateHandler({ boundary, logger: makeLogger() });

    const response = await post(createRequest(JSON.stringify(VALID_BODY)));

    expect(response.status).toBe(429);
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    await expect(response.json()).resolves.toMatchObject({
      code: 'RATE_LIMITED',
      retryAfter: 60,
    });
    expect(boundary.startCreate).not.toHaveBeenCalled();
  });

  it('returns the canonical error shape when generation did not start', async () => {
    const boundary = makeBoundary();
    boundary.startCreate.mockRejectedValue(NOT_STARTED);
    const post = createPlanCreateHandler({ boundary, logger: makeLogger() });

    const response = await post(createRequest(JSON.stringify(VALID_BODY)));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Plan generation encountered an error. Please try again.',
      code: 'GENERATION_FAILED',
      classification: 'provider_error',
      details: { planId: PLAN_ID, retryable: true },
    });
  });
});

describe('POST /api/v1/plans/:planId/retry', () => {
  beforeEach(() => {
    mocks.checkPlanGenerationRateLimit.mockReset();
    mocks.checkPlanGenerationRateLimit.mockResolvedValue({
      remaining: 3,
      limit: 10,
      reset: 1_700_000_000,
    });
    mocks.requirePlanContentAccess.mockReset();
    mocks.requirePlanContentAccess.mockResolvedValue({
      id: PLAN_ID,
      topic: 'Retry Topic',
      skillLevel: 'intermediate',
      weeklyHours: 6,
      learningStyle: 'mixed',
      startDate: '2030-01-01',
      deadlineDate: '2030-06-01',
      origin: 'ai',
      generationStatus: 'failed',
    });
  });

  it('starts the retry and returns 202 { planId, attemptId }', async () => {
    const boundary = makeBoundary();
    const post = createRetryHandler({ boundary });

    const response = await post(retryRequest());

    expect(response.status).toBe(202);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({
      planId: PLAN_ID,
      attemptId: ATTEMPT_ID,
    });
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('3');
    expect(boundary.startRetry).toHaveBeenCalledWith({
      req: expect.any(Request),
      authUserId: 'auth-1',
      internalUserId: 'user-1',
      planId: PLAN_ID,
      plan: {
        topic: 'Retry Topic',
        skillLevel: 'intermediate',
        weeklyHours: 6,
        learningStyle: 'mixed',
        startDate: '2030-01-01',
        deadlineDate: '2030-06-01',
      },
      savedPreferredAiModel: 'openai/gpt-4o-mini',
      tierDb: {},
      requestId: 'corr-1',
    });
    expect(mocks.getGroundedModelPreferences).not.toHaveBeenCalled();
  });

  it('loads and passes the saved grounded picks for a Pro retry', async () => {
    mocks.actorTier = 'pro';
    const boundary = makeBoundary();
    const post = createRetryHandler({ boundary });

    const response = await post(retryRequest());

    expect(response.status).toBe(202);
    expect(boundary.startRetry).toHaveBeenCalledWith(
      expect.objectContaining({ savedGroundedPicks: WRITER_PICKS }),
    );
  });

  it.each(['generating', 'ready'])(
    'returns 400 for a %s plan without starting',
    async (generationStatus) => {
      mocks.requirePlanContentAccess.mockResolvedValue({
        id: PLAN_ID,
        generationStatus,
      });
      const boundary = makeBoundary();
      const post = createRetryHandler({ boundary });

      const response = await post(retryRequest());

      expect(response.status).toBe(400);
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('3');
      await expect(response.json()).resolves.toMatchObject({
        code: 'VALIDATION_ERROR',
        error: expect.stringContaining('not eligible for retry'),
      });
      expect(boundary.startRetry).not.toHaveBeenCalled();
    },
  );

  it('returns 429 before reading the plan when the generation window is full', async () => {
    mocks.checkPlanGenerationRateLimit.mockRejectedValue(
      new RateLimitError('Rate limit exceeded.', {
        retryAfter: 30,
        remaining: 0,
        limit: 10,
        reset: 1_700_000_000,
      }),
    );
    const boundary = makeBoundary();
    const post = createRetryHandler({ boundary });

    const response = await post(retryRequest());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      code: 'RATE_LIMITED',
    });
    expect(mocks.requirePlanContentAccess).not.toHaveBeenCalled();
    expect(boundary.startRetry).not.toHaveBeenCalled();
  });

  it('returns the canonical error shape when the retry did not start', async () => {
    const boundary = makeBoundary();
    boundary.startRetry.mockRejectedValue(NOT_STARTED);
    const post = createRetryHandler({ boundary });

    const response = await post(retryRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Plan generation encountered an error. Please try again.',
      code: 'GENERATION_FAILED',
      classification: 'provider_error',
      details: { planId: PLAN_ID, retryable: true },
    });
  });
});
