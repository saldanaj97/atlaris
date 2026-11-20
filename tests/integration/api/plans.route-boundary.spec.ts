import { GET } from '@/app/api/v1/plans/[planId]/status/route';
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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serverAuth = vi.hoisted(() => {
  const getSession = vi.fn();
  return {
    getSession,
    module: () => ({ auth: { getSession } }),
  };
});
vi.mock('@/lib/auth/server', () => serverAuth.module());

describe('plans API route boundary (integration)', () => {
  const ownerAuthId = buildTestAuthUserId('plans-route-boundary-owner');
  let ownerUserId: string;
  let ownerPlanId: string;

  beforeEach(async () => {
    clearAllUserRateLimiters();
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
});
