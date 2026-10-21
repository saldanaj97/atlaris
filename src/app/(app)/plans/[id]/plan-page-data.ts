import type {
  PlanAccessResult,
  PlanRegenerationState,
} from '@/app/(app)/plans/[id]/types';

import { planError, planSuccess } from '@/app/(app)/plans/[id]/helpers';
import { accessErrorFromAppError } from '@/app/(app)/plans/access-result';
import { isGroundedEnabled } from '@/features/ai/grounded-generation-flag';
import { getPlanDetailForRead } from '@/features/plans/read-projection/service';
import { requestBoundary } from '@/lib/api/request-boundary';
import { getActiveRegenerationJob } from '@/lib/db/queries/jobs';
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

/**
 * Regeneration state for the plan overview header (JCS-162). Offered only
 * when grounded generation is on for the viewer's tier; the active-job check
 * keeps the "Regenerating" state across reloads. Call after the plan loaded.
 */
export async function loadPlanRegenerationState(
  planId: string,
): Promise<PlanRegenerationState> {
  const state = await requestBoundary.component(async ({ actor, db }) => {
    if (!(await isGroundedEnabled(actor.subscriptionTier))) {
      return { canRegenerate: false, isRegenerating: false };
    }
    const activeJob = await getActiveRegenerationJob(planId, actor.id, db);
    return { canRegenerate: true, isRegenerating: activeJob !== null };
  });
  return state ?? { canRegenerate: false, isRegenerating: false };
}
