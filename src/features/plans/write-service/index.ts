import type { PlanDbClient } from '@/features/plans/read-projection/types';
import { ConflictError, NotFoundError } from '@/lib/api/errors';
import { deletePlan } from '@/lib/db/queries/plans';

/**
 * Deletes a user-owned plan through the feature service boundary so route
 * handlers do not reach into the query layer directly.
 */
export async function removePlanForWrite(params: {
  planId: string;
  userId: string;
  dbClient: PlanDbClient;
}): Promise<void> {
  const result = await deletePlan(
    params.planId,
    params.userId,
    params.dbClient,
  );

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
