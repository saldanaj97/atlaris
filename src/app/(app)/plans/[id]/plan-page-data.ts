import type { PlanAccessResult } from '@/app/(app)/plans/[id]/types';

import { planError, planSuccess } from '@/app/(app)/plans/[id]/helpers';
import { getPlanDetailForRead } from '@/features/plans/read-projection/service';
import { loadAuthorizedPageEntity } from '@/lib/api/load-authorized-page-entity';
import { logger } from '@/lib/logging/logger';

/**
 * Loads plan detail for the plan overview page through `loadAuthorizedPageEntity`.
 * Pass a plan id and receive a `PlanAccessResult` with auth, not-found, and success states.
 * Do not call this server-component loader from `'use server'` action modules.
 */
export function loadPlanForPage(planId: string): Promise<PlanAccessResult> {
  return loadAuthorizedPageEntity({
    fetch: ({ actor, db }) =>
      getPlanDetailForRead({
        planId,
        userId: actor.id,
        dbClient: db,
      }),
    notFound: () =>
      planError(
        'NOT_FOUND',
        'This plan does not exist or you do not have access to it.',
      ),
    success: (plan) => planSuccess(plan),
    unauthenticatedMessage: 'You must be signed in to view this plan.',
    unauthenticated: (message) => planError('UNAUTHORIZED', message),
    logNotFound: ({ userId }) => {
      logger.debug(
        { planId, userId },
        'Plan not found or user does not have access',
      );
    },
    logUnauthenticated: () => {
      logger.debug({ planId }, 'Plan access denied: user not authenticated');
    },
  });
}
