import type { generateModuleLessons } from '@/features/lesson-content/generate-module-lessons';

import { createModuleLessonContentGenerateHandler } from '@/app/api/v1/plans/[planId]/modules/[moduleId]/lesson-content/generate/route';
import {
  clearAllUserRateLimiters,
  USER_RATE_LIMIT_CONFIGS,
} from '@/lib/api/user-rate-limit';
import { learningPlans } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { setTestUser, clearTestUser } from '@tests/helpers/auth';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from 'vitest';

const mockGenerateModuleLessons = vi.fn() as MockedFunction<
  typeof generateModuleLessons
>;
const POST = createModuleLessonContentGenerateHandler(
  mockGenerateModuleLessons,
);

const BASE_URL = 'http://localhost/api/v1/plans';
const VALID_PLAN_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const VALID_MODULE_ID = '7f9c2f8d-1a9b-4f6e-9f6c-2b2c3d479abc';

async function seedOwnedPlanForLessonContentApi(userId: string): Promise<void> {
  await db.insert(learningPlans).values({
    id: VALID_PLAN_ID,
    userId,
    topic: 'Lesson content API test plan',
    skillLevel: 'beginner',
    weeklyHours: 5,
    learningStyle: 'mixed',
    visibility: 'private',
    origin: 'ai',
    generationStatus: 'ready',
  });
}

function createRequest(planId = VALID_PLAN_ID, moduleId = VALID_MODULE_ID) {
  return {
    request: new Request(
      `${BASE_URL}/${planId}/modules/${moduleId}/lesson-content/generate`,
      { method: 'POST' },
    ),
    context: { params: Promise.resolve({ planId, moduleId }) },
  };
}

async function authenticateTestUser(
  suffix: string,
  subscriptionTier = 'starter',
) {
  const authUserId = buildTestAuthUserId(`lesson-api-${suffix}`);
  setTestUser(authUserId);
  return ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
    subscriptionTier: subscriptionTier as 'free' | 'starter' | 'pro',
  });
}

describe('POST /api/v1/plans/:planId/modules/:moduleId/lesson-content/generate', () => {
  beforeEach(() => {
    clearAllUserRateLimiters();
    mockGenerateModuleLessons.mockReset();
  });

  afterEach(() => {
    clearTestUser();
  });

  it('maps successful generation to ready state and passes scoped inputs', async () => {
    const userId = await authenticateTestUser('success', 'starter');
    await seedOwnedPlanForLessonContentApi(userId);
    mockGenerateModuleLessons.mockResolvedValue({
      kind: 'success',
      durationMs: 1234,
    });

    const { request, context } = createRequest();
    const response = await POST(request, context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-RateLimit-Limit')).toBe(
      String(USER_RATE_LIMIT_CONFIGS.lessonGeneration.maxRequests),
    );
    expect(body).toEqual({
      state: 'ready',
      planId: VALID_PLAN_ID,
      moduleId: VALID_MODULE_ID,
      durationMs: 1234,
    });
    expect(mockGenerateModuleLessons).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        planId: VALID_PLAN_ID,
        moduleId: VALID_MODULE_ID,
        userTier: 'starter',
        signal: request.signal,
      }),
    );
  });

  it('maps cached ready modules to ready state', async () => {
    const userId = await authenticateTestUser('cached');
    await seedOwnedPlanForLessonContentApi(userId);
    mockGenerateModuleLessons.mockResolvedValue({ kind: 'already_ready' });

    const { request, context } = createRequest();
    const response = await POST(request, context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      state: 'ready',
      planId: VALID_PLAN_ID,
      moduleId: VALID_MODULE_ID,
    });
  });

  it('maps duplicate in-flight generation to generating state', async () => {
    const userId = await authenticateTestUser('in-flight');
    await seedOwnedPlanForLessonContentApi(userId);
    mockGenerateModuleLessons.mockResolvedValue({ kind: 'in_flight' });

    const { request, context } = createRequest();
    const response = await POST(request, context);
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual({
      state: 'generating',
      planId: VALID_PLAN_ID,
      moduleId: VALID_MODULE_ID,
    });
  });

  it('maps quota denial to quota_denied state', async () => {
    const userId = await authenticateTestUser('quota', 'free');
    await seedOwnedPlanForLessonContentApi(userId);
    mockGenerateModuleLessons.mockResolvedValue({
      kind: 'quota_denied',
      currentCount: 3,
      limit: 3,
    });

    const { request, context } = createRequest();
    const response = await POST(request, context);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toEqual({
      state: 'quota_denied',
      planId: VALID_PLAN_ID,
      moduleId: VALID_MODULE_ID,
      currentCount: 3,
      limit: 3,
    });
  });

  it('maps provider failure to provider_failure state', async () => {
    const userId = await authenticateTestUser('provider-failure');
    await seedOwnedPlanForLessonContentApi(userId);
    mockGenerateModuleLessons.mockResolvedValue({
      kind: 'failed',
      message: 'Provider output was invalid.',
    });

    const { request, context } = createRequest();
    const response = await POST(request, context);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({
      state: 'provider_failure',
      planId: VALID_PLAN_ID,
      moduleId: VALID_MODULE_ID,
      message: 'Provider output was invalid.',
    });
  });

  it('maps disabled generation to disabled state', async () => {
    const userId = await authenticateTestUser('disabled');
    await seedOwnedPlanForLessonContentApi(userId);
    mockGenerateModuleLessons.mockResolvedValue({ kind: 'disabled' });

    const { request, context } = createRequest();
    const response = await POST(request, context);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      state: 'disabled',
      planId: VALID_PLAN_ID,
      moduleId: VALID_MODULE_ID,
    });
  });

  it('maps missing or unauthorized modules to not_found state', async () => {
    const userId = await authenticateTestUser('not-found');
    await seedOwnedPlanForLessonContentApi(userId);
    mockGenerateModuleLessons.mockResolvedValue({ kind: 'not_found' });

    const { request, context } = createRequest();
    const response = await POST(request, context);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      state: 'not_found',
      planId: VALID_PLAN_ID,
      moduleId: VALID_MODULE_ID,
    });
  });

  it('maps locked modules to locked conflict state', async () => {
    const userId = await authenticateTestUser('locked');
    await seedOwnedPlanForLessonContentApi(userId);
    mockGenerateModuleLessons.mockResolvedValue({ kind: 'locked' });

    const { request, context } = createRequest();
    const response = await POST(request, context);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      state: 'locked',
      planId: VALID_PLAN_ID,
      moduleId: VALID_MODULE_ID,
    });
  });

  it('returns 404 and does not call generate when learning plan not owned', async () => {
    await authenticateTestUser('no-owned-plan');

    const { request, context } = createRequest();
    const response = await POST(request, context);

    expect(response.status).toBe(404);
    const failureBody = await response.json();
    expect(failureBody).toMatchObject({
      error: 'Learning plan not found.',
    });
    expect(mockGenerateModuleLessons).not.toHaveBeenCalled();
  });

  it('rejects invalid UUID params before calling the feature boundary', async () => {
    await authenticateTestUser('invalid-param');

    const { request, context } = createRequest('not-a-uuid', VALID_MODULE_ID);
    const response = await POST(request, context);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid planId format.');
    expect(mockGenerateModuleLessons).not.toHaveBeenCalled();
  });

  it('returns canonical unauthorized response without calling the feature boundary', async () => {
    clearTestUser();

    const { request, context } = createRequest();
    const response = await POST(request, context);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
    expect(mockGenerateModuleLessons).not.toHaveBeenCalled();
  });

  it('keeps service-role imports out of the user-facing route', () => {
    const routeSource = readFileSync(
      join(
        process.cwd(),
        'src/app/api/v1/plans/[planId]/modules/[moduleId]/lesson-content/generate/route.ts',
      ),
      'utf8',
    );

    expect(routeSource).not.toContain('@supabase/service-role');
  });
});
