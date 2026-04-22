import type { OwnedPlanRecord } from '@/lib/db/queries/helpers/plans-helpers';

import { createId } from './ids';

const BASE_DATE = new Date('2025-01-01T00:00:00.000Z');

/**
 * Builds an in-memory owned plan row for unit tests.
 * Keeps OwnedPlanRecord defaults centralized so query-shape changes stay in one place.
 */
export function createTestPlan(
	overrides: Partial<OwnedPlanRecord> = {},
): OwnedPlanRecord {
	return {
		id: createId('plan'),
		userId: createId('user'),
		topic: 'Test Topic',
		skillLevel: 'beginner',
		weeklyHours: 5,
		learningStyle: 'reading',
		startDate: null,
		deadlineDate: null,
		visibility: 'private',
		origin: 'ai',
		generationStatus: 'ready',
		isQuotaEligible: false,
		finalizedAt: null,
		createdAt: BASE_DATE,
		updatedAt: BASE_DATE,
		...overrides,
	} satisfies OwnedPlanRecord;
}
