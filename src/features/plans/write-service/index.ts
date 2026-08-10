import { ConflictError, NotFoundError } from '@/lib/api/errors';
import { deletePlan, type DeletePlanDbClient } from '@/lib/db/queries/plans';
import { db as serviceRoleDb } from '@supabase/service-role';

export type BulkRemovePlanFailureReason = 'not_found' | 'currently_generating';

export type BulkRemovePlanResult =
  | { planId: string; success: true }
  | {
      planId: string;
      success: false;
      reason: BulkRemovePlanFailureReason;
      message: string;
    };

const REMOVE_PLAN_FAILURE_MESSAGES: Record<
  BulkRemovePlanFailureReason,
  string
> = {
  not_found: 'Learning plan not found.',
  currently_generating: 'Cannot delete a plan that is currently generating.',
};

/**
 * Deletes a user-owned plan through the feature service boundary so route
 * handlers do not reach into the query layer directly.
 */
export async function removePlanForWrite(params: {
  planId: string;
  userId: string;
}): Promise<void> {
  const result = await deletePlan(params.planId, params.userId);

  if (result.success) {
    return;
  }

  if (result.reason === 'not_found') {
    throw new NotFoundError(REMOVE_PLAN_FAILURE_MESSAGES.not_found);
  }

  throw new ConflictError(REMOVE_PLAN_FAILURE_MESSAGES.currently_generating);
}

async function removePlanForBulkWrite(params: {
  planId: string;
  userId: string;
  dbClient: DeletePlanDbClient;
}): Promise<BulkRemovePlanResult> {
  const result = await deletePlan(
    params.planId,
    params.userId,
    params.dbClient,
  );

  if (result.success) {
    return { planId: params.planId, success: true };
  }

  return {
    planId: params.planId,
    success: false,
    reason: result.reason,
    message: REMOVE_PLAN_FAILURE_MESSAGES[result.reason],
  };
}

export async function removePlansForWrite(params: {
  planIds: string[];
  userId: string;
}): Promise<BulkRemovePlanResult[]> {
  return serviceRoleDb.transaction(async (tx) => {
    const orderedPlanIds = params.planIds
      .map((planId, index) => ({ planId, index }))
      .sort((left, right) => {
        const leftKey = left.planId.toLowerCase();
        const rightKey = right.planId.toLowerCase();
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      });
    const results = new Array<BulkRemovePlanResult>(params.planIds.length);
    for (const { planId, index } of orderedPlanIds) {
      results[index] = await removePlanForBulkWrite({
        planId,
        userId: params.userId,
        dbClient: tx,
      });
    }
    return results;
  });
}
