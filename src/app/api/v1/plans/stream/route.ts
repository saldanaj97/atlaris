import { ZodError } from 'zod';

import {
  formatGenerationError,
  isRetryableClassification,
} from '@/lib/ai/failures';
import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import { getGenerationProvider } from '@/lib/ai/provider-factory';
import { createEventStream, streamHeaders } from '@/lib/ai/streaming/events';
import type { StreamingEvent } from '@/lib/ai/streaming/types';
import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { AttemptCapExceededError, ValidationError } from '@/lib/api/errors';
import {
  ensurePlanDurationAllowed,
  findCappedPlanWithoutModules,
  normalizePlanDurationForTier,
} from '@/lib/api/plans/shared';
import { checkPlanGenerationRateLimit } from '@/lib/api/rate-limit';
import { jsonError } from '@/lib/api/response';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { recordUsage } from '@/lib/db/usage';
import type { SubscriptionTier } from '@/lib/stripe/tier-limits';
import {
  atomicCheckAndInsertPlan,
  markPlanGenerationFailure,
  markPlanGenerationSuccess,
  resolveUserTier,
} from '@/lib/stripe/usage';
import {
  CreateLearningPlanInput,
  createLearningPlanSchema,
} from '@/lib/validation/learningPlans';

export const maxDuration = 60;

function buildPlanStartEvent({
  planId,
  input,
}: {
  planId: string;
  input: CreateLearningPlanInput;
}): StreamingEvent {
  return {
    type: 'plan_start',
    data: {
      planId,
      topic: input.topic,
      skillLevel: input.skillLevel,
      learningStyle: input.learningStyle,
      weeklyHours: input.weeklyHours,
      startDate: input.startDate ?? null,
      deadlineDate: input.deadlineDate ?? null,
    },
  };
}

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

    await checkPlanGenerationRateLimit(user.id);

    const userTier: SubscriptionTier = await resolveUserTier(user.id);
    const normalization = normalizePlanDurationForTier({
      tier: userTier,
      weeklyHours: body.weeklyHours,
      startDate: body.startDate ?? null,
      deadlineDate: body.deadlineDate ?? null,
    });
    const { startDate, deadlineDate, totalWeeks } = normalization;
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

    const generationInput = {
      topic: body.topic,
      notes: body.notes ?? null,
      skillLevel: body.skillLevel,
      weeklyHours: body.weeklyHours,
      learningStyle: body.learningStyle,
      startDate,
      deadlineDate,
    };

    const plan = await atomicCheckAndInsertPlan(user.id, {
      topic: generationInput.topic,
      skillLevel: generationInput.skillLevel,
      weeklyHours: generationInput.weeklyHours,
      learningStyle: generationInput.learningStyle,
      visibility: body.visibility ?? 'private',
      origin: 'ai',
      startDate: generationInput.startDate,
      deadlineDate: generationInput.deadlineDate,
    });

    const provider = getGenerationProvider();
    const normalizedInput: CreateLearningPlanInput = {
      ...body,
      startDate: generationInput.startDate ?? undefined,
      deadlineDate: generationInput.deadlineDate ?? undefined,
    };

    const stream = createEventStream(async (emit) => {
      emit(buildPlanStartEvent({ planId: plan.id, input: normalizedInput }));

      const startedAt = Date.now();
      const result = await runGenerationAttempt(
        {
          planId: plan.id,
          userId: user.id,
          input: generationInput,
        },
        { provider, signal: req.signal }
      );

      if (result.status === 'success') {
        const modules = result.modules;
        const modulesCount = modules.length;
        const tasksCount = modules.reduce(
          (sum, module) => sum + module.tasks.length,
          0
        );

        modules.forEach((module, index) => {
          emit({
            type: 'module_summary',
            data: {
              planId: plan.id,
              index,
              title: module.title,
              description: module.description ?? null,
              estimatedMinutes: module.estimatedMinutes,
              tasksCount: module.tasks.length,
            },
          });

          emit({
            type: 'progress',
            data: {
              planId: plan.id,
              modulesParsed: index + 1,
              modulesTotalHint: modulesCount,
            },
          });
        });

        await markPlanGenerationSuccess(plan.id);

        const usage = result.metadata?.usage;
        await recordUsage({
          userId: user.id,
          provider: result.metadata?.provider ?? 'unknown',
          model: result.metadata?.model ?? 'unknown',
          inputTokens: usage?.promptTokens ?? undefined,
          outputTokens: usage?.completionTokens ?? undefined,
          costCents: 0,
          kind: 'plan',
        });

        emit({
          type: 'complete',
          data: {
            planId: plan.id,
            modulesCount,
            tasksCount,
            durationMs: Math.max(0, Date.now() - startedAt),
          },
        });
        return;
      }

      const classification = result.classification ?? 'unknown';
      const retryable = isRetryableClassification(classification);

      if (!retryable) {
        await markPlanGenerationFailure(plan.id);

        const usage = result.metadata?.usage;
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

      emit({
        type: 'error',
        data: {
          planId: plan.id,
          message,
          classification,
          retryable,
        },
      });
    });

    return new Response(stream, {
      status: 200,
      headers: streamHeaders,
    });
  })
);
