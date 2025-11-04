import { ZodError } from 'zod';

import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors';
import { json, jsonError } from '@/lib/api/response';
import { db } from '@/lib/db/drizzle';
import { learningPlans } from '@/lib/db/schema';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { enqueueJob } from '@/lib/jobs/queue';
import {
  JOB_TYPES,
  type JobType,
  type PlanRegenerationJobData,
} from '@/lib/jobs/types';
import { computeJobPriority, isPriorityTopic } from '@/lib/queue/priority';
import {
  checkRegenerationLimit,
  incrementUsage,
  resolveUserTier,
} from '@/lib/stripe/usage';
import {
  planRegenerationOverridesSchema,
  type PlanRegenerationOverridesInput,
} from '@/lib/validation/learningPlans';
import { eq } from 'drizzle-orm';

/**
 * POST /api/v1/plans/:planId/regenerate
 * Enqueues a regeneration job for an existing plan with optional parameter overrides.
 */
export const POST = withErrorBoundary(
  withAuth(async ({ req, userId, params }) => {
    const planId = params.planId;
    if (!planId) {
      throw new ValidationError('Plan id is required in the request path.');
    }

    const user = await getUserByClerkId(userId);
    if (!user) {
      return jsonError('User not found', { status: 404 });
    }

    // Fetch and verify plan ownership
    const plan = await db.query.learningPlans.findFirst({
      where: eq(learningPlans.id, planId),
    });

    if (!plan || plan.userId !== user.id) {
      return jsonError('Plan not found', { status: 404 });
    }

    // Check regeneration quota
    const canRegenerate = await checkRegenerationLimit(user.id);
    if (!canRegenerate) {
      return jsonError(
        'Regeneration quota exceeded for your subscription tier.',
        { status: 429 }
      );
    }

    // Parse request body for overrides
    let body: { overrides?: unknown } = {};
    try {
      body = (await req.json().catch(() => ({}))) as {
        overrides?: unknown;
      };
    } catch {
      throw new ValidationError('Invalid request body.');
    }

    let overrides: PlanRegenerationOverridesInput | undefined;
    if (body.overrides !== undefined) {
      try {
        overrides = planRegenerationOverridesSchema.parse(body.overrides);
      } catch (error) {
        if (error instanceof ZodError) {
          throw new ValidationError('Invalid overrides.', error.flatten());
        }
        throw new ValidationError('Invalid overrides.', error);
      }
    }

    // Compute priority based on tier and topic
    const tier = await resolveUserTier(user.id);
    const priority = computeJobPriority({
      tier,
      isPriorityTopic: isPriorityTopic(overrides?.topic ?? plan.topic),
    });

    // Enqueue regeneration job
    const payload: PlanRegenerationJobData = { planId, overrides };
    await enqueueJob(
      JOB_TYPES.PLAN_REGENERATION as JobType,
      planId,
      user.id,
      payload,
      priority
    );

    // Increment regeneration usage counter
    await incrementUsage(user.id, 'regeneration');

    return json(
      { generationId: planId, planId, status: 'pending' },
      { status: 202 }
    );
  })
);
