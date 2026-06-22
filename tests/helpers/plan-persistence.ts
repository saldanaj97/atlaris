import type { PlanInsertData } from '@/features/plans/lifecycle/types';
import type { DbClient } from '@/lib/db/types';

import { PlanPersistenceAdapter } from '@/features/plans/lifecycle/adapters/plan-persistence-adapter';

/** Unwrap {@link PlanPersistenceAdapter.atomicInsertPlan} for tests that expect throws on limit. */
export async function atomicInsertPlanOrThrow(
  db: DbClient,
  userId: string,
  planData: PlanInsertData,
): Promise<{ id: string }> {
  const adapter = new PlanPersistenceAdapter(db);
  const result = await adapter.atomicInsertPlan(userId, planData);
  if (result.status === 'created') {
    return { id: result.id };
  }
  if (result.status === 'duplicate') {
    throw new Error(`Duplicate plan: ${result.existingPlanId}`);
  }
  throw new Error('Plan limit reached for current subscription tier');
}
