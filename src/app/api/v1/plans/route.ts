import { ZodError } from 'zod';
import { throwPlanCreationFailureError } from '@/app/api/v1/plans/plan-creation-failure';
import {
  createPlanLifecycleService,
  type JobQueuePort,
} from '@/features/plans/lifecycle';
import { createLearningPlanSchema } from '@/features/plans/validation/learningPlans';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';
import { type PlainHandler, withAuthAndRateLimit } from '@/lib/api/auth';
import {
  AppError,
  AttemptCapExceededError,
  ValidationError,
} from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { json } from '@/lib/api/response';
import {
  getLightweightPlanSummaries,
  getPlanSummaryCount,
} from '@/lib/db/queries/plans';
import { getDb } from '@/lib/db/runtime';
import { logger } from '@/lib/logging/logger';
import {
  clampPageSize,
  getPaginationDefault,
  getPaginationMinimum,
  isValidPaginationValue,
  type PaginationField,
} from '@/shared/constants/pagination';

function parsePaginationParam(params: {
  rawValue: string | null;
  field: PaginationField;
}): number {
  if (params.rawValue === null) {
    return getPaginationDefault(params.field);
  }

  const parsed = Number(params.rawValue);

  if (!isValidPaginationValue(params.field, parsed)) {
    const minimum = getPaginationMinimum(params.field);
    throw new ValidationError(
      `${params.field} must be an integer greater than or equal to ${minimum}`,
      { [params.field]: params.rawValue }
    );
  }

  return params.field === 'limit' ? clampPageSize(parsed) : parsed;
}

export const GET: PlainHandler = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ req, user }) => {
    const db = getDb();
    const url = new URL(req.url);

    const limit = parsePaginationParam({
      rawValue: url.searchParams.get('limit'),
      field: 'limit',
    });
    const offset = parsePaginationParam({
      rawValue: url.searchParams.get('offset'),
      field: 'offset',
    });

    logger.info(
      {
        source: 'plans-route',
        event: 'list_plans_started',
        userId: user.id,
        limit,
        offset,
      },
      'Listing lightweight plans'
    );

    const [summaries, totalCount] = await Promise.all([
      getLightweightPlanSummaries(user.id, db, { limit, offset }),
      getPlanSummaryCount(user.id, db),
    ]);

    logger.info(
      {
        source: 'plans-route',
        event: 'list_plans_succeeded',
        userId: user.id,
        limit,
        offset,
        totalCount,
        returnedCount: summaries.length,
      },
      'Listed lightweight plans'
    );

    return json(summaries, {
      headers: { 'X-Total-Count': String(totalCount) },
    });
  })
);

/** Stub JobQueuePort — non-streaming plan route does not enqueue jobs. */
const noopJobQueue: JobQueuePort = {
  async enqueueJob() {
    return '';
  },
  async completeJob() {},
  async failJob() {},
};

export const POST: PlainHandler = withErrorBoundary(
  withAuthAndRateLimit('mutation', async ({ req, userId, user }) => {
    let body: CreateLearningPlanInput;
    try {
      const parsed: unknown = await req.json();
      body = createLearningPlanSchema.parse(parsed);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ValidationError('Invalid request body.', error.flatten());
      }
      const details = error instanceof Error ? error : String(error);
      throw new ValidationError('Invalid request body.', details);
    }

    const db = getDb();
    const rateLimit = await checkPlanGenerationRateLimit(user.id, db);
    const generationRateLimitHeaders =
      getPlanGenerationRateLimitHeaders(rateLimit);

    // Delegate plan creation to PlanLifecycleService
    const lifecycleService = createPlanLifecycleService({
      dbClient: db,
      jobQueue: noopJobQueue,
    });

    const isPdfOrigin = body.origin === 'pdf';

    const createResult = isPdfOrigin
      ? await (() => {
          const pdfProofToken = body.pdfProofToken;
          const pdfExtractionHash = body.pdfExtractionHash;
          if (!pdfProofToken || !pdfExtractionHash) {
            throw new ValidationError(
              'pdfProofToken and pdfExtractionHash are required for PDF-based plans.',
              {
                pdfProofToken: pdfProofToken ? undefined : 'Required',
                pdfExtractionHash: pdfExtractionHash ? undefined : 'Required',
              }
            );
          }
          return lifecycleService.createPdfPlan({
            userId: user.id,
            authUserId: userId,
            body: body as Record<string, unknown>,
            topic: body.topic,
            skillLevel: body.skillLevel,
            weeklyHours: body.weeklyHours,
            learningStyle: body.learningStyle,
            startDate: body.startDate,
            deadlineDate: body.deadlineDate,
            extractedContent: body.extractedContent,
            pdfProofToken,
            pdfExtractionHash,
          });
        })()
      : await lifecycleService.createPlan({
          userId: user.id,
          topic: body.topic,
          skillLevel: body.skillLevel,
          weeklyHours: body.weeklyHours,
          learningStyle: body.learningStyle,
          startDate: body.startDate,
          deadlineDate: body.deadlineDate,
        });

    // Map lifecycle result to HTTP response
    switch (createResult.status) {
      case 'success': {
        const now = new Date();
        return json(
          {
            id: createResult.planId,
            topic: createResult.normalizedInput.topic,
            skillLevel: createResult.normalizedInput.skillLevel,
            weeklyHours: createResult.normalizedInput.weeklyHours,
            learningStyle: createResult.normalizedInput.learningStyle,
            visibility: 'private',
            origin: isPdfOrigin ? 'pdf' : 'ai',
            createdAt: now.toISOString(),
            status: 'generating',
          },
          { status: 201, headers: generationRateLimitHeaders }
        );
      }
      case 'duplicate_detected':
        throw new AppError(
          'A plan with this topic is already being generated. Please wait for it to complete.',
          {
            status: 409,
            code: 'DUPLICATE_PLAN',
            details: { existingPlanId: createResult.existingPlanId },
          }
        );
      case 'quota_rejected':
        throw new AppError(createResult.reason, {
          status: 403,
          code: 'QUOTA_EXCEEDED',
          details: { upgradeUrl: createResult.upgradeUrl },
        });
      case 'attempt_cap_exceeded':
        throw new AttemptCapExceededError(createResult.reason, {
          planId: createResult.cappedPlanId,
        });
      case 'permanent_failure':
      // biome-ignore lint/suspicious/noFallthroughSwitchClause: grouped with retryable_failure; handler always throws
      case 'retryable_failure':
        throwPlanCreationFailureError(createResult);
      default: {
        const _exhaustive: never = createResult;
        throw new Error(
          `Unhandled lifecycle result: ${(_exhaustive as { status: string }).status}`
        );
      }
    }
  })
);
