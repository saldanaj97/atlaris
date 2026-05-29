import type { ModuleAccessResult } from '@/app/(app)/plans/[id]/modules/[moduleId]/types';

import {
  moduleError,
  moduleSuccess,
} from '@/app/(app)/plans/[id]/modules/[moduleId]/helpers';
import { getModuleDetailForRead } from '@/features/plans/read-projection/service';
import { finalizePageBoundaryResult } from '@/lib/api/page-boundary-result';
import { requestBoundary } from '@/lib/api/request-boundary';
import { logger } from '@/lib/logging/logger';

/**
 * Loads module detail for the module page inside a server component boundary.
 * Uses `requestBoundary.component()` — do not call from `'use server'` action modules.
 */
export function loadModuleForPage(
  planId: string,
  moduleId: string,
): Promise<ModuleAccessResult> {
  return requestBoundary
    .component(async ({ actor, db }) => {
      const moduleData = await getModuleDetailForRead({
        planId,
        moduleId,
        userId: actor.id,
        dbClient: db,
      });
      if (!moduleData) {
        logger.debug(
          { moduleId, userId: actor.id },
          'Module not found or user does not have access',
        );
        return moduleError(
          'NOT_FOUND',
          'This module does not exist or you do not have access to it.',
        );
      }
      return moduleSuccess(moduleData);
    })
    .then((boundaryResult) =>
      finalizePageBoundaryResult(boundaryResult, {
        entityId: moduleId,
        unauthenticatedMessage: 'You must be signed in to view this module.',
        unauthenticated: (message) => {
          logger.debug(
            { moduleId },
            'Module access denied: user not authenticated',
          );
          return moduleError('UNAUTHORIZED', message);
        },
      }),
    );
}
