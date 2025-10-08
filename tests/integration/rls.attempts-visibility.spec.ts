import { describe, it, expect } from 'vitest';

import { db } from '@/lib/db/drizzle';
import {
  generationAttempts,
  learningPlans,
  modules as _modules,
  tasks as _tasks,
  users as _users,
} from '@/lib/db/schema';
import { setTestUser } from '../helpers/auth';
import { ensureUser } from '../helpers/db';
import { GET as GET_ATTEMPTS } from '@/app/api/v1/plans/[planId]/attempts/route';

async function createPlanWithAttempt({
  clerkUserId,
  email,
  topic = 'RLS Plan',
}: {
  clerkUserId: string;
  email: string;
  topic?: string;
}) {
  setTestUser(clerkUserId);
  const userId = await ensureUser({ clerkUserId, email });
  const [plan] = await db
    .insert(learningPlans)
    .values({
      userId,
      topic,
      skillLevel: 'beginner',
      weeklyHours: 4,
      learningStyle: 'reading',
      visibility: 'private',
      origin: 'ai',
    })
    .returning();

  // Insert one dummy attempt
  await db.insert(generationAttempts).values({
    planId: plan.id,
    status: 'failure',
    classification: 'timeout',
    durationMs: 1000,
    modulesCount: 0,
    tasksCount: 0,
    truncatedTopic: false,
    truncatedNotes: false,
    normalizedEffort: false,
    promptHash: null,
    metadata: null,
  });

  return { planId: plan.id, userId, clerkUserId };
}

describe('RLS attempt visibility', () => {
  it('allows owner to list attempts and denies other user', async () => {
    const owner = await createPlanWithAttempt({
      clerkUserId: 'rls_owner',
      email: 'rls_owner@example.com',
    });

    // Owner fetch
    setTestUser(owner.clerkUserId);
    const ownerResp = await GET_ATTEMPTS(
      new Request(`http://localhost/api/v1/plans/${owner.planId}/attempts`)
    );
    expect(ownerResp.status).toBe(200);
    const ownerPayload = await ownerResp.json();
    expect(Array.isArray(ownerPayload)).toBe(true);
    expect(ownerPayload.length).toBe(1);

    // Another user should not be able to see attempts for private plan
    setTestUser('rls_other');
    await ensureUser({
      clerkUserId: 'rls_other',
      email: 'rls_other@example.com',
    });

    const otherResp = await GET_ATTEMPTS(
      new Request(`http://localhost/api/v1/plans/${owner.planId}/attempts`)
    );
    // RLS should cause 404 (plan not found in authorized scope)
    expect(otherResp.status).toBe(404);
  });
});
