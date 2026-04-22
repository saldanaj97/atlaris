import { PlanPersistenceAdapter } from '@/features/plans/lifecycle/adapters/plan-persistence-adapter';
import type { PlanInsertData } from '@/features/plans/lifecycle/types';
import type { DbClient } from '@/lib/db/types';

/** Unwrap {@link PlanPersistenceAdapter.atomicInsertPlan} for tests that expect throws on limit. */
export async function atomicInsertPlanOrThrow(
	db: DbClient,
	userId: string,
	planData: PlanInsertData,
): Promise<{ id: string }> {
	const adapter = new PlanPersistenceAdapter(db);
	const result = await adapter.atomicInsertPlan(userId, planData);
	if (result.success) {
		return { id: result.id };
	}
	throw new Error(result.reason);
}
