import { ZodError } from 'zod';

import { count, eq, inArray } from 'drizzle-orm';

import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { AttemptCapExceededError, ValidationError } from '@/lib/api/errors';
import { checkPlanGenerationRateLimit } from '@/lib/api/rate-limit';
import { json, jsonError } from '@/lib/api/response';
import { db } from '@/lib/db/drizzle';
import { ATTEMPT_CAP } from '@/lib/db/queries/attempts';
import { getPlanSummariesForUser } from '@/lib/db/queries/plans';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { generationAttempts, learningPlans, modules } from '@/lib/db/schema';
import { enqueueJob } from '@/lib/jobs/queue';
import { JOB_TYPES, type PlanGenerationJobData } from '@/lib/jobs/types';
import { computeJobPriority, isPriorityTopic } from '@/lib/queue/priority';
import {
  atomicCheckAndInsertPlan,
  checkPlanDurationCap,
  resolveUserTier,
} from '@/lib/stripe/usage';
import type { NewLearningPlan } from '@/lib/types/db';
import {
  CreateLearningPlanInput,
  createLearningPlanSchema,
  DEFAULT_PLAN_DURATION_WEEKS,
  MILLISECONDS_PER_WEEK,
} from '@/lib/validation/learningPlans';

export const GET = withErrorBoundary(
  withAuth(async ({ userId }) => {
    const user = await getUserByClerkId(userId);
    if (!user) {
      throw new ValidationError('User record not found.');
    }

    const summaries = await getPlanSummariesForUser(user.id);
    return json(summaries);
  })
);

async function findCappedPlanWithoutModules(userDbId: string) {
  const planRows = await db
    .select({ id: learningPlans.id })
    .from(learningPlans)
    .where(eq(learningPlans.userId, userDbId));

  if (!planRows.length) {
    return null;
  }

  const planIds = planRows.map((row) => row.id);

  const attemptAggregates = await db
    .select({
      planId: generationAttempts.planId,
      count: count(generationAttempts.id).as('count'),
    })
    .from(generationAttempts)
    .where(inArray(generationAttempts.planId, planIds))
    .groupBy(generationAttempts.planId);

  if (!attemptAggregates.length) {
    return null;
  }

  const cappedPlanIds = attemptAggregates
    .filter((row) => row.count >= ATTEMPT_CAP)
    .map((row) => row.planId);

  if (!cappedPlanIds.length) {
    return null;
  }

  const plansWithModules = await db
    .select({ planId: modules.planId })
    .from(modules)
    .where(inArray(modules.planId, cappedPlanIds))
    .groupBy(modules.planId);

  const plansWithModulesSet = new Set(
    plansWithModules.map((row) => row.planId)
  );

  return (
    cappedPlanIds.find((planId) => !plansWithModulesSet.has(planId)) ?? null
  );
}

// Use shared validation constants to avoid duplication

export const POST = withErrorBoundary(
  withAuth(async ({ req, userId }) => {
    let body: CreateLearningPlanInput;
    try {
      body = createLearningPlanSchema.parse(await req.json());
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ValidationError('Invalid request body.', error.flatten());
      }
      throw new ValidationError('Invalid request body.', error);
    }

    const user = await getUserByClerkId(userId);
    if (!user) {
      throw new ValidationError('User record not found. Cannot create plan.');
    }

    // Check rate limit before creating plan
    await checkPlanGenerationRateLimit(user.id);

    // Enforce plan duration cap based on user tier
    const userTier = await resolveUserTier(user.id);

    // Always compute totalWeeks from dates with sensible fallbacks
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const start = body.startDate ? new Date(body.startDate) : new Date(today);
    start.setUTCHours(0, 0, 0, 0);

    let totalWeeks = DEFAULT_PLAN_DURATION_WEEKS;
    if (body.deadlineDate) {
      const deadline = new Date(body.deadlineDate);
      deadline.setUTCHours(0, 0, 0, 0);
      const diffMs = deadline.getTime() - start.getTime();
      totalWeeks = Math.max(1, Math.ceil(diffMs / MILLISECONDS_PER_WEEK));
    }

    const cap = checkPlanDurationCap({
      tier: userTier,
      weeklyHours: body.weeklyHours,
      totalWeeks,
    });

    if (!cap.allowed) {
      return jsonError(cap.reason ?? 'Plan duration exceeds tier cap', {
        status: 403,
      });
    }

    const insertPayload: NewLearningPlan = {
      userId: user.id,
      topic: body.topic,
      skillLevel: body.skillLevel,
      weeklyHours: body.weeklyHours,
      learningStyle: body.learningStyle,
      startDate: body.startDate ?? null,
      deadlineDate: body.deadlineDate ?? null,
      visibility: body.visibility,
      origin: body.origin,
    };

    const cappedPlanId = await findCappedPlanWithoutModules(user.id);
    if (cappedPlanId) {
      throw new AttemptCapExceededError('attempt cap reached', {
        planId: cappedPlanId,
      });
    }

    // Enforce subscription plan limits and in-flight generation cap atomically.
    // This prevents users from spamming concurrent POSTs and bypassing plan caps
    // while newly inserted rows are still non-eligible.
    const created = await atomicCheckAndInsertPlan(user.id, {
      topic: insertPayload.topic,
      skillLevel: insertPayload.skillLevel,
      weeklyHours: insertPayload.weeklyHours,
      learningStyle: insertPayload.learningStyle,
      visibility: (insertPayload.visibility ?? 'private') as
        | 'private'
        | 'public',
      // This endpoint triggers AI generation, so origin is always 'ai'.
      origin: 'ai',
      startDate: insertPayload.startDate,
      deadlineDate: insertPayload.deadlineDate,
    });

    // Fetch created row to include timestamps in response (back-compat shape)
    const [plan] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, created.id))
      .limit(1);

    // Notes from onboarding are intentionally ignored until the schema introduces a column.

    if (!plan) {
      throw new ValidationError('Failed to create learning plan.');
    }

    const jobData: PlanGenerationJobData = {
      topic: body.topic,
      notes: body.notes ?? null,
      skillLevel: body.skillLevel,
      weeklyHours: body.weeklyHours,
      learningStyle: body.learningStyle,
      startDate: body.startDate ?? null,
      deadlineDate: body.deadlineDate ?? null,
    };

    const priority = computeJobPriority({
      tier: userTier,
      isPriorityTopic: isPriorityTopic(body.topic),
    });
    await enqueueJob(
      JOB_TYPES.PLAN_GENERATION,
      plan.id,
      user.id,
      jobData,
      priority
    );

    return json(
      {
        id: plan.id,
        topic: plan.topic,
        skillLevel: plan.skillLevel,
        weeklyHours: plan.weeklyHours,
        learningStyle: plan.learningStyle,
        visibility: plan.visibility,
        origin: plan.origin,
        createdAt: plan.createdAt?.toISOString(),
        status: 'pending' as const,
      },
      { status: 201 }
    );
  })
);
