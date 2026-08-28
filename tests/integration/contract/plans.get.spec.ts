import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';
import { GET } from '@/app/api/v1/plans/[planId]/route';
import { learningPlans, modules, tasks, users } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { buildRouteHandlerContext } from '@tests/helpers/route-handler-context';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

function buildRequest(planId: string) {
  return {
    request: new Request(`http://localhost/api/v1/plans/${planId}`, {
      method: 'GET',
    }),
    context: buildRouteHandlerContext({ planId }),
  };
}

describe('GET /api/v1/plans/:planId', () => {
  const ownerAuthId = buildTestAuthUserId('plan-detail-owner');
  const ownerEmail = buildTestEmail(ownerAuthId);

  it('returns plan detail with ordered modules and tasks for owner', async () => {
    setTestUser(ownerAuthId);
    const ownerId = await ensureUser({
      authUserId: ownerAuthId,
      email: ownerEmail,
    });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: ownerId,
        topic: 'Detail Plan',
        skillLevel: 'advanced',
        weeklyHours: 8,
        learningStyle: 'practice',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    const insertedModules = await db
      .insert(modules)
      .values([
        {
          planId: plan.id,
          order: 1,
          title: 'Module 1',
          description: 'Intro',
          estimatedMinutes: 120,
        },
        {
          planId: plan.id,
          order: 2,
          title: 'Module 2',
          description: 'Deep Dive',
          estimatedMinutes: 90,
        },
      ])
      .returning();

    await db.insert(tasks).values([
      {
        moduleId: insertedModules[0].id,
        order: 1,
        title: 'Task 1',
        description: 'First task',
        estimatedMinutes: 30,
      },
      {
        moduleId: insertedModules[0].id,
        order: 2,
        title: 'Task 2',
        description: 'Second task',
        estimatedMinutes: 45,
      },
      {
        moduleId: insertedModules[1].id,
        order: 1,
        title: 'Task 3',
        description: 'Third task',
        estimatedMinutes: 60,
      },
    ]);

    const { request, context } = buildRequest(plan.id);
    const response = await GET(request, context);
    expect(response.status).toBe(200);

    const detail = await response.json();
    expect(detail).toMatchObject({
      id: plan.id,
      topic: 'Detail Plan',
    });
    expect(detail.modules).toHaveLength(2);
    expect(detail.modules[0].tasks).toHaveLength(2);
    expect(detail.modules[1].tasks).toHaveLength(1);
  });

  it('returns 404 when plan does not exist or not owned by user', async () => {
    const nonOwnerAuthId = buildTestAuthUserId('plan-detail-non-owner');
    setTestUser(nonOwnerAuthId);
    await ensureUser({
      authUserId: nonOwnerAuthId,
      email: buildTestEmail(nonOwnerAuthId),
    });

    const { request, context } = buildRequest(
      '00000000-0000-0000-0000-000000000000',
    );
    const response = await GET(request, context);
    expect(response.status).toBe(404);
  });

  it('returns 404 when accessing plan owned by another user (cross-tenant protection)', async () => {
    // Create owner and their plan
    setTestUser(ownerAuthId);
    const ownerId = await ensureUser({
      authUserId: ownerAuthId,
      email: ownerEmail,
    });

    const [ownerPlan] = await db
      .insert(learningPlans)
      .values({
        userId: ownerId,
        topic: 'Owner Plan',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    // Try to access as a different user
    const attackerAuthId = buildTestAuthUserId('plan-detail-attacker');
    const attackerEmail = buildTestEmail(attackerAuthId);
    setTestUser(attackerAuthId);
    await ensureUser({
      authUserId: attackerAuthId,
      email: attackerEmail,
    });

    const { request, context } = buildRequest(ownerPlan.id);
    const response = await GET(request, context);
    expect(response.status).toBe(404);

    const error = await response.json();
    expect(error).toMatchObject({
      error: expect.stringContaining('not found'),
    });
  });

  it('returns 403 for an owned locked Free plan and 404 for a non-owned plan', async () => {
    const ownerAuth = buildTestAuthUserId('plan-detail-locked-owner');
    setTestUser(ownerAuth);
    const ownerId = await ensureUser({
      authUserId: ownerAuth,
      email: buildTestEmail(ownerAuth),
      subscriptionTier: 'free',
    });
    const selectedAt = new Date('2026-04-01T00:00:00.000Z');
    const [keepPlan] = await db
      .insert(learningPlans)
      .values({
        userId: ownerId,
        topic: 'Keep this plan',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();
    const [lockedPlan] = await db
      .insert(learningPlans)
      .values({
        userId: ownerId,
        topic: 'Locked plan internals',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();
    await db
      .update(users)
      .set({
        initialPlanGeneratedAt: selectedAt,
        freeAccessPlanId: keepPlan.id,
        freeAccessPlanSelectedAt: selectedAt,
      })
      .where(eq(users.id, ownerId));

    const lockedResponse = await GET(
      buildRequest(lockedPlan.id).request,
      buildRequest(lockedPlan.id).context,
    );
    expect(lockedResponse.status).toBe(403);
    await expect(lockedResponse.json()).resolves.toMatchObject({
      error: 'Upgrade to access this plan.',
      code: 'PLAN_ENTITLEMENT_REQUIRED',
    });

    const selectedResponse = await GET(
      buildRequest(keepPlan.id).request,
      buildRequest(keepPlan.id).context,
    );
    expect(selectedResponse.status).toBe(200);

    const strangerAuth = buildTestAuthUserId('plan-detail-locked-stranger');
    setTestUser(strangerAuth);
    await ensureUser({
      authUserId: strangerAuth,
      email: buildTestEmail(strangerAuth),
    });
    const strangerResponse = await GET(
      buildRequest(lockedPlan.id).request,
      buildRequest(lockedPlan.id).context,
    );
    expect(strangerResponse.status).toBe(404);
  });
});
