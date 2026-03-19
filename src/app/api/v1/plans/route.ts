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
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { json } from '@/lib/api/response';
import { getPlanSummariesForUser } from '@/lib/db/queries/plans';
import { getDb } from '@/lib/db/runtime';
import { createLearningPlanSchema } from '@/features/plans/validation/learningPlans';

export const GET: PlainHandler = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ user }) => {
    const db = getDb();
    const summaries = await getPlanSummariesForUser(user.id, db);
    return json(summaries);
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
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await req.json();
      body = createLearningPlanSchema.parse(parsed) as unknown as Record<
        string,
        unknown
      >;
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
      attemptsDbClient: db,
      jobQueue: noopJobQueue,
    });

    const typedBody = body as {
      topic: string;
      skillLevel: 'beginner' | 'intermediate' | 'advanced';
      weeklyHours: number;
      learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
      startDate?: string;
      deadlineDate?: string;
      origin?: string;
      extractedContent?: unknown;
      pdfProofToken?: string;
      pdfExtractionHash?: string;
    };

    const isPdfOrigin = typedBody.origin === 'pdf';
    const createResult = isPdfOrigin
      ? await lifecycleService.createPdfPlan({
          userId: user.id,
          authUserId: userId,
          body,
          topic: typedBody.topic,
          skillLevel: typedBody.skillLevel,
          weeklyHours: typedBody.weeklyHours,
          learningStyle: typedBody.learningStyle,
          startDate: typedBody.startDate,
          deadlineDate: typedBody.deadlineDate,
          extractedContent: typedBody.extractedContent,
          pdfProofToken: typedBody.pdfProofToken as string,
          pdfExtractionHash: typedBody.pdfExtractionHash as string,
        })
      : await lifecycleService.createPlan({
          userId: user.id,
          topic: typedBody.topic,
          skillLevel: typedBody.skillLevel,
          weeklyHours: typedBody.weeklyHours,
          learningStyle: typedBody.learningStyle,
          startDate: typedBody.startDate,
          deadlineDate: typedBody.deadlineDate,
        });

    // Map lifecycle result to HTTP response
    switch (createResult.status) {
      case 'success': {
        const now = new Date();
        return json(
          {
            id: createResult.planId,
            topic: createResult.normalizedInput.topic,
            skillLevel: typedBody.skillLevel,
            weeklyHours: typedBody.weeklyHours,
            learningStyle: typedBody.learningStyle,
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
