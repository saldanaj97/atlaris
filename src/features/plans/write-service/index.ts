import { ConflictError, NotFoundError } from '@/lib/api/errors';
import { deletePlan } from '@/lib/db/queries/plans';

export type BulkRemovePlanFailureReason =
  | 'not_found'
  | 'currently_generating'
  | 'unknown';

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
  unknown: 'Cannot delete learning plan in its current state.',
};

function normalizeRemovePlanFailureReason(
  reason: string,
): BulkRemovePlanFailureReason {
  return reason === 'not_found' || reason === 'currently_generating'
    ? reason
    : 'unknown';
}

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

  const reason = normalizeRemovePlanFailureReason(result.reason);

  if (reason === 'not_found') {
    throw new NotFoundError(REMOVE_PLAN_FAILURE_MESSAGES.not_found);
  }

  if (reason === 'currently_generating') {
    throw new ConflictError(REMOVE_PLAN_FAILURE_MESSAGES.currently_generating);
  }

  throw new ConflictError(REMOVE_PLAN_FAILURE_MESSAGES.unknown);
}

async function removePlanForBulkWrite(params: {
  planId: string;
  userId: string;
}): Promise<BulkRemovePlanResult> {
  try {
    const result = await deletePlan(params.planId, params.userId);

    if (result.success) {
      return { planId: params.planId, success: true };
    }

    const reason = normalizeRemovePlanFailureReason(result.reason);
    return {
      planId: params.planId,
      success: false,
      reason,
      message: REMOVE_PLAN_FAILURE_MESSAGES[reason],
    };
  } catch {
    return {
      planId: params.planId,
      success: false,
      reason: 'unknown',
      message: REMOVE_PLAN_FAILURE_MESSAGES.unknown,
    };
  }
}

export async function removePlansForWrite(params: {
  planIds: string[];
  userId: string;
}): Promise<BulkRemovePlanResult[]> {
  return Promise.all(
    params.planIds.map((planId) =>
      removePlanForBulkWrite({
        planId,
        userId: params.userId,
      }),
    ),
  );
}
