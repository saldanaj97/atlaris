import { desc, eq } from 'drizzle-orm';

import { classificationToUserMessage } from '@/lib/ai/failure-presentation';
import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import {
  requireInternalUserByAuthId,
  requireOwnedPlanById,
  requirePlanIdFromRequest,
} from '@/lib/api/plans/route-context';
import { json } from '@/lib/api/response';
import { ATTEMPT_CAP } from '@/lib/db/queries/attempts';
import { getDb } from '@/lib/db/runtime';
import { generationAttempts, modules } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';
import { derivePlanStatus } from '@/lib/plans/status';
import type { FailureClassification } from '@/lib/types/client';

/**
 * GET /api/v1/plans/:planId/status
 * Returns the status of a learning plan's generation process.
 *
 * Uses learning_plans.generationStatus column (updated by streaming route)
 * instead of the legacy job_queue table.
 */

export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ req, userId }) => {
    const planId = requirePlanIdFromRequest(req, 'second-to-last');

    logger.debug({ planId, userId }, 'Plan status request received');

    const user = await requireInternalUserByAuthId(userId);

    const db = getDb();
    const plan = await requireOwnedPlanById({
      planId,
      ownerUserId: user.id,
      dbClient: db,
    });

    // Check if plan has modules (indicates successful generation)
    const planModules = await db
      .select({ id: modules.id })
      .from(modules)
      .where(eq(modules.planId, planId))
      .limit(1);

    const hasModules = planModules.length > 0;

    // Fetch bounded recent attempts (max retries is ATTEMPT_CAP), derive count + latest in memory.
    const recentAttempts = await db
      .select({
        classification: generationAttempts.classification,
        createdAt: generationAttempts.createdAt,
      })
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, planId))
      .orderBy(desc(generationAttempts.createdAt))
      .limit(ATTEMPT_CAP);

    const attempts = recentAttempts.length;
    const latestAttempt = recentAttempts[0];

    const status = derivePlanStatus({
      generationStatus: plan.generationStatus,
      hasModules,
      attemptsCount: attempts,
      attemptCap: ATTEMPT_CAP,
    });

    let latestError: string | null = null;
    if (status === 'failed') {
      const planClassification = latestAttemptToClassification(
        latestAttempt?.classification
      );
      latestError = classificationToUserMessage(planClassification);
      logger.warn(
        {
          planId,
          userId: user.id,
          status,
          attempts,
          classification: latestAttempt?.classification ?? null,
          latestError,
        },
        'Plan generation failed'
      );
    }

    return json({
      planId: plan.id,
      status,
      attempts,
      latestError,
      createdAt: plan.createdAt?.toISOString(),
      updatedAt: plan.updatedAt?.toISOString(),
    });
  })
);

function latestAttemptToClassification(
  classification: string | null | undefined
): FailureClassification | 'unknown' {
  switch (classification) {
    case 'timeout':
    case 'rate_limit':
    case 'provider_error':
    case 'validation':
    case 'capped':
      return classification;
    default:
      return 'unknown';
  }
}
