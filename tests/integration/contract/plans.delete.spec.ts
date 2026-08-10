import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';
import { DELETE } from '@/app/api/v1/plans/[planId]/route';
import { learningPlans } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { buildRouteHandlerContext } from '@tests/helpers/route-handler-context';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

function buildDeleteRequest(planId: string) {
  return {
    request: new Request(`http://localhost/api/v1/plans/${planId}`, {
      method: 'DELETE',
    }),
    context: buildRouteHandlerContext({ planId }),
  };
}

describe('DELETE /api/v1/plans/:planId', () => {
  const ownerAuthId = buildTestAuthUserId('plan-delete-owner');
  const ownerEmail = buildTestEmail(ownerAuthId);

  it('deletes an owned ready plan through the API route', async () => {
    setTestUser(ownerAuthId);
    const ownerId = await ensureUser({
      authUserId: ownerAuthId,
      email: ownerEmail,
    });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: ownerId,
        topic: 'Deletable Plan',
        skillLevel: 'beginner',
        weeklyHours: 4,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
        generationStatus: 'ready',
      })
      .returning();

    const { request, context } = buildDeleteRequest(plan.id);
    const response = await DELETE(request, context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const remaining = await db
      .select({ id: learningPlans.id })
      .from(learningPlans)
      .where(eq(learningPlans.id, plan.id));
    expect(remaining).toHaveLength(0);
  });

  it('returns 409 when deleting a generating plan', async () => {
    setTestUser(ownerAuthId);
    const ownerId = await ensureUser({
      authUserId: ownerAuthId,
      email: ownerEmail,
    });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: ownerId,
        topic: 'Generating Plan',
        skillLevel: 'beginner',
        weeklyHours: 4,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
        generationStatus: 'generating',
      })
      .returning();

    const { request, context } = buildDeleteRequest(plan.id);
    const response = await DELETE(request, context);

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe('CONFLICT');
  });

  it('returns 404 when plan does not exist or is not owned', async () => {
    const otherAuthId = buildTestAuthUserId('plan-delete-other');
    setTestUser(otherAuthId);
    await ensureUser({
      authUserId: otherAuthId,
      email: buildTestEmail(otherAuthId),
    });

    setTestUser(ownerAuthId);
    const ownerId = await ensureUser({
      authUserId: ownerAuthId,
      email: ownerEmail,
    });

    const [ownedPlan] = await db
      .insert(learningPlans)
      .values({
        userId: ownerId,
        topic: 'Owned By Someone Else Context',
        skillLevel: 'beginner',
        weeklyHours: 4,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
        generationStatus: 'ready',
      })
      .returning();

    setTestUser(otherAuthId);
    const { request, context } = buildDeleteRequest(ownedPlan.id);
    const response = await DELETE(request, context);

    expect(response.status).toBe(404);
  });
});
