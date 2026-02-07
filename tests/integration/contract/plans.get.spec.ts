import { describe, expect, it } from 'vitest';

import { GET } from '@/app/api/v1/plans/[planId]/route';
import { db } from '@/lib/db/service-role';
import { learningPlans, modules, tasks } from '@/lib/db/schema';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';

function buildRequest(planId: string) {
  return new Request(`http://localhost/api/v1/plans/${planId}`, {
    method: 'GET',
  });
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

    const response = await GET(buildRequest(plan.id));
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

    const response = await GET(
      buildRequest('00000000-0000-0000-0000-000000000000')
    );
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

    const response = await GET(buildRequest(ownerPlan.id));
    expect(response.status).toBe(404);

    const error = await response.json();
    expect(error).toMatchObject({
      error: expect.stringContaining('not found'),
    });
  });
});
