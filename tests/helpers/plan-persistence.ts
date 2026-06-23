import type { PlanInsertData } from '@/features/plans/lifecycle/types';
import type { DbClient } from '@/lib/db/types';

import { atomicCheckAndInsertPlan } from '@/features/plans/lifecycle/plan-persistence-store';

/** Unwrap plan insertion results for tests that expect throws on limit. */
export async function atomicInsertPlanOrThrow(
  db: DbClient,
  userId: string,
  planData: PlanInsertData,
): Promise<{ id: string }> {
  const result = await atomicCheckAndInsertPlan(userId, planData, db);
  if (result.status === 'created') {
    return { id: result.id };
  }
  if (result.status === 'duplicate') {
    throw new Error(`Duplicate plan: ${result.existingPlanId}`);
  }
  throw new Error('Plan limit reached for current subscription tier');
}
