import { seedFailedAttemptsForDurableWindow } from '../../fixtures/attempts';
import { createPlanForRetryTest } from '../../fixtures/plans';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db/users';
import { POST } from '@/app/api/v1/plans/[planId]/retry/route';
import { GET as getStatus } from '@/app/api/v1/plans/[planId]/status/route';
import {
  JOBS_SIGNATURE_HEADER,
  planGenerationStartCommandSchema,
} from '@/lib/jobs-worker/contract';
import { generationAttempts, learningPlans } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { buildRouteHandlerContext } from '@tests/helpers/route-handler-context';
import { desc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const workerFetch =
  vi.fn<(url: URL | string, init: RequestInit) => Promise<Response>>();

type RetryAttemptOverrides = Partial<
  Omit<typeof generationAttempts.$inferInsert, 'planId'>
>;

async function createFailedPlan(
  userId: string,
  attemptOverrides: RetryAttemptOverrides = {},
) {
  const plan = await createPlanForRetryTest(userId);
  await db.insert(generationAttempts).values({
    planId: plan.id,
    status: 'failure',
    classification: 'timeout',
    durationMs: 1_000,
    modulesCount: 0,
    tasksCount: 0,
    promptHash: `retry-first-${plan.id}`,
    ...attemptOverrides,
  });
  return plan;
}

function retry(planId: string) {
  return POST(
    new Request(`http://localhost/api/v1/plans/${planId}/retry`, {
      method: 'POST',
    }),
    buildRouteHandlerContext({ planId }),
  );
}

async function listAttempts(planId: string) {
  return db
    .select({
      id: generationAttempts.id,
      status: generationAttempts.status,
      classification: generationAttempts.classification,
    })
    .from(generationAttempts)
    .where(eq(generationAttempts.planId, planId))
    .orderBy(desc(generationAttempts.createdAt));
}

async function getGenerationStatus(planId: string) {
  const [plan] = await db
    .select({ generationStatus: learningPlans.generationStatus })
    .from(learningPlans)
    .where(eq(learningPlans.id, planId))
    .limit(1);
  return plan?.generationStatus;
}

async function setUpRetryUser(label: string) {
  const authUserId = `auth_retry_${label}`;
  setTestUser(authUserId);
  return ensureUser({
    authUserId,
    email: `retry-${label}@example.com`,
    subscriptionTier: 'pro',
  });
}

beforeEach(() => {
  workerFetch.mockReset();
  workerFetch.mockImplementation(async () =>
    Response.json(
      { accepted: true, instanceId: 'plan-instance' },
      { status: 202 },
    ),
  );
  vi.stubEnv('JOBS_WORKER_URL', 'https://workers-test.atlaris.app');
  vi.stubEnv('JOBS_SIGNING_SECRET', 'integration-secret');
  vi.stubGlobal('fetch', workerFetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('POST /api/v1/plans/:planId/retry — create + poll', () => {
  it('reserves the next attempt, sends the signed start command to the jobs Worker, and returns 202', async () => {
    const userId = await setUpRetryUser('success');
    const plan = await createFailedPlan(userId);

    const response = await retry(plan.id);

    expect(response.status).toBe(202);
    expect(response.headers.get('X-RateLimit-Remaining')).toMatch(/^\d+$/);
    const body = (await response.json()) as {
      planId: string;
      attemptId: string;
    };
    expect(body.planId).toBe(plan.id);

    const attempts = await listAttempts(plan.id);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({
      id: body.attemptId,
      status: 'in_progress',
    });
    expect(attempts[1]).toMatchObject({
      status: 'failure',
      classification: 'timeout',
    });
    await expect(getGenerationStatus(plan.id)).resolves.toBe('generating');

    expect(workerFetch).toHaveBeenCalledTimes(1);
    const [url, init] = workerFetch.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://workers-test.atlaris.app/v1/plan-generation/start',
    );
    expect(new Headers(init.headers).get(JOBS_SIGNATURE_HEADER)).toMatch(
      /^v1=[0-9a-f]{64}$/,
    );
    const command = planGenerationStartCommandSchema.parse(
      JSON.parse(String(init.body)),
    );
    expect(command).toMatchObject({
      planId: plan.id,
      userId,
      allowedGenerationStatuses: ['failed', 'pending_retry'],
      reservation: { attemptId: body.attemptId },
    });
  });

  it('reads the final allowed attempt as processing while it runs', async () => {
    const userId = await setUpRetryUser('final-attempt');
    const plan = await createFailedPlan(userId);
    await db.insert(generationAttempts).values({
      planId: plan.id,
      status: 'failure',
      classification: 'provider_error',
      durationMs: 1_000,
      modulesCount: 0,
      tasksCount: 0,
      promptHash: `retry-second-${plan.id}`,
    });

    const response = await retry(plan.id);
    expect(response.status).toBe(202);

    const status = await getStatus(
      new Request(`http://localhost/api/v1/plans/${plan.id}/status`),
      buildRouteHandlerContext({ planId: plan.id }),
    );
    await expect(status.json()).resolves.toMatchObject({
      status: 'processing',
      attempts: 3,
      latestError: null,
    });
  });

  it('settles the reserved attempt and returns the not-started error when the Worker cannot be reached', async () => {
    const userId = await setUpRetryUser('start-failure');
    const plan = await createFailedPlan(userId);
    workerFetch.mockRejectedValue(new Error('worker unreachable'));

    const response = await retry(plan.id);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Plan generation encountered an error. Please try again.',
      code: 'GENERATION_FAILED',
      classification: 'provider_error',
      details: { planId: plan.id, retryable: true },
    });
    const attempts = await listAttempts(plan.id);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({
      status: 'failure',
      classification: 'provider_error',
    });
    // The shared failure policy releases the reservation (`ready` for a
    // last-good plan, `failed` otherwise); it never stays `generating`.
    await expect(getGenerationStatus(plan.id)).resolves.not.toBe('generating');
  });

  it('settles the attempt when the jobs Worker is not configured', async () => {
    const userId = await setUpRetryUser('cloudflare-unconfigured');
    const plan = await createFailedPlan(userId);
    vi.stubEnv('JOBS_WORKER_URL', undefined);
    vi.stubEnv('JOBS_SIGNING_SECRET', undefined);

    const response = await retry(plan.id);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'GENERATION_FAILED',
      details: { planId: plan.id, retryable: true },
    });
    const [latest] = await listAttempts(plan.id);
    expect(latest).toMatchObject({
      status: 'failure',
      classification: 'provider_error',
    });
    await expect(getGenerationStatus(plan.id)).resolves.not.toBe('generating');
  });

  it('starts exactly one attempt for concurrent retries', async () => {
    const userId = await setUpRetryUser('concurrent');
    const plan = await createFailedPlan(userId);

    const responses = await Promise.all([retry(plan.id), retry(plan.id)]);
    const statuses = responses.map((response) => response.status);

    expect(statuses.filter((status) => status === 202)).toHaveLength(1);
    const loser = responses.find((response) => response.status !== 202)!;
    expect(loser.status).toBeGreaterThanOrEqual(400);
    expect(loser.status).toBeLessThan(500);
    expect(workerFetch).toHaveBeenCalledTimes(1);

    const attempts = await listAttempts(plan.id);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.status).toBe('in_progress');
    await expect(getGenerationStatus(plan.id)).resolves.toBe('generating');
  });

  it('applies durable generation_attempts rate limit before retry starts', async () => {
    const authUserId = 'auth_retry_rate_limit';
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: 'retry-rate-limit@example.com',
    });

    const plan = await createPlanForRetryTest(userId);
    await seedFailedAttemptsForDurableWindow(plan.id);

    const response = await retry(plan.id);
    expect(response.status).toBe(429);
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');

    const body = (await response.json()) as {
      code?: string;
      retryAfter?: number;
    };
    expect(body.code).toBe('RATE_LIMITED');
    expect(typeof body.retryAfter).toBe('number');
    expect(workerFetch).not.toHaveBeenCalled();
  });

  it('returns 400 when plan is not in failed state', async () => {
    const userId = await setUpRetryUser('invalid-status');
    const plan = await createPlanForRetryTest(userId, {
      topic: 'Ready plan',
      generationStatus: 'ready',
    });

    const response = await retry(plan.id);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string; code?: string };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('not eligible for retry');
    expect(workerFetch).not.toHaveBeenCalled();
  });
});
