import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db/users';
import { learningPlans } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { mockServerSession } from '@tests/helpers/mock-server-auth';
import { buildRouteHandlerContext } from '@tests/helpers/route-handler-context';
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

describe('GET /api/v1/plans/:planId/status - access control', () => {
  let ownerUserId: string;
  let otherUserId: string;
  let ownerPlanId: string;
  const ownerAuthId = 'auth_status_owner';
  const otherAuthId = 'auth_status_other';

  beforeEach(async () => {
    // Mock Auth to return the owner by default
    mockServerSession(serverAuth.getSession, ownerAuthId);

    // Authenticate as owner for the route
    setTestUser(ownerAuthId);

    // Create owner and other users
    ownerUserId = await ensureUser({
      authUserId: ownerAuthId,
      email: 'status-owner@example.com',
    });
    otherUserId = await ensureUser({
      authUserId: otherAuthId,
      email: 'status-other@example.com',
    });

    // Create a plan for the owner
    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: ownerUserId,
        topic: 'RLS Status Plan',
        skillLevel: 'beginner',
        weeklyHours: 3,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();
    ownerPlanId = plan.id;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns status for the owner plan (allowed)', async () => {
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
    const body = await response.json();
    expect(body.planId).toBe(ownerPlanId);
    expect(['pending', 'processing', 'ready', 'failed']).toContain(body.status);
  });

  it("returns 404 for another user's plan (denied)", async () => {
    // Create a plan for the other user
    const [otherPlan] = await db
      .insert(learningPlans)
      .values({
        userId: otherUserId,
        topic: 'Other Plan',
        skillLevel: 'beginner',
        weeklyHours: 3,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    const { GET } = await import('@/app/api/v1/plans/[planId]/status/route');
    const request = new NextRequest(
      `http://localhost:3000/api/v1/plans/${otherPlan.id}/status`,
      { method: 'GET' },
    );
    const response = await GET(
      request,
      buildRouteHandlerContext({ planId: otherPlan.id }),
    );
    expect(response.status).toBe(404);
  });
});
