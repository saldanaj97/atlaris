import { ZodError } from 'zod';

import { eq } from 'drizzle-orm';

import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { AttemptCapExceededError, ValidationError } from '@/lib/api/errors';
import {
  calculateTotalWeeks,
  ensurePlanDurationAllowed,
  findCappedPlanWithoutModules,
  normalizePlanDurationForTier,
} from '@/lib/api/plans/shared';
import { checkPlanGenerationRateLimit } from '@/lib/api/rate-limit';
import { json, jsonError } from '@/lib/api/response';
import { getPlanSummariesForUser } from '@/lib/db/queries/plans';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { getDb } from '@/lib/db/runtime';
import { learningPlans } from '@/lib/db/schema';
import { atomicCheckAndInsertPlan, resolveUserTier } from '@/lib/stripe/usage';
import {
  CreateLearningPlanInput,
  createLearningPlanSchema,
} from '@/lib/validation/learningPlans';

export const GET = withErrorBoundary(
  withAuth(async ({ userId }) => {
    const user = await getUserByClerkId(userId);
    if (!user) {
      throw new Error(
        'Authenticated user record missing despite provisioning.'
      );
    }

    const summaries = await getPlanSummariesForUser(user.id);
    return json(summaries);
  })
);

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
      throw new Error(
        'Authenticated user record missing despite provisioning.'
      );
    }

    // Check rate limit before creating plan
    await checkPlanGenerationRateLimit(user.id);

    // Enforce plan duration cap based on user tier using the requested window
    const userTier = await resolveUserTier(user.id);
    const requestedWeeks = calculateTotalWeeks({
      startDate: body.startDate ?? null,
      deadlineDate: body.deadlineDate ?? null,
    });
    const requestedCap = ensurePlanDurationAllowed({
      userTier,
      weeklyHours: body.weeklyHours,
      totalWeeks: requestedWeeks,
    });

    if (!requestedCap.allowed) {
      return jsonError(
        requestedCap.reason ?? 'Plan duration exceeds tier cap',
        {
          status: 403,
        }
      );
    }

    // Normalize persisted dates to tier limits while keeping requested cap validation strict
    const { startDate, deadlineDate, totalWeeks } =
      normalizePlanDurationForTier({
        tier: userTier,
        weeklyHours: body.weeklyHours,
        startDate: body.startDate ?? null,
        deadlineDate: body.deadlineDate ?? null,
      });

    const cap = ensurePlanDurationAllowed({
      userTier,
      weeklyHours: body.weeklyHours,
      totalWeeks,
    });

    if (!cap.allowed) {
      return jsonError(cap.reason ?? 'Plan duration exceeds tier cap', {
        status: 403,
      });
    }

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
      topic: body.topic,
      skillLevel: body.skillLevel,
      weeklyHours: body.weeklyHours,
      learningStyle: body.learningStyle,
      visibility: body.visibility ?? 'private',
      // This endpoint triggers AI generation, so origin is always 'ai'.
      origin: 'ai',
      startDate,
      deadlineDate,
    });

    // Fetch created row to include timestamps in response (back-compat shape)
    const db = getDb();
    const [plan] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, created.id))
      .limit(1);

    // Notes from onboarding are intentionally ignored until the schema introduces a column.

    if (!plan) {
      throw new ValidationError('Failed to create learning plan.');
    }

    // Note: Plan generation now happens via the streaming endpoint (/api/v1/plans/stream).
    // This endpoint only creates the plan record. The frontend should redirect to the
    // streaming endpoint or the plan page where generation can be initiated.

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
        status: 'generating',
      },
      { status: 201 }
    );
  })
);
