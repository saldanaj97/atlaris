import type { ModuleAccessResult } from '@/app/(app)/plans/[id]/modules/[moduleId]/types';

import {
  moduleError,
  moduleSuccess,
} from '@/app/(app)/plans/[id]/modules/[moduleId]/helpers';
import { accessErrorFromAppError } from '@/app/(app)/plans/access-result';
import { getModuleDetailForRead } from '@/features/plans/read-projection/service';
import { requestBoundary } from '@/lib/api/request-boundary';
import { logger } from '@/lib/logging/logger';

/**
 * Loads module detail for the module page.
 * Pass plan and module ids and receive a `ModuleAccessResult` with auth, not-found, and success states.
 * Do not call this server-component loader from `'use server'` action modules.
 */
export function loadModuleForPage(
  planId: string,
  moduleId: string,
): Promise<ModuleAccessResult> {
  return requestBoundary
    .component(async ({ actor, db }) => {
      try {
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
      } catch (error) {
        const mapped = accessErrorFromAppError(error);
        if (mapped) {
          return moduleError(mapped.code, mapped.message, mapped.candidates);
        }
        throw error;
      }
    })
    .then((boundaryResult) => {
      if (boundaryResult !== null) {
        return boundaryResult;
      }
      logger.debug(
        { moduleId },
        'Module access denied: user not authenticated',
      );
      return moduleError(
        'UNAUTHORIZED',
        'You must be signed in to view this module.',
      );
    });
}
