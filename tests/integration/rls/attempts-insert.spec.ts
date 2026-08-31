import { createTestPlan } from '../../fixtures/plans';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db/users';
import {
  buildTestProcessGenerationInput,
  processTestGenerationAttempt,
} from '../../helpers/process-generation-attempt';
import { createRlsDbForUser } from '../../helpers/rls';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';
import { reserveAttemptSlot } from '@/lib/db/queries/attempts';
import { generationAttempts } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Non-owner: reserveAttemptSlot through an RLS-scoped client.
 * Owner: production lifecycle processGenerationAttempt via service-role.
 */

describe('RLS attempt insertion', () => {
  beforeAll(() => {
    vi.stubEnv('AI_PROVIDER', 'mock');
    vi.stubEnv('MOCK_AI_SCENARIO', 'success');
    vi.stubEnv('MOCK_GENERATION_DELAY_MS', '0');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('blocks attempt insertion for non-owner user', async () => {
    const ownerAuthUserId = buildTestAuthUserId('rls-insert-owner');
    const attackerAuthUserId = buildTestAuthUserId('rls-insert-attacker');

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

    setTestUser(attackerAuthUserId);
    const attackerId = await ensureUser({
      authUserId: attackerAuthUserId,
      email: buildTestEmail(attackerAuthUserId),
    });

    const rlsDb = await createRlsDbForUser(attackerAuthUserId);
    let error: unknown = null;
    try {
      await reserveAttemptSlot({
        planId: plan.id,
        userId: attackerId,
        generationPurpose: 'initial',
        input: {
          topic: 'Insert Protection Plan',
          notes: 'Should not succeed',
          skillLevel: 'beginner',
          weeklyHours: 3,
          learningStyle: 'reading',
        },
        dbClient: rlsDb,
      });
    } catch (e) {
      error = e;
    }

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
        combinedMsg,
      );
    expect(
      hasPermissionCode || hasPermissionMessage,
      `Expected RLS/permission-denied error but got: ${msg}${causeMsg ? ` (cause: ${causeMsg})` : ''}`,
    ).toBe(true);

    const attempts = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, plan.id));
    expect(attempts.length).toBe(0);
  });

  it('server-owned generation path can insert an owned attempt', async () => {
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

    const result = await processTestGenerationAttempt(
      buildTestProcessGenerationInput({
        planId: plan.id,
        userId: ownerId,
        topic: 'Owner Insert Plan',
        notes: 'Should succeed',
        skillLevel: 'beginner',
        weeklyHours: 3,
        learningStyle: 'reading',
      }),
    );

    expect(result.status).toBe('generation_success');

    const attempts = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, plan.id));
    expect(attempts.length).toBe(1);
    expect(attempts[0]?.status).toBe('success');
  });
});
