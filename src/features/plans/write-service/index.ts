import { ConflictError, NotFoundError } from '@/lib/api/errors';
import { deletePlan } from '@/lib/db/queries/plans';

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
    throw new NotFoundError('Learning plan not found.');
  }

  if (result.reason === 'currently_generating') {
    throw new ConflictError(
      'Cannot delete a plan that is currently generating.',
    );
  }

  throw new ConflictError('Cannot delete learning plan in its current state.');
}

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

export async function removePlansForWrite(params: {
  planIds: string[];
  userId: string;
}): Promise<BulkRemovePlanResult[]> {
  const results: BulkRemovePlanResult[] = [];

  for (const planId of params.planIds) {
    const result = await deletePlan(planId, params.userId);

    if (result.success) {
      results.push({ planId, success: true });
      continue;
    }

    if (result.reason === 'not_found') {
      results.push({
        planId,
        success: false,
        reason: 'not_found',
        message: 'Learning plan not found.',
      });
      continue;
    }

    if (result.reason === 'currently_generating') {
      results.push({
        planId,
        success: false,
        reason: 'currently_generating',
        message: 'Cannot delete a plan that is currently generating.',
      });
      continue;
    }

    results.push({
      planId,
      success: false,
      reason: 'unknown',
      message: 'Cannot delete learning plan in its current state.',
    });
  }

  return results;
}
