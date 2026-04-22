import { and, count, eq, gte, min, type SQL } from 'drizzle-orm';
import type {
	UserGenerationAttemptsSinceParams,
	UserGenerationAttemptWindowStats,
} from '@/lib/db/queries/types/attempts.types';
import { generationAttempts, learningPlans } from '@/lib/db/schema';
import { PLAN_GENERATION_WINDOW_MS } from '@/shared/constants/generation';

function userAttemptsSincePredicate(
	userId: string,
	since: Date,
): SQL | undefined {
	return and(
		eq(learningPlans.userId, userId),
		gte(generationAttempts.createdAt, since),
	);
}

export async function selectUserGenerationAttemptWindowStats({
	userId,
	dbClient,
	since,
}: UserGenerationAttemptsSinceParams): Promise<UserGenerationAttemptWindowStats> {
	const [row] = await dbClient
		.select({
			value: count(generationAttempts.id),
			oldestCreatedAt: min(generationAttempts.createdAt),
		})
		.from(generationAttempts)
		.innerJoin(learningPlans, eq(generationAttempts.planId, learningPlans.id))
		.where(userAttemptsSincePredicate(userId, since));

	return {
		count: row?.value ?? 0,
		oldestAttemptCreatedAt: row?.oldestCreatedAt ?? null,
	};
}

export function computeRetryAfterSeconds(
	oldestAttemptCreatedAt: Date | null,
	now: Date,
): number {
	if (!oldestAttemptCreatedAt) {
		return Math.floor(PLAN_GENERATION_WINDOW_MS / 1000);
	}

	return Math.max(
		0,
		Math.floor(
			(oldestAttemptCreatedAt.getTime() +
				PLAN_GENERATION_WINDOW_MS -
				now.getTime()) /
				1000,
		),
	);
}
