import type { PlanAccessResult } from '@/app/(app)/plans/[id]/types';

import { planError, planSuccess } from '@/app/(app)/plans/[id]/helpers';
import { accessErrorFromAppError } from '@/app/(app)/plans/access-result';
import { getPlanDetailForRead } from '@/features/plans/read-projection/service';
import { requestBoundary } from '@/lib/api/request-boundary';
import { logger } from '@/lib/logging/logger';

/**
 * Loads plan detail for the plan overview page.
 * Pass a plan id and receive a `PlanAccessResult` with auth, not-found, and success states.
 * Do not call this server-component loader from `'use server'` action modules.
 */
export function loadPlanForPage(planId: string): Promise<PlanAccessResult> {
  return requestBoundary
    .component(async ({ actor, db }) => {
      try {
        const detail = await getPlanDetailForRead({
          planId,
          userId: actor.id,
          dbClient: db,
        });
        if (!detail) {
          logger.debug(
            { planId, userId: actor.id },
            'Plan not found or user does not have access',
          );
          return planError(
            'NOT_FOUND',
            'This plan does not exist or you do not have access to it.',
          );
        }
        return planSuccess(detail);
      } catch (error) {
        const mapped = accessErrorFromAppError(error);
        if (mapped) {
          return planError(mapped.code, mapped.message, mapped.candidates);
        }
        throw error;
      }
    })
    .then((boundaryResult) => {
      if (boundaryResult !== null) {
        return boundaryResult;
      }
      logger.debug({ planId }, 'Plan access denied: user not authenticated');
      return planError(
        'UNAUTHORIZED',
        'You must be signed in to view this plan.',
      );
    });
}
