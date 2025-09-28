import { describe, expect, it } from 'vitest';

import { GET } from '@/app/api/v1/plans/[planId]/route';
import { db } from '@/lib/db/drizzle';
import { learningPlans, modules, tasks } from '@/lib/db/schema';
import { ensureUser } from '../helpers/db';
import { setTestUser } from '../helpers/auth';

function buildRequest(planId: string) {
  return new Request(`http://localhost/api/v1/plans/${planId}`, {
    method: 'GET',
  });
}

describe('GET /api/v1/plans/:planId', () => {
  const ownerClerkId = 'clerk_plan_detail_owner';
  const ownerEmail = 'owner-detail@example.com';

  it('returns plan detail with ordered modules and tasks for owner', async () => {
    setTestUser(ownerClerkId);
    const ownerId = await ensureUser({
      clerkUserId: ownerClerkId,
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
    setTestUser('non-owner-uid');
    await ensureUser({
      clerkUserId: 'non-owner-uid',
      email: 'non-owner@example.com',
    });

    const response = await GET(buildRequest('00000000-0000-0000-0000-000000000000'));
    expect(response.status).toBe(404);
  });
});
