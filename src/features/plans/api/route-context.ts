import { NotFoundError, ValidationError } from '@/lib/api/errors';
import type { OwnedPlanRecord } from '@/lib/db/queries/helpers/plans-helpers';
import { selectOwnedPlanById } from '@/lib/db/queries/helpers/plans-helpers';
import { getDb } from '@/lib/db/runtime';
import type { DbClient } from '@/lib/db/types';

export type PlansDbClient = DbClient;

type LearningPlanRecord = OwnedPlanRecord;

function getPlanIdFromUrl(
	req: Request,
	position: 'last' | 'second-to-last' = 'last',
): string | undefined {
	const url = new URL(req.url);
	const segments = url.pathname.split('/').filter(Boolean);

	return position === 'last'
		? segments[segments.length - 1]
		: segments[segments.length - 2];
}

function isUuid(value: string): boolean {
	return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
		value,
	);
}

export function requirePlanIdFromRequest(
	req: Request,
	position: 'last' | 'second-to-last' = 'second-to-last',
): string {
	const planId = getPlanIdFromUrl(req, position);
	if (!planId) {
		throw new ValidationError('Plan id is required in the request path.');
	}
	if (!isUuid(planId)) {
		throw new ValidationError('Invalid plan id format.');
	}
	return planId;
}

export async function requireOwnedPlanById(params: {
	planId: string;
	ownerUserId: string;
	dbClient?: PlansDbClient;
}): Promise<LearningPlanRecord> {
	const dbClient = params.dbClient ?? getDb();
	const plan = await selectOwnedPlanById({
		planId: params.planId,
		ownerUserId: params.ownerUserId,
		dbClient,
	});

	if (!plan) {
		throw new NotFoundError('Learning plan not found.');
	}

	return plan;
}
