import type { startModuleLessonGeneration } from '@/features/lesson-content/start-module-lesson-generation-workflow';

import { createModuleLessonContentGenerateHandler } from '@/app/api/v1/plans/[planId]/modules/[moduleId]/lesson-content/generate/handler';
import {
  clearAllUserRateLimiters,
  USER_RATE_LIMIT_CONFIGS,
} from '@/lib/api/user-rate-limit';
import { learningPlans } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { clearTestUser, setTestUser } from '@tests/helpers/auth';
import { ensureUser } from '@tests/helpers/db/users';
import { mockServerSession } from '@tests/helpers/mock-server-auth';
import { buildRouteHandlerContext } from '@tests/helpers/route-handler-context';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { NextRequest } from 'next/server';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from 'vitest';

const serverAuth = vi.hoisted(() => {
  const getSession = vi.fn();
  return {
    getSession,
    module: () => ({ auth: { getSession } }),
  };
});
vi.mock('@/lib/auth/server', () => serverAuth.module());

const mockStartModuleLessonGeneration = vi.fn() as MockedFunction<
  typeof startModuleLessonGeneration
>;
const POST_LESSON_GENERATE = createModuleLessonContentGenerateHandler(
  mockStartModuleLessonGeneration,
);

const VALID_PLAN_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const VALID_MODULE_ID = '7f9c2f8d-1a9b-4f6e-9f6c-2b2c3d479abc';

describe('plans API route boundary (integration)', () => {
  const ownerAuthId = buildTestAuthUserId('plans-route-boundary-owner');
  let ownerUserId: string;
  let ownerPlanId: string;

  beforeEach(async () => {
    clearAllUserRateLimiters();
    mockStartModuleLessonGeneration.mockReset();
    mockServerSession(serverAuth.getSession, ownerAuthId);
    setTestUser(ownerAuthId);

    ownerUserId = await ensureUser({
      authUserId: ownerAuthId,
      email: buildTestEmail(ownerAuthId),
      subscriptionTier: 'starter',
    });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: ownerUserId,
        topic: 'Route boundary plan',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
        generationStatus: 'ready',
      })
      .returning();
    ownerPlanId = plan.id;
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearTestUser();
  });

  it('GET /status returns canonical 401 for unauthenticated requests', async () => {
    clearTestUser();
    serverAuth.getSession.mockResolvedValue({ data: { user: null } });

    const { GET } = await import('@/app/api/v1/plans/[planId]/status/route');
    const request = new NextRequest(
      `http://localhost:3000/api/v1/plans/${ownerPlanId}/status`,
      { method: 'GET' },
    );
    const response = await GET(
      request,
      buildRouteHandlerContext({ planId: ownerPlanId }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
  });

  it('GET /status includes read rate-limit headers for authenticated requests', async () => {
    const { GET } = await import('@/app/api/v1/plans/[planId]/status/route');
    const request = new NextRequest(
      `http://localhost:3000/api/v1/plans/${ownerPlanId}/status`,
      { method: 'GET' },
    );
    const response = await GET(
      request,
      buildRouteHandlerContext({ planId: ownerPlanId }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('X-RateLimit-Limit')).toBe(
      String(USER_RATE_LIMIT_CONFIGS.read.maxRequests),
    );
    expect(response.headers.get('X-RateLimit-Remaining')).not.toBeNull();
    expect(response.headers.get('X-RateLimit-Reset')).not.toBeNull();
  });

  it('POST lesson-content/generate returns canonical 401 for unauthenticated requests', async () => {
    clearTestUser();
    serverAuth.getSession.mockResolvedValue({ data: { user: null } });

    const request = new Request(
      `http://localhost/api/v1/plans/${VALID_PLAN_ID}/modules/${VALID_MODULE_ID}/lesson-content/generate`,
      { method: 'POST' },
    );
    const response = await POST_LESSON_GENERATE(request, {
      params: Promise.resolve({
        planId: VALID_PLAN_ID,
        moduleId: VALID_MODULE_ID,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
    expect(mockStartModuleLessonGeneration).not.toHaveBeenCalled();
  });

  it('POST lesson-content/generate includes lessonGeneration rate-limit headers when authenticated', async () => {
    await db.insert(learningPlans).values({
      id: VALID_PLAN_ID,
      userId: ownerUserId,
      topic: 'Lesson boundary plan',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      generationStatus: 'ready',
    });
    mockStartModuleLessonGeneration.mockResolvedValue({
      kind: 'success',
      durationMs: 100,
    });

    const request = new Request(
      `http://localhost/api/v1/plans/${VALID_PLAN_ID}/modules/${VALID_MODULE_ID}/lesson-content/generate`,
      { method: 'POST' },
    );
    const response = await POST_LESSON_GENERATE(request, {
      params: Promise.resolve({
        planId: VALID_PLAN_ID,
        moduleId: VALID_MODULE_ID,
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('X-RateLimit-Limit')).toBe(
      String(USER_RATE_LIMIT_CONFIGS.lessonGeneration.maxRequests),
    );
    expect(response.headers.get('X-RateLimit-Remaining')).not.toBeNull();
    expect(response.headers.get('X-RateLimit-Reset')).not.toBeNull();
  });
});
