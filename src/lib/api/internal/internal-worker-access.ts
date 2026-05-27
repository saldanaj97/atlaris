import type { Logger } from '@/lib/logging/logger';

import { AuthError, ServiceUnavailableError } from '@/lib/api/errors';
import {
  readInternalWorkerToken,
  tokensMatch,
} from '@/lib/api/internal/internal-worker-token';
import { appEnv } from '@/lib/config/env';

export type AssertInternalWorkerAccessArgs = {
  request: Request;
  pathname: string;
  logger: Logger;
  enabled: boolean;
  workerToken: string | undefined;
  headerName: string;
  unavailableMessage: string;
  unauthorizedLogMessage: string;
  missingWorkerTokenLogMessage: string;
};

/**
 * Shared auth gate for internal worker/maintenance POST routes.
 */
export function assertInternalWorkerAccess(
  args: AssertInternalWorkerAccessArgs,
): void {
  const {
    request,
    pathname,
    logger,
    enabled,
    workerToken,
    headerName,
    unavailableMessage,
    unauthorizedLogMessage,
    missingWorkerTokenLogMessage,
  } = args;

  if (!enabled) {
    throw new ServiceUnavailableError(unavailableMessage);
  }

  if (workerToken) {
    const providedToken = readInternalWorkerToken(request, headerName);
    if (!providedToken || !tokensMatch(workerToken, providedToken)) {
      logger.warn(
        {
          path: pathname,
          method: request.method,
          hasToken: Boolean(providedToken),
        },
        unauthorizedLogMessage,
      );

      throw new AuthError('Unauthorized worker trigger.');
    }

    return;
  }

  if (appEnv.isProduction) {
    logger.error(
      { path: pathname, method: request.method },
      missingWorkerTokenLogMessage,
    );

    throw new ServiceUnavailableError(unavailableMessage);
  }
}
