import { requireUuidRouteParam } from '@/features/plans/api/route-context';
import { getModuleLessonGenerationStatusForRead } from '@/features/plans/read-projection/service';
import { NotFoundError } from '@/lib/api/errors';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';
import { ModuleLessonGenerationStatusResponseSchema } from '@/shared/schemas/lesson-content.schemas';

/**
 * GET /api/v1/plans/:planId/modules/:moduleId/lesson-content/status
 * Returns the owned module's lesson generation status for client polling.
 */
export const GET = requestBoundary.route(
  { rateLimit: 'read' },
  async ({ params, actor, db, correlationId }): Promise<Response> => {
    const planId = requireUuidRouteParam(params, 'planId');
    const moduleId = requireUuidRouteParam(params, 'moduleId');

    logger.debug(
      { planId, moduleId, userId: actor.id, correlationId },
      'Module lesson generation status request received',
    );

    const snapshot = await getModuleLessonGenerationStatusForRead({
      planId,
      moduleId,
      userId: actor.id,
      dbClient: db,
    });

    if (!snapshot) {
      throw new NotFoundError('Module not found.');
    }

    const body = ModuleLessonGenerationStatusResponseSchema.parse(snapshot);

    return json(body, {
      headers: { 'Cache-Control': 'no-store' },
    });
  },
);
