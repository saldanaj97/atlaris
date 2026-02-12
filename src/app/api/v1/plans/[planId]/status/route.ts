import { count, desc, eq } from 'drizzle-orm';

import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { getPlanIdFromUrl, isUuid } from '@/lib/api/route-helpers';
import { getUserByAuthId } from '@/lib/db/queries/users';
import { getDb } from '@/lib/db/runtime';
import { generationAttempts, learningPlans, modules } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';
import { derivePlanStatus } from '@/lib/plans/status';

/**
 * GET /api/v1/plans/:planId/status
 * Returns the status of a learning plan's generation process.
 *
 * Uses learning_plans.generationStatus column (updated by streaming route)
 * instead of the legacy job_queue table.
 */

export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ req, userId }) => {
    const planId = getPlanIdFromUrl(req, 'second-to-last');
    if (!planId) {
      throw new ValidationError('Plan id is required in the request path.');
    }
    if (!isUuid(planId)) {
      throw new ValidationError('Invalid plan id format.');
    }

    logger.debug({ planId, userId }, 'Plan status request received');

    const user = await getUserByAuthId(userId);
    if (!user) {
      throw new Error(
        'Authenticated user record missing despite provisioning.'
      );
    }

    // Fetch the plan (using getDb for future RLS support)
    const db = getDb();
    const plan = await db.query.learningPlans.findFirst({
      where: eq(learningPlans.id, planId),
    });

    if (!plan) {
      throw new NotFoundError('Learning plan not found.');
    }

    // Verify ownership
    if (plan.userId !== user.id) {
      logger.warn(
        { planId, planUserId: plan.userId, requestUserId: user.id },
        'Plan status ownership check failed'
      );
      throw new NotFoundError('Learning plan not found.');
    }

    // Check if plan has modules (indicates successful generation)
    const planModules = await db
      .select({ id: modules.id })
      .from(modules)
      .where(eq(modules.planId, planId))
      .limit(1);

    const hasModules = planModules.length > 0;

    // Get attempt count and latest attempt error from generation_attempts table
    const [attemptCountResult] = await db
      .select({ value: count(generationAttempts.id) })
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, planId));

    const attempts = attemptCountResult?.value ?? 0;

    // Get the latest attempt to show error message if failed
    const [latestAttempt] = await db
      .select({
        classification: generationAttempts.classification,
        createdAt: generationAttempts.createdAt,
      })
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, planId))
      .orderBy(desc(generationAttempts.createdAt))
      .limit(1);

    const status = derivePlanStatus({
      generationStatus: plan.generationStatus,
      hasModules,
    });

    // Build error message from latest attempt classification
    let latestError: string | null = null;
    if (status === 'failed' && latestAttempt?.classification) {
      const classification = latestAttempt.classification;
      // Map classification to user-friendly message
      const errorMessages: Record<string, string> = {
        timeout: 'Generation timed out. Please try again.',
        rate_limit: 'Rate limit exceeded. Please wait and try again.',
        in_progress: 'A generation is already in progress for this plan.',
        validation: 'Invalid response from AI. Please try again.',
        parse_error: 'Failed to parse AI response. Please try again.',
        network: 'Network error occurred. Please try again.',
        capped: 'Maximum generation attempts reached for this plan.',
        unknown: 'An unexpected error occurred. Please try again.',
      };
      latestError = errorMessages[classification] ?? errorMessages.unknown;
    }
    if (status === 'failed') {
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
