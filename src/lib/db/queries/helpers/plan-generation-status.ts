import { eq } from 'drizzle-orm';

import { learningPlans } from '@/lib/db/schema';
import type { DbClient } from '@/lib/db/types';

type LearningPlanInsert = typeof learningPlans.$inferInsert;

// ─── Shared insert defaults ─────────────────────────────────────

/**
 * Default column values applied when a learning plan enters the `generating`
 * state for the first time (INSERT in {@link atomicCheckAndInsertPlan}).
 *
 * `isQuotaEligible` starts as `false` and flips to `true` only after
 * generation succeeds ({@link markPlanGenerationSuccess}).
 */
export const PLAN_GENERATING_INSERT_DEFAULTS = {
	generationStatus: 'generating',
	isQuotaEligible: false,
} as const satisfies Pick<
	LearningPlanInsert,
	'generationStatus' | 'isQuotaEligible'
>;

// ─── UPDATE helper ──────────────────────────────────────────────

type PlanStatusUpdateClient = Pick<DbClient, 'update'>;

/**
 * Transitions a learning plan to the `generating` state.
 *
 * Called from {@link reserveAttemptSlot} inside its advisory-lock
 * transaction. On the first creation attempt this is idempotent (plan is
 * already `generating` from the INSERT). On retries it transitions from
 * `failed` / `pending_retry` → `generating`.
 *
 * Only touches `generationStatus` and `updatedAt` — callers retain full
 * control of transaction boundaries, advisory locks, and JWT claim
 * reapplication.
 */
export async function setLearningPlanGenerating(
	tx: PlanStatusUpdateClient,
	params: { planId: string; updatedAt: Date },
): Promise<void> {
	await tx
		.update(learningPlans)
		.set({
			generationStatus: 'generating',
			updatedAt: params.updatedAt,
		})
		.where(eq(learningPlans.id, params.planId));
}
