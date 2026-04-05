import { desc, eq } from 'drizzle-orm';

import { classificationToUserMessage } from '@/features/ai/failure-presentation';
import { ATTEMPT_CAP } from '@/features/ai/generation-policy';
import {
  requireOwnedPlanById,
  requirePlanIdFromRequest,
} from '@/features/plans/api/route-context';
import { derivePlanStatus } from '@/features/plans/status';
import { withAuthAndRateLimit } from '@/lib/api/auth';
import { withErrorBoundary } from '@/lib/api/middleware';
import { json } from '@/lib/api/response';
import { getDb } from '@/lib/db/runtime';
import { generationAttempts, modules } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';
import type { FailureClassification } from '@/shared/types/client.types';

/**
 * GET /api/v1/plans/:planId/status
 * Returns the status of a learning plan's generation process.
 *
 * Uses learning_plans.generationStatus column (updated by streaming route)
 * instead of the legacy job_queue table.
 */

export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ req, user }): Promise<Response> => {
    const planId = requirePlanIdFromRequest(req, 'second-to-last');
    const ownerUserId = user.id;

    logger.debug(
      { planId, userId: ownerUserId },
      'Plan status request received'
    );

    const db = getDb();
    const plan = await requireOwnedPlanById({
      planId,
      ownerUserId,
      dbClient: db,
    });

    // Match detail endpoint: modules in DB are the ground truth for `hasModules`
    // (see derivePlanStatus — any modules → 'ready' regardless of generationStatus).
    const hasModules =
      (
        await db
          .select({ id: modules.id })
          .from(modules)
          .where(eq(modules.planId, planId))
          .limit(1)
      ).length > 0;

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
          userId: ownerUserId,
          status,
          attempts,
          classification: latestAttempt?.classification ?? null,
          latestError,
        },
        'Plan generation failed'
      );
    }

    return json(
      {
        planId: plan.id,
        status,
        attempts,
        latestError,
        createdAt: plan.createdAt?.toISOString(),
        updatedAt: plan.updatedAt?.toISOString(),
      },
      { headers: { 'Cache-Control': 'max-age=1, stale-while-revalidate=2' } }
    );
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
