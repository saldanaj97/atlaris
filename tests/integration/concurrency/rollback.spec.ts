import { makeCanonicalUsage } from '../../fixtures/canonical-usage.factory';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db/users';
import { commitPlanGenerationSuccess } from '@/features/plans/lifecycle/generation-finalization/store';
import { reserveAttemptSlot } from '@/lib/db/queries/attempts';
import { learningPlans, modules, tasks } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

/**
 * Injects a failure after attempt persist so the single finalization
 * transaction rolls back modules/tasks (plan stays generating).
 */

describe('Concurrency - rollback on DB error', () => {
  it('rolls back modules/tasks when an error occurs mid-transaction', async () => {
    setTestUser('rollback_user');
    const userId = await ensureUser({
      authUserId: 'rollback_user',
      email: 'rollback_user@example.com',
    });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Rollback Plan',
        skillLevel: 'beginner',
        weeklyHours: 2,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    const reservation = await reserveAttemptSlot({
      planId: plan.id,
      userId,
      input: {
        topic: 'Rollback Plan',
        skillLevel: 'beginner',
        weeklyHours: 2,
        learningStyle: 'reading',
      },
      generationPurpose: 'initial',
      dbClient: db,
    });
    if (!reservation.reserved) {
      throw new Error(`Expected reservation, got ${reservation.reason}`);
    }

    await expect(
      commitPlanGenerationSuccess(
        db,
        {
          planId: plan.id,
          userId,
          attemptId: reservation.attemptId,
          preparation: reservation,
          modules: [
            {
              title: 'Rollback Mod',
              description: undefined,
              estimatedMinutes: 10,
              tasks: [],
            },
          ],
          providerMetadata: {},
          usage: makeCanonicalUsage(),
          durationMs: 100,
          extendedTimeout: false,
          usageKind: 'plan',
          generationPurpose: 'initial',
        },
        {
          afterSuccessfulAttemptPersist: () => {
            throw new Error('Injected failure after attempt persist');
          },
        },
      ),
    ).rejects.toThrow('Injected failure after attempt persist');

    const moduleRows = await db
      .select()
      .from(modules)
      .where(eq(modules.planId, plan.id));
    const taskRows = await db
      .select()
      .from(tasks)
      .innerJoin(modules, eq(tasks.moduleId, modules.id))
      .where(eq(modules.planId, plan.id));
    expect(moduleRows.length).toBe(0);
    expect(taskRows.length).toBe(0);
  });
});
