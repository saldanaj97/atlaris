import type { PlainHandler } from '@/lib/api/auth';

import { getBillingAccountSnapshot } from '@/features/billing/account-snapshot';
import {
  startModuleLessonGeneration,
  type StartModuleLessonGenerationResult,
} from '@/features/lesson-content/start-module-lesson-generation-workflow';
import {
  requireOwnedPlanById,
  requireUuidRouteParam,
} from '@/features/plans/api/route-context';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';
import { ModuleLessonGenerationApiResponseSchema } from '@/shared/schemas/lesson-content.schemas';

type StartModuleLessonGeneration = typeof startModuleLessonGeneration;

/**
 * Factory for the module lesson content generate POST handler.
 */
export function createModuleLessonContentGenerateHandler(
  startGeneration: StartModuleLessonGeneration,
): PlainHandler {
  return requestBoundary.route(
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

      const result = await startGeneration({
        dbClient: db,
        userId: actor.id,
        planId,
        moduleId,
        userTier: billing.tier,
        signal: req.signal,
        correlationId,
      });

      logger.info(
        {
          planId,
          moduleId,
          userId: actor.id,
          state: result.kind,
          correlationId,
          ...(result.kind === 'workflow_started'
            ? { workflowRunId: result.runId }
            : {}),
        },
        'Module lesson generation API request completed',
      );

      return mapModuleLessonGenerationResult(result, planId, moduleId);
    },
  );
}

function mapModuleLessonGenerationResult(
  result: StartModuleLessonGenerationResult,
  planId: string,
  moduleId: string,
) {
  switch (result.kind) {
    case 'workflow_started':
    case 'in_flight':
      return json(
        ModuleLessonGenerationApiResponseSchema.parse({
          state: 'generating',
          planId,
          moduleId,
        }),
        { status: 202 },
      );
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
    case 'failed':
    case 'workflow_start_failed':
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
}

export const moduleLessonContentGeneratePost =
  createModuleLessonContentGenerateHandler(startModuleLessonGeneration);
