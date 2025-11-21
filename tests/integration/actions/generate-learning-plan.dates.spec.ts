import { beforeEach, describe, expect, it } from 'vitest';

import { generateLearningPlan } from '@/app/plans/actions';
import { db } from '@/lib/db/service-role';
import { learningPlans } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

import {
  ensureUser,
  resetDbForIntegrationTestFile,
} from '../../helpers/db';
import {
  buildTestClerkUserId,
  buildTestEmail,
} from '../../helpers/testIds';

describe('Server Action: generateLearningPlan (dates parity)', () => {
  beforeEach(async () => {
    await resetDbForIntegrationTestFile();
    process.env.AI_PROVIDER = 'mock';
    process.env.AI_USE_MOCK = 'true';
    // Deflake: ensure mock provider does not randomly fail
    process.env.MOCK_GENERATION_FAILURE_RATE = '0';
    // Speed up: reduce mock generation delay for faster tests
    process.env.MOCK_GENERATION_DELAY_MS = '100';
  });

  it('persists startDate and deadlineDate when provided', async () => {
    const clerkUserId = buildTestClerkUserId('generate-plan-dates-both');
    await ensureUser({
      clerkUserId,
      email: buildTestEmail(clerkUserId),
    });
    process.env.DEV_CLERK_USER_ID = clerkUserId;

    const startDate = '2025-11-01';
    const deadlineDate = '2025-12-15';

    const res = await generateLearningPlan({
      topic: 'React',
      skillLevel: 'beginner',
      learningStyle: 'mixed',
      weeklyHours: 4,
      startDate,
      deadlineDate,
      notes: null,
    });

    // Debug output on failure to aid investigation
    if (res.status !== 'success') {
      console.error('generateLearningPlan failure:', res.error);
    }
    expect(res.status).toBe('success');
    expect(res.planId).toBeTruthy();

    const [plan] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, res.planId));

    expect(plan?.startDate).toBe(startDate);
    expect(plan?.deadlineDate).toBe(deadlineDate);
  });

  it('allows omitted startDate (null) while keeping deadlineDate', async () => {
    const clerkUserId = buildTestClerkUserId('generate-plan-dates-deadline-only');
    await ensureUser({
      clerkUserId,
      email: buildTestEmail(clerkUserId),
    });
    process.env.DEV_CLERK_USER_ID = clerkUserId;

    const deadlineDate = '2075-12-15';

    const res = await generateLearningPlan({
      topic: 'TypeScript',
      skillLevel: 'intermediate',
      learningStyle: 'reading',
      weeklyHours: 6,
      // startDate omitted
      deadlineDate,
      notes: null,
    });

    expect(res.status).toBe('success');
    expect(res.planId).toBeTruthy();

    const [plan] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, res.planId));

    expect(plan?.startDate).toBeNull();
    expect(plan?.deadlineDate).toBe(deadlineDate);
  });
});
