import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';
import { POST } from '@/app/api/v1/plans/route';
import {
  JOBS_SIGNATURE_HEADER,
  planGenerationStartCommandSchema,
} from '@/lib/jobs-worker/contract';
import { generationAttempts, learningPlans } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { desc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const workerFetch =
  vi.fn<(url: URL | string, init: RequestInit) => Promise<Response>>();

const payload = {
  topic: 'Learning TypeScript',
  skillLevel: 'beginner',
  weeklyHours: 5,
  learningStyle: 'mixed',
  deadlineDate: '2030-01-01',
  visibility: 'private',
  origin: 'ai',
};

function create(body: unknown = payload): Promise<Response> {
  return POST(
    new Request('http://localhost/api/v1/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

async function setUpUser(label: string) {
  const authUserId = buildTestAuthUserId(label);
  const userId = await ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
    subscriptionTier: 'pro',
  });
  setTestUser(authUserId);
  return userId;
}

async function listUserPlans(userId: string) {
  return db
    .select({
      id: learningPlans.id,
      generationStatus: learningPlans.generationStatus,
    })
    .from(learningPlans)
    .where(eq(learningPlans.userId, userId));
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

describe('POST /api/v1/plans — create + poll', () => {
  it('creates the plan, reserves its first attempt, sends the signed start command to the jobs Worker, and returns 202', async () => {
    const userId = await setUpUser('plans-create-success');

    const response = await create();

    expect(response.status).toBe(202);
    for (const name of [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ]) {
      expect(response.headers.get(name)).toMatch(/^\d+$/);
    }
    const body = (await response.json()) as {
      planId: string;
      attemptId: string;
    };

    const plans = await listUserPlans(userId);
    expect(plans).toEqual([
      { id: body.planId, generationStatus: 'generating' },
    ]);
    await expect(listAttempts(body.planId)).resolves.toEqual([
      { id: body.attemptId, status: 'in_progress', classification: null },
    ]);
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
      planId: body.planId,
      userId,
      generationPurpose: 'initial',
      input: expect.objectContaining({ topic: 'Learning TypeScript' }),
      reservation: { attemptId: body.attemptId },
    });
  });

  it('returns 400 for an invalid body without creating a plan', async () => {
    const userId = await setUpUser('plans-create-invalid');

    const response = await create({ topic: 'x' });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request body.',
    });
    await expect(listUserPlans(userId)).resolves.toEqual([]);
    expect(workerFetch).not.toHaveBeenCalled();
  });

  it('returns the not-started error with the plan ID when the jobs Worker is not configured', async () => {
    const userId = await setUpUser('plans-create-cf-unconfigured');
    vi.stubEnv('JOBS_WORKER_URL', undefined);
    vi.stubEnv('JOBS_SIGNING_SECRET', undefined);

    const response = await create();

    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      code: string;
      details: { planId: string; retryable: boolean };
    };
    expect(body.code).toBe('GENERATION_FAILED');
    expect(body.details.retryable).toBe(true);

    const [plan] = await listUserPlans(userId);
    expect(plan?.id).toBe(body.details.planId);
    expect(plan?.generationStatus).not.toBe('generating');
    const [attempt] = await listAttempts(body.details.planId);
    expect(attempt).toMatchObject({
      status: 'failure',
      classification: 'provider_error',
    });
    expect(workerFetch).not.toHaveBeenCalled();
  });
});
