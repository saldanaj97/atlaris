import type { ModuleAccessResult } from '@/app/(app)/plans/[id]/modules/[moduleId]/types';

import {
  moduleError,
  moduleSuccess,
} from '@/app/(app)/plans/[id]/modules/[moduleId]/helpers';
import { getModuleDetailForRead } from '@/features/plans/read-projection/service';
import { loadAuthorizedPageEntity } from '@/lib/api/load-authorized-page-entity';
import { logger } from '@/lib/logging/logger';

/**
 * Loads module detail for the module page inside a server component boundary.
 * Uses `requestBoundary.component()` — do not call from `'use server'` action modules.
 */
export function loadModuleForPage(
  planId: string,
  moduleId: string,
): Promise<ModuleAccessResult> {
  return loadAuthorizedPageEntity({
    fetch: ({ actor, db }) =>
      getModuleDetailForRead({
        planId,
        moduleId,
        userId: actor.id,
        dbClient: db,
      }),
    notFound: () =>
      moduleError(
        'NOT_FOUND',
        'This module does not exist or you do not have access to it.',
      ),
    success: (moduleData) => moduleSuccess(moduleData),
    unauthenticatedMessage: 'You must be signed in to view this module.',
    unauthenticated: (message) => moduleError('UNAUTHORIZED', message),
    logNotFound: ({ userId }) => {
      logger.debug(
        { moduleId, userId },
        'Module not found or user does not have access',
      );
    },
    logUnauthenticated: () => {
      logger.debug(
        { moduleId },
        'Module access denied: user not authenticated',
      );
    },
  });
}
