import { resolveModelForTier } from '@/lib/ai/model-resolver';
import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import { createEventStream, streamHeaders } from '@/lib/ai/streaming/events';
import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { AttemptCapExceededError, ValidationError } from '@/lib/api/errors';
import {
  ensurePlanDurationAllowed,
  findCappedPlanWithoutModules,
  normalizePlanDurationForTier,
} from '@/lib/api/plans/shared';
import { checkPlanGenerationRateLimit } from '@/lib/api/rate-limit';
import { jsonError } from '@/lib/api/response';
import { getUserByAuthId } from '@/lib/db/queries/users';
import { getDb } from '@/lib/db/runtime';
import { logger } from '@/lib/logging/logger';
import { sanitizePdfContextForPersistence } from '@/lib/pdf/context';
import { verifyAndConsumePdfExtractionProof } from '@/lib/security/pdf-extraction-proof';
import type { SubscriptionTier } from '@/lib/stripe/tier-limits';
import {
  atomicCheckAndIncrementPdfUsage,
  atomicCheckAndInsertPlan,
  decrementPdfPlanUsage,
  resolveUserTier,
} from '@/lib/stripe/usage';
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
  withAuthAndRateLimit('aiGeneration', async ({ req, userId }) => {
    let body: CreateLearningPlanInput;
    try {
      body = createLearningPlanSchema.parse(await req.json());
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ValidationError('Invalid request body.', error.flatten());
      }
      throw new ValidationError('Invalid request body.', error);
    }

    const user = await getUserByAuthId(userId);
    if (!user) {
      throw new Error(
        'Authenticated user record missing despite provisioning.'
      );
    }

    const db = getDb();
    await checkPlanGenerationRateLimit(user.id, db);

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

    const origin = body.origin ?? 'ai';

    const invalidPdfProofResponse = () =>
      jsonError('Invalid or expired PDF extraction proof.', { status: 403 });

    if (origin === 'pdf') {
      if (
        !body.extractedContent ||
        !body.pdfProofToken ||
        !body.pdfExtractionHash
      ) {
        return invalidPdfProofResponse();
      }

      const proofVerified = await verifyAndConsumePdfExtractionProof({
        authUserId: userId,
        extractedContent: body.extractedContent,
        extractionHash: body.pdfExtractionHash,
        token: body.pdfProofToken,
        dbClient: db,
      });

      if (!proofVerified) {
        return invalidPdfProofResponse();
      }

      const pdfUsage = await atomicCheckAndIncrementPdfUsage(user.id, db);
      if (!pdfUsage.allowed) {
        return jsonError('PDF plan quota exceeded for this month.', {
          status: 403,
          code: 'QUOTA_EXCEEDED',
        });
      }
    }

    const extractedContext =
      origin === 'pdf' && body.extractedContent
        ? sanitizePdfContextForPersistence(body.extractedContent)
        : null;

    const topic =
      origin === 'pdf' &&
      extractedContext &&
      extractedContext.mainTopic &&
      extractedContext.mainTopic.trim().length > 0
        ? extractedContext.mainTopic.trim()
        : body.topic;

    const generationInput = {
      topic,
      notes: body.notes ?? null,
      pdfContext: extractedContext,
      skillLevel: body.skillLevel,
      weeklyHours: body.weeklyHours,
      learningStyle: body.learningStyle,
      startDate,
      deadlineDate,
    };

    let plan: { id: string };
    try {
      plan = await atomicCheckAndInsertPlan(
        user.id,
        {
          topic: generationInput.topic,
          skillLevel: generationInput.skillLevel,
          weeklyHours: generationInput.weeklyHours,
          learningStyle: generationInput.learningStyle,
          visibility: 'private',
          origin,
          extractedContext,
          startDate: generationInput.startDate,
          deadlineDate: generationInput.deadlineDate,
        },
        db
      );
    } catch (err) {
      if (origin === 'pdf') {
        try {
          await decrementPdfPlanUsage(user.id, db);
        } catch (rollbackErr) {
          logger.error(
            { rollbackErr, userId: user.id },
            'Failed to rollback pdf plan usage'
          );
        }
      }
      throw err;
    }

    // Tier-gated model selection via unified resolver.
    // Pass undefined when param is absent so resolver treats it as not_specified, not invalid_model.
    const url = new URL(req.url);
    const modelOverride = url.searchParams.has('model')
      ? url.searchParams.get('model')
      : undefined;
    const { provider } = resolveModelForTier(userTier, modelOverride);
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
          { provider, signal: req.signal, dbClient: db }
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
