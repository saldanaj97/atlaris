import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';
import { POST } from '@/app/api/v1/plans/bulk-delete/route';
import { learningPlans } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { eq, inArray } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

function buildBulkDeleteRequest(
  planIds: string[],
  options: { body?: string } = {},
) {
  return new Request('http://localhost/api/v1/plans/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ?? JSON.stringify({ planIds }),
  });
}

function buildPlanValues(
  userId: string,
  topic: string,
  generationStatus: 'ready' | 'failed' | 'pending_retry' | 'generating',
) {
  return {
    userId,
    topic,
    skillLevel: 'beginner' as const,
    weeklyHours: 4,
    learningStyle: 'reading' as const,
    visibility: 'private' as const,
    origin: 'ai' as const,
    generationStatus,
  };
}

describe('POST /api/v1/plans/bulk-delete', () => {
  const ownerAuthId = buildTestAuthUserId('plan-bulk-delete-owner');
  const ownerEmail = buildTestEmail(ownerAuthId);

  it('deletes multiple owned ready plans and returns per-plan results', async () => {
    setTestUser(ownerAuthId);
    const ownerId = await ensureUser({
      authUserId: ownerAuthId,
      email: ownerEmail,
    });

    const plans = await db
      .insert(learningPlans)
      .values([
        {
          userId: ownerId,
          topic: 'Bulk Delete One',
          skillLevel: 'beginner',
          weeklyHours: 4,
          learningStyle: 'reading',
          visibility: 'private',
          origin: 'ai',
          generationStatus: 'ready',
        },
        {
          userId: ownerId,
          topic: 'Bulk Delete Two',
          skillLevel: 'beginner',
          weeklyHours: 4,
          learningStyle: 'reading',
          visibility: 'private',
          origin: 'ai',
          generationStatus: 'ready',
        },
      ])
      .returning();

    const response = await POST(
      buildBulkDeleteRequest(plans.map((plan) => plan.id)),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      deletedCount: 2,
      failedCount: 0,
    });
    expect(body.results).toEqual(
      expect.arrayContaining([
        { planId: plans[0].id, success: true },
        { planId: plans[1].id, success: true },
      ]),
    );

    const remaining = await db
      .select({ id: learningPlans.id })
      .from(learningPlans)
      .where(
        inArray(
          learningPlans.id,
          plans.map((plan) => plan.id),
        ),
      );
    expect(remaining).toHaveLength(0);
  });

  it('returns partial failures when some plans cannot be deleted', async () => {
    setTestUser(ownerAuthId);
    const ownerId = await ensureUser({
      authUserId: ownerAuthId,
      email: ownerEmail,
    });

    const [deletablePlan, generatingPlan] = await db
      .insert(learningPlans)
      .values([
        {
          userId: ownerId,
          topic: 'Bulk Partial Ready',
          skillLevel: 'beginner',
          weeklyHours: 4,
          learningStyle: 'reading',
          visibility: 'private',
          origin: 'ai',
          generationStatus: 'ready',
        },
        {
          userId: ownerId,
          topic: 'Bulk Partial Generating',
          skillLevel: 'beginner',
          weeklyHours: 4,
          learningStyle: 'reading',
          visibility: 'private',
          origin: 'ai',
          generationStatus: 'generating',
        },
      ])
      .returning();

    const response = await POST(
      buildBulkDeleteRequest([deletablePlan.id, generatingPlan.id]),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      deletedCount: 1,
      failedCount: 1,
    });
    expect(body.results).toEqual(
      expect.arrayContaining([
        { planId: deletablePlan.id, success: true },
        {
          planId: generatingPlan.id,
          success: false,
          reason: 'currently_generating',
          message: 'Cannot delete a plan that is currently generating.',
        },
      ]),
    );

    const remaining = await db
      .select({ id: learningPlans.id })
      .from(learningPlans)
      .where(eq(learningPlans.id, generatingPlan.id));
    expect(remaining).toHaveLength(1);
  });

  it('deletes owned failed and pending_retry plans', async () => {
    setTestUser(ownerAuthId);
    const ownerId = await ensureUser({
      authUserId: ownerAuthId,
      email: ownerEmail,
    });

    const plans = await db
      .insert(learningPlans)
      .values([
        buildPlanValues(ownerId, 'Bulk Failed Plan', 'failed'),
        buildPlanValues(ownerId, 'Bulk Pending Retry Plan', 'pending_retry'),
      ])
      .returning();

    const response = await POST(
      buildBulkDeleteRequest(plans.map((plan) => plan.id)),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      deletedCount: 2,
      failedCount: 0,
    });

    const remaining = await db
      .select({ id: learningPlans.id })
      .from(learningPlans)
      .where(
        inArray(
          learningPlans.id,
          plans.map((plan) => plan.id),
        ),
      );
    expect(remaining).toHaveLength(0);
  });

  it('returns not_found for an unowned plan without deleting it', async () => {
    const otherAuthId = buildTestAuthUserId('plan-bulk-delete-other');
    setTestUser(ownerAuthId);
    const ownerId = await ensureUser({
      authUserId: ownerAuthId,
      email: ownerEmail,
    });
    await ensureUser({
      authUserId: otherAuthId,
      email: buildTestEmail(otherAuthId),
    });

    const [ownedPlan] = await db
      .insert(learningPlans)
      .values([buildPlanValues(ownerId, 'Owned Plan', 'ready')])
      .returning();

    setTestUser(otherAuthId);
    const response = await POST(buildBulkDeleteRequest([ownedPlan.id]));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: false,
      deletedCount: 0,
      failedCount: 1,
    });
    expect(body.results).toEqual([
      {
        planId: ownedPlan.id,
        success: false,
        reason: 'not_found',
        message: 'Learning plan not found.',
      },
    ]);

    const remaining = await db
      .select({ id: learningPlans.id })
      .from(learningPlans)
      .where(eq(learningPlans.id, ownedPlan.id));
    expect(remaining).toHaveLength(1);
  });

  it('returns 400 for invalid bulk delete payloads', async () => {
    setTestUser(ownerAuthId);
    await ensureUser({
      authUserId: ownerAuthId,
      email: ownerEmail,
    });

    const emptyResponse = await POST(buildBulkDeleteRequest([]));
    expect(emptyResponse.status).toBe(400);

    const invalidResponse = await POST(buildBulkDeleteRequest(['not-a-uuid']));
    expect(invalidResponse.status).toBe(400);

    const tooManyIds = Array.from({ length: 21 }, () => crypto.randomUUID());
    const tooManyResponse = await POST(buildBulkDeleteRequest(tooManyIds));
    expect(tooManyResponse.status).toBe(400);

    const repeatedId = crypto.randomUUID();
    const tooManyRawIdsResponse = await POST(
      buildBulkDeleteRequest(Array.from({ length: 21 }, () => repeatedId)),
    );
    expect(tooManyRawIdsResponse.status).toBe(400);

    const malformedResponse = await POST(
      buildBulkDeleteRequest([], { body: '{not-json' }),
    );
    expect(malformedResponse.status).toBe(400);
  });
});
