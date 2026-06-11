import { GET } from '@/app/api/v1/plans/[planId]/modules/[moduleId]/lesson-content/status/route';
import { learningPlans, modules } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { setTestUser, clearTestUser } from '@tests/helpers/auth';
import { ensureUser } from '@tests/helpers/db/users';
import { buildRouteHandlerContext } from '@tests/helpers/route-handler-context';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const BASE_URL = 'http://localhost/api/v1/plans';
const VALID_PLAN_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const OTHER_PLAN_ID = 'a57ac10b-58cc-4372-a567-0e02b2c3d480';
const VALID_MODULE_ID = '7f9c2f8d-1a9b-4f6e-9f6c-2b2c3d479abc';

type LessonGenerationStatus =
  | 'not_generated'
  | 'generating'
  | 'ready'
  | 'failed';

async function seedOwnedPlanForStatusApi(userId: string): Promise<void> {
  await db.insert(learningPlans).values({
    id: VALID_PLAN_ID,
    userId,
    topic: 'Lesson status API test plan',
    skillLevel: 'beginner',
    weeklyHours: 5,
    learningStyle: 'mixed',
    visibility: 'private',
    origin: 'ai',
    generationStatus: 'ready',
  });
}

async function seedOwnedModule(
  status: LessonGenerationStatus,
  moduleId = VALID_MODULE_ID,
): Promise<void> {
  await db.insert(modules).values({
    id: moduleId,
    planId: VALID_PLAN_ID,
    order: 1,
    title: 'Status test module',
    description: 'Module for lesson status API tests',
    estimatedMinutes: 30,
    lessonGenerationStatus: status,
  });
}

async function authenticateTestUser(suffix: string) {
  const authUserId = buildTestAuthUserId(`lesson-status-api-${suffix}`);
  setTestUser(authUserId);
  return ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
    subscriptionTier: 'starter',
  });
}

function createRequest(planId = VALID_PLAN_ID, moduleId = VALID_MODULE_ID) {
  return new NextRequest(
    `${BASE_URL}/${planId}/modules/${moduleId}/lesson-content/status`,
    { method: 'GET' },
  );
}

describe('GET /api/v1/plans/:planId/modules/:moduleId/lesson-content/status', () => {
  afterEach(() => {
    clearTestUser();
  });

  it.each([
    ['not_generated', 'not_generated'],
    ['generating', 'generating'],
    ['ready', 'ready'],
    ['failed', 'failed'],
  ] as const)(
    'returns %s status for the owner module',
    async (persistedStatus, expectedStatus) => {
      const userId = await authenticateTestUser(persistedStatus);
      await seedOwnedPlanForStatusApi(userId);
      await seedOwnedModule(persistedStatus);

      const response = await GET(
        createRequest(),
        buildRouteHandlerContext({
          planId: VALID_PLAN_ID,
          moduleId: VALID_MODULE_ID,
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(body).toEqual({
        planId: VALID_PLAN_ID,
        moduleId: VALID_MODULE_ID,
        status: expectedStatus,
      });
    },
  );

  it('returns 404 for a missing module', async () => {
    const userId = await authenticateTestUser('missing-module');
    await seedOwnedPlanForStatusApi(userId);

    const response = await GET(
      createRequest(),
      buildRouteHandlerContext({
        planId: VALID_PLAN_ID,
        moduleId: VALID_MODULE_ID,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({ error: 'Module not found.' });
  });

  it("returns 404 for another user's module", async () => {
    const ownerUserId = await authenticateTestUser('owner');
    await seedOwnedPlanForStatusApi(ownerUserId);
    await seedOwnedModule('ready');

    const otherAuthUserId = buildTestAuthUserId('lesson-status-api-other');
    setTestUser(otherAuthUserId);
    await ensureUser({
      authUserId: otherAuthUserId,
      email: buildTestEmail(otherAuthUserId),
      subscriptionTier: 'starter',
    });

    const response = await GET(
      createRequest(),
      buildRouteHandlerContext({
        planId: VALID_PLAN_ID,
        moduleId: VALID_MODULE_ID,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({ error: 'Module not found.' });
  });

  it('returns 404 when the module belongs to a different owned plan', async () => {
    const userId = await authenticateTestUser('wrong-plan');
    await seedOwnedPlanForStatusApi(userId);
    await db.insert(learningPlans).values({
      id: OTHER_PLAN_ID,
      userId,
      topic: 'Other owned plan',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      generationStatus: 'ready',
    });
    await seedOwnedModule('ready');

    const response = await GET(
      createRequest(OTHER_PLAN_ID, VALID_MODULE_ID),
      buildRouteHandlerContext({
        planId: OTHER_PLAN_ID,
        moduleId: VALID_MODULE_ID,
      }),
    );

    expect(response.status).toBe(404);
  });

  it('rejects invalid UUID params', async () => {
    await authenticateTestUser('invalid-param');

    const response = await GET(
      createRequest('not-a-uuid', VALID_MODULE_ID),
      buildRouteHandlerContext({
        planId: 'not-a-uuid',
        moduleId: VALID_MODULE_ID,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid planId format.');
  });

  it('returns canonical unauthorized response without calling the read boundary', async () => {
    clearTestUser();

    const response = await GET(
      createRequest(),
      buildRouteHandlerContext({
        planId: VALID_PLAN_ID,
        moduleId: VALID_MODULE_ID,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
  });

  it('keeps service-role imports out of the user-facing route', () => {
    const routeSource = readFileSync(
      join(
        process.cwd(),
        'src/app/api/v1/plans/[planId]/modules/[moduleId]/lesson-content/status/route.ts',
      ),
      'utf8',
    );

    expect(routeSource).not.toContain('@supabase/service-role');
  });
});
