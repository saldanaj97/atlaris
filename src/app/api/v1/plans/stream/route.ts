import {
  AI_DEFAULT_MODEL,
  getModelsForTier,
  isValidModelId,
} from '@/lib/ai/ai-models';
import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import {
  getGenerationProvider,
  getGenerationProviderWithModel,
} from '@/lib/ai/provider-factory';
import { createEventStream, streamHeaders } from '@/lib/ai/streaming/events';
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
import { getDb } from '@/lib/db/runtime';
import type { SubscriptionTier } from '@/lib/stripe/tier-limits';
import { atomicCheckAndInsertPlan, resolveUserTier } from '@/lib/stripe/usage';
import {
  CreateLearningPlanInput,
  createLearningPlanSchema,
} from '@/lib/validation/learningPlans';
import { ZodError } from 'zod';
import {
  buildPlanStartEvent,
  handleFailedGeneration,
  handleSuccessfulGeneration,
  safeMarkPlanFailed,
} from './helpers';

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

    const db = getDb();
    const userTier: SubscriptionTier = await resolveUserTier(user.id, db);
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

    const plan = await atomicCheckAndInsertPlan(
      user.id,
      {
        topic: generationInput.topic,
        skillLevel: generationInput.skillLevel,
        weeklyHours: generationInput.weeklyHours,
        learningStyle: generationInput.learningStyle,
        visibility: body.visibility ?? 'private',
        origin: 'ai',
        startDate: generationInput.startDate,
        deadlineDate: generationInput.deadlineDate,
      },
      db
    );

    // TODO: [OPENROUTER-MIGRATION] Once preferredAiModel column exists:
    // const userPreferredModel = user.preferredAiModel;

    // TODO: Verify passing model as query param is safe and does not open abuse vectors
    // Tier-gated model selection: only allow models the user's tier permits
    const allowedModels = getModelsForTier(userTier);
    const url = new URL(req.url);
    const modelOverride = url.searchParams.get('model');

    // Validate model override against user's tier-allowed models
    const model =
      modelOverride &&
      isValidModelId(modelOverride) &&
      allowedModels.some((m) => m.id === modelOverride)
        ? modelOverride
        : AI_DEFAULT_MODEL;

    const provider =
      model !== AI_DEFAULT_MODEL
        ? getGenerationProviderWithModel(model)
        : getGenerationProvider();
    const normalizedInput: CreateLearningPlanInput = {
      ...body,
      startDate: generationInput.startDate ?? undefined,
      deadlineDate: generationInput.deadlineDate ?? undefined,
    };

    const stream = createEventStream(async (emit) => {
      emit(buildPlanStartEvent({ planId: plan.id, input: normalizedInput }));

      const startedAt = Date.now();

      try {
        const result = await runGenerationAttempt(
          { planId: plan.id, userId: user.id, input: generationInput },
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
