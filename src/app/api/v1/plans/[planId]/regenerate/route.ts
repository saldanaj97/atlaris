import { ZodError } from 'zod';

import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors';
import { json, jsonError } from '@/lib/api/response';
import { isUuid } from '@/lib/api/route-helpers';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { getDb } from '@/lib/db/runtime';
import { learningPlans } from '@/lib/db/schema';
import { enqueueJob } from '@/lib/jobs/queue';
import {
  JOB_TYPES,
  type JobType,
  type PlanRegenerationJobData,
} from '@/lib/jobs/types';
import { computeJobPriority, isPriorityTopic } from '@/lib/queue/priority';
import {
  atomicCheckAndIncrementUsage,
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
  withAuthAndRateLimit('aiGeneration', async ({ req, userId, params }) => {
    const planId = params.planId;
    if (!planId) {
      throw new ValidationError('Plan id is required in the request path.');
    }
    if (!isUuid(planId)) {
      throw new ValidationError('Invalid plan id format.');
    }

    const user = await getUserByClerkId(userId);
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

    return json(
      { generationId: planId, planId, status: 'pending' },
      { status: 202 }
    );
  })
);
