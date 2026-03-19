import { ZodError } from 'zod';

import {
  type PlainHandler,
  withAuthAndRateLimit,
  withErrorBoundary,
} from '@/lib/api/auth';
import { AppError, ValidationError } from '@/lib/api/errors';
import {
  createPlanLifecycleService,
  type JobQueuePort,
} from '@/features/plans/lifecycle';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { json } from '@/lib/api/response';
import {
  getLightweightPlanSummaries,
  getPlanSummaryCount,
} from '@/lib/db/queries/plans';
import { logger } from '@/lib/logging/logger';
import { getDb } from '@/lib/db/runtime';
import { createLearningPlanSchema } from '@/features/plans/validation/learningPlans';
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

    if (isPdfOrigin) {
      if (!body.pdfProofToken || !body.pdfExtractionHash) {
        throw new ValidationError(
          'pdfProofToken and pdfExtractionHash are required for PDF-based plans.',
          {
            pdfProofToken: body.pdfProofToken ? undefined : 'Required',
            pdfExtractionHash: body.pdfExtractionHash ? undefined : 'Required',
          }
        );
      }
    }

    const createResult = isPdfOrigin
      ? await lifecycleService.createPdfPlan({
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
          pdfProofToken: body.pdfProofToken!,
          pdfExtractionHash: body.pdfExtractionHash!,
        })
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
      case 'permanent_failure':
      case 'retryable_failure': {
        const err =
          'error' in createResult
            ? createResult.error
            : new Error('Plan creation failed');
        const isRetryable = createResult.status === 'retryable_failure';
        throw new AppError(err.message, {
          status: isRetryable ? 503 : 400,
          code: isRetryable
            ? 'PLAN_CREATION_TEMPORARY_FAILURE'
            : 'PLAN_CREATION_FAILED',
        });
      }
    }
  })
);
