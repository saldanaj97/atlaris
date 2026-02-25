import { AppError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { getPlanIdFromUrl, isUuid } from '@/lib/api/route-helpers';
import {
  selectOwnedPlanById,
  type OwnedPlanRecord,
} from '@/lib/db/queries/helpers/plans-helpers';
import type { DbUser } from '@/lib/db/queries/types/users.types';
import { getUserByAuthId } from '@/lib/db/queries/users';
import { getDb } from '@/lib/db/runtime';

export type PlansDbClient = ReturnType<typeof getDb>;

export type LearningPlanRecord = OwnedPlanRecord;

export function requirePlanIdFromRequest(
  req: Request,
  position: 'last' | 'second-to-last' = 'second-to-last'
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

export async function requireInternalUserByAuthId(
  authUserId: string,
  dbClient?: PlansDbClient
): Promise<DbUser> {
  const user = await getUserByAuthId(authUserId, dbClient);
  if (!user) {
    throw new AppError(
      'Authenticated user record missing despite provisioning.',
      { status: 500, code: 'INTERNAL_ERROR' }
    );
  }
  return user;
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
