import { expectRlsViolation } from './rls-test-helpers';
import { countGenerationBudgetCutsForModule } from '@/lib/db/queries/plan-ai-budget';
import { generationBudgetCuts } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestModule } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { truncateAll } from '@tests/helpers/db/truncate';
import { ensureUser } from '@tests/helpers/db/users';
import {
  cleanupTrackedRlsClients,
  createRlsDbForUser,
} from '@tests/helpers/rls';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('generation budget cut RLS', () => {
  beforeEach(async () => {
    await cleanupTrackedRlsClients();
    await truncateAll();
  });

  afterEach(async () => {
    await cleanupTrackedRlsClients();
  });

  it('generation_budget_cuts: owners read, others see nothing, nobody writes', async () => {
    const ownerAuthUserId = buildTestAuthUserId('budget-cut-rls');
    const ownerUserId = await ensureUser({
      authUserId: ownerAuthUserId,
      email: buildTestEmail(ownerAuthUserId),
    });
    const otherAuthUserId = buildTestAuthUserId('budget-cut-rls-other');
    await ensureUser({
      authUserId: otherAuthUserId,
      email: buildTestEmail(otherAuthUserId),
    });
    const plan = await createTestPlan({ userId: ownerUserId });
    const module = await createTestModule({ planId: plan.id });
    const ownerDb = await createRlsDbForUser(ownerAuthUserId);
    const otherDb = await createRlsDbForUser(otherAuthUserId);
    const cut = {
      planId: plan.id,
      moduleId: module.id,
      step: 'repair' as const,
      pass: 2,
      spentMicrousd: 2_100_000,
      ceilingMicrousd: 2_500_000,
    };
    const [inserted] = await db
      .insert(generationBudgetCuts)
      .values(cut)
      .returning();
    if (!inserted) throw new Error('Expected budget cut');

    await expect(
      countGenerationBudgetCutsForModule(plan.id, module.id, ownerDb),
    ).resolves.toBe(1);
    await expect(
      countGenerationBudgetCutsForModule(plan.id, module.id, otherDb),
    ).resolves.toBe(0);
    await expect(otherDb.select().from(generationBudgetCuts)).resolves.toEqual(
      [],
    );

    await expectRlsViolation(() =>
      ownerDb.insert(generationBudgetCuts).values(cut),
    );
    await expectRlsViolation(() =>
      ownerDb
        .update(generationBudgetCuts)
        .set({ spentMicrousd: 0 })
        .where(eq(generationBudgetCuts.id, inserted.id)),
    );
    await expectRlsViolation(() =>
      ownerDb
        .delete(generationBudgetCuts)
        .where(eq(generationBudgetCuts.id, inserted.id)),
    );
  });
});
