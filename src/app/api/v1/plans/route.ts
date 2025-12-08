import { ZodError } from 'zod';

import { eq } from 'drizzle-orm';

import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { AttemptCapExceededError, ValidationError } from '@/lib/api/errors';
import { checkPlanGenerationRateLimit } from '@/lib/api/rate-limit';
import { json, jsonError } from '@/lib/api/response';
import { getDb } from '@/lib/db/runtime';
import { getPlanSummariesForUser } from '@/lib/db/queries/plans';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { learningPlans } from '@/lib/db/schema';
import { getGenerationProvider } from '@/lib/ai/provider-factory';
import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import {
  isRetryableClassification,
  formatGenerationError,
} from '@/lib/ai/failures';
import {
  atomicCheckAndInsertPlan,
  resolveUserTier,
  markPlanGenerationSuccess,
  markPlanGenerationFailure,
} from '@/lib/stripe/usage';
import { recordUsage } from '@/lib/db/usage';
import type { NewLearningPlan } from '@/lib/types/db';
import {
  CreateLearningPlanInput,
  createLearningPlanSchema,
  DEFAULT_PLAN_DURATION_WEEKS,
} from '@/lib/validation/learningPlans';
import {
  calculateTotalWeeks,
  ensurePlanDurationAllowed,
  findCappedPlanWithoutModules,
} from '@/lib/api/plans/shared';

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

    // Enforce plan duration cap based on user tier
    const userTier = await resolveUserTier(user.id);

    // Always compute totalWeeks from dates with sensible fallbacks
    const totalWeeks = calculateTotalWeeks({
      startDate: body.startDate,
      deadlineDate: body.deadlineDate,
      defaultWeeks: DEFAULT_PLAN_DURATION_WEEKS,
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

    const provider = getGenerationProvider();
    const result = await runGenerationAttempt(
      {
        planId: plan.id,
        userId: user.id,
        input: {
          topic: body.topic,
          notes: body.notes ?? null,
          skillLevel: body.skillLevel,
          weeklyHours: body.weeklyHours,
          learningStyle: body.learningStyle,
          startDate: body.startDate ?? null,
          deadlineDate: body.deadlineDate ?? null,
        },
      },
      { provider }
    );

    const usage = result.metadata?.usage;
    const respondWithPlan = async (status: 'ready' | 'failed') => {
      const [freshPlan] = await db
        .select()
        .from(learningPlans)
        .where(eq(learningPlans.id, plan.id))
        .limit(1);

      return json(
        {
          id: freshPlan?.id ?? plan.id,
          topic: plan.topic,
          skillLevel: plan.skillLevel,
          weeklyHours: plan.weeklyHours,
          learningStyle: plan.learningStyle,
          visibility: plan.visibility,
          origin: plan.origin,
          createdAt: (freshPlan?.createdAt ?? plan.createdAt)?.toISOString(),
          status,
        },
        { status: status === 'ready' ? 201 : 400 }
      );
    };

    if (result.status === 'success') {
      await markPlanGenerationSuccess(plan.id);
      await recordUsage({
        userId: user.id,
        provider: result.metadata?.provider ?? 'unknown',
        model: result.metadata?.model ?? 'unknown',
        inputTokens: usage?.promptTokens ?? undefined,
        outputTokens: usage?.completionTokens ?? undefined,
        costCents: 0,
        kind: 'plan',
      });

      return respondWithPlan('ready');
    }

    const classification = result.classification ?? 'unknown';
    const retryable = isRetryableClassification(classification);

    if (!retryable) {
      await markPlanGenerationFailure(plan.id);
      await recordUsage({
        userId: user.id,
        provider: result.metadata?.provider ?? 'unknown',
        model: result.metadata?.model ?? 'unknown',
        inputTokens: usage?.promptTokens ?? undefined,
        outputTokens: usage?.completionTokens ?? undefined,
        costCents: 0,
        kind: 'plan',
      });
    }

    const message = formatGenerationError(
      result.error,
      'Plan generation failed.'
    );

    return jsonError(message, {
      status: retryable ? 503 : 400,
      classification,
    });
  })
);
