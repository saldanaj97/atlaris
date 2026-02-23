import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import { generationAttempts } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { createTestPlan } from '../../fixtures/plans';
import { setTestUser } from '../../helpers/auth';
import { ensureUser, resetDbForIntegrationTestFile } from '../../helpers/db';
import { createMockProvider } from '../../helpers/mockProvider';
import { createRlsDbForUser } from '../../helpers/rls';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';

/**
 * This test uses application path to insert an attempt via orchestrator
 * while authenticated as a user that does NOT own the plan. RLS should block
 * the INSERT into generation_attempts (policy requires ownership).
 */

describe('RLS attempt insertion', () => {
  beforeEach(async () => {
    await resetDbForIntegrationTestFile();
  });

  it('blocks attempt insertion for non-owner user', async () => {
    const ownerAuthUserId = buildTestAuthUserId('rls-insert-owner');
    const attackerAuthUserId = buildTestAuthUserId('rls-insert-attacker');

    // Owner user + plan
    setTestUser(ownerAuthUserId);
    const ownerId = await ensureUser({
      authUserId: ownerAuthUserId,
      email: buildTestEmail(ownerAuthUserId),
    });

    const plan = await createTestPlan({
      userId: ownerId,
      topic: 'Insert Protection Plan',
      skillLevel: 'beginner',
      weeklyHours: 3,
      learningStyle: 'reading',
      origin: 'ai',
    });

    // Different user tries to run attempt
    setTestUser(attackerAuthUserId);
    const attackerId = await ensureUser({
      authUserId: attackerAuthUserId,
      email: buildTestEmail(attackerAuthUserId),
    });

    const mock = createMockProvider({ scenario: 'success' });
    const rlsDb = await createRlsDbForUser(attackerAuthUserId);
    let error: unknown = null;
    try {
      await runGenerationAttempt(
        {
          planId: plan.id,
          // attacker userId (does not own plan)
          userId: attackerId,
          input: {
            topic: 'Insert Protection Plan',
            notes: 'Should not succeed',
            skillLevel: 'beginner',
            weeklyHours: 3,
            learningStyle: 'reading',
          },
        },
        { provider: mock.provider, dbClient: rlsDb }
      );
    } catch (e) {
      error = e;
    }

    // Expect an RLS/permission-denied error or plan ownership check error.
    // We accept both: (1) RLS blocking the INSERT (permission denied / 42501), and
    // (2) app-level "not found or inaccessible" when the orchestrator rejects
    // before the DB (e.g. plan ownership mismatch). Both are valid guards
    // for "non-owner cannot create attempt."
    expect(error).toBeTruthy();
    const err = error as Error & { code?: string; cause?: unknown };
    const msg = err.message ?? '';
    const causeMsg = (err.cause as Error)?.message ?? '';
    const combinedMsg = `${msg} ${causeMsg}`;
    const hasPermissionCode =
      err.code === '42501' ||
      (err.cause as { code?: string })?.code === '42501';
    const hasPermissionMessage =
      /permission denied|row[- ]level security|not found or inaccessible/i.test(
        combinedMsg
      );
    expect(
      hasPermissionCode || hasPermissionMessage,
      `Expected RLS/permission-denied error but got: ${msg}${causeMsg ? ` (cause: ${causeMsg})` : ''}`
    ).toBe(true);

    const attempts = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, plan.id));
    expect(attempts.length).toBe(0);
  });

  it('owner can insert attempt', async () => {
    const ownerAuthUserId = buildTestAuthUserId('rls-insert-owner-pos');
    setTestUser(ownerAuthUserId);
    const ownerId = await ensureUser({
      authUserId: ownerAuthUserId,
      email: buildTestEmail(ownerAuthUserId),
    });

    const plan = await createTestPlan({
      userId: ownerId,
      topic: 'Owner Insert Plan',
      skillLevel: 'beginner',
      weeklyHours: 3,
      learningStyle: 'reading',
      origin: 'ai',
    });

    const mock = createMockProvider({ scenario: 'success' });
    const rlsDb = await createRlsDbForUser(ownerAuthUserId);

    const planId = await runGenerationAttempt(
      {
        planId: plan.id,
        userId: ownerId,
        input: {
          topic: 'Owner Insert Plan',
          notes: 'Should succeed',
          skillLevel: 'beginner',
          weeklyHours: 3,
          learningStyle: 'reading',
        },
      },
      { provider: mock.provider, dbClient: rlsDb }
    );

    expect(planId).toBe(plan.id);

    const attempts = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, plan.id));
    expect(attempts.length).toBe(1);
    expect(attempts[0]?.status).toBe('success');
  });
});
