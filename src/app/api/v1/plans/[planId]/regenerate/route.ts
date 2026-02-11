import { ZodError } from 'zod';

import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors';
import { json, jsonError } from '@/lib/api/response';
import { isUuid } from '@/lib/api/route-helpers';
import { regenerationQueueEnv } from '@/lib/config/env';
import { getUserByAuthId } from '@/lib/db/queries/users';
import { getDb } from '@/lib/db/runtime';
import { learningPlans } from '@/lib/db/schema';
import { enqueueJob } from '@/lib/jobs/queue';
import { drainRegenerationQueue } from '@/lib/jobs/regeneration-worker';
import {
  JOB_TYPES,
  type JobType,
  type PlanRegenerationJobData,
} from '@/lib/jobs/types';
import { logger } from '@/lib/logging/logger';
import { computeJobPriority, isPriorityTopic } from '@/lib/queue/priority';
import {
  atomicCheckAndIncrementUsage,
  resolveUserTier,
} from '@/lib/stripe/usage';
import {
  planRegenerationRequestSchema,
  type PlanRegenerationOverridesInput,
} from '@/lib/validation/learningPlans';
import { eq } from 'drizzle-orm';

/**
 * POST /api/v1/plans/:planId/regenerate
 * Enqueues a regeneration job for an existing plan with optional parameter overrides.
 */
export const POST = withErrorBoundary(
  withAuthAndRateLimit('aiGeneration', async ({ req, userId, params }) => {
    if (!regenerationQueueEnv.enabled) {
      return jsonError(
        'Plan regeneration is temporarily disabled while queue workers are unavailable.',
        {
          status: 503,
          code: 'SERVICE_UNAVAILABLE',
        }
      );
    }

    const planId = params.planId;
    if (!planId) {
      throw new ValidationError('Plan id is required in the request path.');
    }
    if (!isUuid(planId)) {
      throw new ValidationError('Invalid plan id format.');
    }

    const user = await getUserByAuthId(userId);
    if (!user) {
      throw new Error(
        'Authenticated user record missing despite provisioning.'
      );
    }

    // Fetch and verify plan ownership (RLS-enforced via getDb)
    const db = getDb();
    const plan = await db.query.learningPlans.findFirst({
      where: eq(learningPlans.id, planId),
    });

    if (!plan || plan.userId !== user.id) {
      return jsonError('Plan not found', { status: 404 });
    }

    // Parse request body for overrides (before quota check to fail fast on validation)
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError('Invalid JSON in request body.', {
        status: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    let overrides: PlanRegenerationOverridesInput | undefined;
    try {
      const parsed = planRegenerationRequestSchema.parse(body);
      overrides = parsed.overrides;
    } catch (err: unknown) {
      const errDetail = err instanceof Error ? err : new Error(String(err));
      if (err instanceof ZodError) {
        throw new ValidationError('Invalid overrides.', {
          cause: errDetail,
          fieldErrors: err.flatten(),
        });
      }
      throw new ValidationError('Invalid overrides.', errDetail);
    }

    // Atomically check and increment regeneration quota (prevents TOCTOU race)
    const usageResult = await atomicCheckAndIncrementUsage(
      user.id,
      'regeneration',
      db
    );
    if (!usageResult.allowed) {
      return jsonError(
        'Regeneration quota exceeded for your subscription tier.',
        { status: 429 }
      );
    }

    // Compute priority based on tier and topic
    const tier = await resolveUserTier(user.id, db);
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

    if (regenerationQueueEnv.inlineProcessingEnabled) {
      void drainRegenerationQueue({ maxJobs: 1 }).catch((error) => {
        logger.error(
          { planId, userId: user.id, error },
          'Inline regeneration queue drain failed'
        );
      });
    }

    return json(
      { generationId: planId, planId, status: 'pending' },
      { status: 202 }
    );
  })
);
