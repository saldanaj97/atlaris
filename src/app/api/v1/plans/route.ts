import { ZodError } from 'zod';

import { eq } from 'drizzle-orm';

import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
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
import { getUserByAuthId } from '@/lib/db/queries/users';
import { getDb } from '@/lib/db/runtime';
import { learningPlans } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';
import { sanitizePdfContextForPersistence } from '@/lib/pdf/context';
import { verifyAndConsumePdfExtractionProof } from '@/lib/security/pdf-extraction-proof';
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

export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ userId }) => {
    const user = await getUserByAuthId(userId);
    if (!user) {
      throw new Error(
        'Authenticated user record missing despite provisioning.'
      );
    }

    const db = getDb();
    const summaries = await getPlanSummariesForUser(user.id, db);
    return json(summaries);
  })
);

// Use shared validation constants to avoid duplication

export const POST = withErrorBoundary(
  withAuthAndRateLimit('mutation', async ({ req, userId }) => {
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

    // Check rate limit before creating plan
    await checkPlanGenerationRateLimit(user.id, db);

    // Enforce plan duration cap based on user tier using the requested window
    const userTier = await resolveUserTier(user.id, db);
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
    const {
      startDate: _startDate,
      deadlineDate: _deadlineDate,
      totalWeeks,
    } = normalizePlanDurationForTier({
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

    const origin = body.origin ?? 'ai';
    const extractedContent = body.extractedContent;

    const invalidPdfProofResponse = () =>
      jsonError('Invalid or expired PDF extraction proof.', { status: 403 });

    if (origin === 'pdf') {
      if (!extractedContent || !body.pdfProofToken || !body.pdfExtractionHash) {
        return invalidPdfProofResponse();
      }

      const proofVerified = await verifyAndConsumePdfExtractionProof({
        authUserId: userId,
        extractedContent,
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
      origin === 'pdf' && extractedContent
        ? sanitizePdfContextForPersistence(extractedContent)
        : null;

    const topic =
      origin === 'pdf' &&
      extractedContext &&
      extractedContext.mainTopic &&
      extractedContext.mainTopic.trim().length > 0
        ? extractedContext.mainTopic.trim()
        : body.topic;

    let created: { id: string };
    try {
      created = await atomicCheckAndInsertPlan(
        user.id,
        {
          topic,
          skillLevel: body.skillLevel,
          weeklyHours: body.weeklyHours,
          learningStyle: body.learningStyle,
          visibility: 'private',
          origin,
          extractedContext,
          startDate: _startDate,
          deadlineDate: _deadlineDate,
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
