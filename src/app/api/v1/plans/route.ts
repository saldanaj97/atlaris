import { ZodError } from 'zod';

import { eq } from 'drizzle-orm';

import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { AttemptCapExceededError, ValidationError } from '@/lib/api/errors';
import {
  preparePlanInputWithPdfOrigin,
  rollbackPdfUsageIfReserved,
} from '@/lib/api/plans/pdf-origin';
import {
  calculateTotalWeeks,
  ensurePlanDurationAllowed,
  findCappedPlanWithoutModules,
  normalizePlanDurationForTier,
} from '@/lib/api/plans/shared';
import { json, jsonError } from '@/lib/api/response';
import { getPlanSummariesForUser } from '@/lib/db/queries/plans';
import { getUserByAuthId } from '@/lib/db/queries/users';
import { getDb } from '@/lib/db/runtime';
import { learningPlans } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';
import { atomicCheckAndInsertPlan, resolveUserTier } from '@/lib/stripe/usage';
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
      const details = error instanceof Error ? error : String(error);
      throw new ValidationError('Invalid request body.', details);
    }

    const user = await getUserByAuthId(userId);
    if (!user) {
      throw new Error(
        'Authenticated user record missing despite provisioning.'
      );
    }

    const db = getDb();

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

    const preparedInput = await preparePlanInputWithPdfOrigin({
      body,
      authUserId: userId,
      internalUserId: user.id,
      dbClient: db,
    });

    if (!preparedInput.ok) {
      return preparedInput.response;
    }

    const { origin, extractedContext, topic, pdfUsageReserved } =
      preparedInput.data;

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
      if (pdfUsageReserved) {
        try {
          await rollbackPdfUsageIfReserved({
            internalUserId: user.id,
            dbClient: db,
            reserved: pdfUsageReserved,
          });
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
