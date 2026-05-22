import { NotFoundError, ValidationError } from '@/lib/api/errors';
import type { RouteParams } from '@/lib/api/types/auth.types';
import type { OwnedPlanRecord } from '@/lib/db/queries/helpers/plans-helpers';
import { selectOwnedPlanById } from '@/lib/db/queries/helpers/plans-helpers';
import type { DbClient } from '@/lib/db/types';
import { getDb } from '@supabase/runtime';

export type PlansDbClient = DbClient;

type LearningPlanRecord = OwnedPlanRecord;

function isUuid(value: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    value,
  );
}

export function requireUuidRouteParam(
  params: RouteParams,
  paramName: string,
): string {
  const value = params[paramName];
  if (typeof value !== 'string') {
    throw new ValidationError(`${paramName} is required in the request path.`);
  }
  if (!isUuid(value)) {
    throw new ValidationError(`Invalid ${paramName} format.`);
  }
  return value;
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
