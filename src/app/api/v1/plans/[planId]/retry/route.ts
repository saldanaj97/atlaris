import { count, eq } from 'drizzle-orm';

import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import { getGenerationProvider } from '@/lib/ai/provider-factory';
import { createEventStream, streamHeaders } from '@/lib/ai/streaming/events';
import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { jsonError } from '@/lib/api/response';
import { getPlanIdFromUrl, isUuid } from '@/lib/api/route-helpers';
import { ATTEMPT_CAP } from '@/lib/db/queries/attempts';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { getDb } from '@/lib/db/runtime';
import { generationAttempts, learningPlans } from '@/lib/db/schema';

import {
  buildPlanStartEvent,
  handleFailedGeneration,
  handleSuccessfulGeneration,
  safeMarkPlanFailed,
} from '../../stream/helpers';

export const maxDuration = 60;

/**
 * POST /api/v1/plans/:planId/retry
 *
 * Retries generation for a failed plan. Returns a streaming response.
 * Server-side rate limiting: max ATTEMPT_CAP (default 3) attempts per plan.
 */
export const POST = withErrorBoundary(
  withAuth(async ({ req, userId }) => {
    const rawPlanId = getPlanIdFromUrl(req, 'second-to-last');
    if (!rawPlanId) {
      throw new ValidationError('Plan id is required in the request path.');
    }
    if (!isUuid(rawPlanId)) {
      throw new ValidationError('Invalid plan id format.');
    }
    // Re-assign to a const to ensure TypeScript narrows the type for closures
    const planId: string = rawPlanId;

    const user = await getUserByClerkId(userId);
    if (!user) {
      throw new Error(
        'Authenticated user record missing despite provisioning.'
      );
    }

    const db = getDb();

    // Fetch the plan
    const plan = await db.query.learningPlans.findFirst({
      where: eq(learningPlans.id, planId),
    });

    if (!plan) {
      throw new NotFoundError('Learning plan not found.');
    }

    // Verify ownership
    if (plan.userId !== user.id) {
      throw new NotFoundError('Learning plan not found.');
    }

    // Check if plan is in a failed state (only allow retry for failed plans)
    if (plan.generationStatus !== 'failed') {
      return jsonError(
        'Plan is not in a failed state. Only failed plans can be retried.',
        { status: 400 }
      );
    }

    // Server-side rate limit: check existing attempt count
    const [attemptCountResult] = await db
      .select({ value: count(generationAttempts.id) })
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, planId));

    const attemptCount = attemptCountResult?.value ?? 0;

    if (attemptCount >= ATTEMPT_CAP) {
      return jsonError(
        `Maximum retry attempts (${ATTEMPT_CAP}) reached for this plan. Please create a new plan.`,
        { status: 429 }
      );
    }

    // Reset plan status to generating before starting
    await db
      .update(learningPlans)
      .set({
        generationStatus: 'generating',
        updatedAt: new Date(),
      })
      .where(eq(learningPlans.id, planId));

    const provider = getGenerationProvider();

    // Build generation input from existing plan data
    // Capture plan properties in local constants to satisfy TypeScript
    // Note: planId is already available from getPlanIdFromUrl and guaranteed non-null
    const planTopic = plan.topic;
    const planSkillLevel = plan.skillLevel;
    const planWeeklyHours = plan.weeklyHours;
    const planLearningStyle = plan.learningStyle;
    const planStartDate = plan.startDate;
    const planDeadlineDate = plan.deadlineDate;

    const generationInput = {
      topic: planTopic,
      // Notes are not stored on the plan currently
      notes: undefined as string | undefined,
      skillLevel: planSkillLevel,
      weeklyHours: planWeeklyHours,
      learningStyle: planLearningStyle,
      startDate: planStartDate ?? undefined,
      deadlineDate: planDeadlineDate ?? undefined,
    };

    const stream = createEventStream(async (emit) => {
      emit(
        buildPlanStartEvent({
          planId,
          input: { ...generationInput, visibility: 'private', origin: 'ai' },
        })
      );

      const startedAt = Date.now();

      try {
        const result = await runGenerationAttempt(
          {
            planId: plan.id,
            userId: user.id,
            input: generationInput,
          },
          { provider, signal: req.signal }
        );

        if (result.status === 'success') {
          await handleSuccessfulGeneration(result, {
            planId: plan.id,
            userId: user.id,
            startedAt,
            emit,
          });
          return;
        }

        await handleFailedGeneration(result, {
          planId: plan.id,
          userId: user.id,
          emit,
        });
      } catch (error) {
        await safeMarkPlanFailed(plan.id, user.id);
        throw error;
      }
    });

    return new Response(stream, {
      status: 200,
      headers: streamHeaders,
    });
  })
);
