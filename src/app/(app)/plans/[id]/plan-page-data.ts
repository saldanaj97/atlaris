import type { PlanAccessResult } from '@/app/(app)/plans/[id]/types';

import { planError, planSuccess } from '@/app/(app)/plans/[id]/helpers';
import { getPlanDetailForRead } from '@/features/plans/read-projection/service';
import { requestBoundary } from '@/lib/api/request-boundary';
import { logger } from '@/lib/logging/logger';

/**
 * Loads plan detail for the plan overview page inside a server component boundary.
 * Uses `requestBoundary.component()` — do not call from `'use server'` action modules.
 */
export function loadPlanForPage(planId: string): Promise<PlanAccessResult> {
  return requestBoundary
    .component(async ({ actor, db }) => {
      const plan = await getPlanDetailForRead({
        planId,
        userId: actor.id,
        dbClient: db,
      });
      if (!plan) {
        logger.debug(
          { planId, userId: actor.id },
          'Plan not found or user does not have access',
        );
        return planError(
          'NOT_FOUND',
          'This plan does not exist or you do not have access to it.',
        );
      }
      return planSuccess(plan);
    })
    .then((boundaryResult) => {
      if (!boundaryResult) {
        logger.debug({ planId }, 'Plan access denied: user not authenticated');
        return planError(
          'UNAUTHORIZED',
          'You must be signed in to view this plan.',
        );
      }
      return boundaryResult;
    });
}
