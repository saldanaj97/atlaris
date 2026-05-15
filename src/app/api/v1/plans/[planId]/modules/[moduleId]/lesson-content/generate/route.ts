import { getBillingAccountSnapshot } from '@/features/billing/account-snapshot';
import { generateModuleLessons } from '@/features/lesson-content/generate-module-lessons';
import {
  requireOwnedPlanById,
  requireUuidRouteParam,
} from '@/features/plans/api/route-context';
import type { PlainHandler } from '@/lib/api/auth';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';
import { ModuleLessonGenerationApiResponseSchema } from '@/shared/schemas/lesson-content.schemas';

/**
 * POST /api/v1/plans/:planId/modules/:moduleId/lesson-content/generate
 * Starts on-demand lesson content generation for an unlocked module.
 */
export const POST: PlainHandler = requestBoundary.route(
  { rateLimit: 'lessonGeneration' },
  async ({ req, actor, db, params, correlationId }) => {
    const planId = requireUuidRouteParam(params, 'planId');
    const moduleId = requireUuidRouteParam(params, 'moduleId');

    await requireOwnedPlanById({
      planId,
      ownerUserId: actor.id,
      dbClient: db,
    });

    const billing = await getBillingAccountSnapshot({
      userId: actor.id,
      dbClient: db,
      projection: 'subscription',
      correlationId,
    });

    const result = await generateModuleLessons({
      dbClient: db,
      userId: actor.id,
      planId,
      moduleId,
      userTier: billing.tier,
      signal: req.signal,
    });

    logger.info(
      { planId, moduleId, userId: actor.id, state: result.kind, correlationId },
      'Module lesson generation API request completed',
    );

    switch (result.kind) {
      case 'success':
        return json(
          ModuleLessonGenerationApiResponseSchema.parse({
            state: 'ready',
            planId,
            moduleId,
            durationMs: result.durationMs,
          }),
        );
      case 'already_ready':
        return json(
          ModuleLessonGenerationApiResponseSchema.parse({
            state: 'ready',
            planId,
            moduleId,
          }),
        );
      case 'in_flight':
        return json(
          ModuleLessonGenerationApiResponseSchema.parse({
            state: 'generating',
            planId,
            moduleId,
          }),
          { status: 202 },
        );
      case 'failed':
        return json(
          ModuleLessonGenerationApiResponseSchema.parse({
            state: 'provider_failure',
            planId,
            moduleId,
            message: result.message,
          }),
          { status: 502 },
        );
      case 'quota_denied':
        return json(
          ModuleLessonGenerationApiResponseSchema.parse({
            state: 'quota_denied',
            planId,
            moduleId,
            currentCount: result.currentCount,
            limit: result.limit,
          }),
          { status: 429 },
        );
      case 'disabled':
        return json(
          ModuleLessonGenerationApiResponseSchema.parse({
            state: 'disabled',
            planId,
            moduleId,
          }),
          { status: 503 },
        );
      case 'not_found':
        return json(
          ModuleLessonGenerationApiResponseSchema.parse({
            state: 'not_found',
            planId,
            moduleId,
          }),
          { status: 404 },
        );
      case 'locked':
        return json(
          ModuleLessonGenerationApiResponseSchema.parse({
            state: 'locked',
            planId,
            moduleId,
          }),
          { status: 409 },
        );
      default: {
        const _exhaustive: never = result;
        return _exhaustive;
      }
    }
  },
);
