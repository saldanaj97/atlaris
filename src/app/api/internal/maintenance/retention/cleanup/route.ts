import { cleanupRetainedDbRows } from '@/lib/db/queries/admin/retention';
import type { PlainHandler } from '@/lib/api/auth';
import { AuthError, ServiceUnavailableError } from '@/lib/api/errors';
import {
  readInternalWorkerToken,
  tokensMatch,
} from '@/lib/api/internal/internal-worker-token';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { withErrorBoundary } from '@/lib/api/route-wrappers';
import { json } from '@/lib/api/response';
import { appEnv, maintenanceEnv } from '@/lib/config/env';
import { getLoggingRequestContext } from '@/lib/logging/request-context';

const MAINTENANCE_WORKER_HEADER = 'x-maintenance-worker-token';

export const POST: PlainHandler = withErrorBoundary(async (request) => {
  const { logger } = getLoggingRequestContext(request);
  const pathname = new URL(request.url).pathname;

  checkIpRateLimit(request, 'internal');

  if (!maintenanceEnv.retentionCleanupEnabled) {
    throw new ServiceUnavailableError(
      'Retention cleanup is currently unavailable.',
    );
  }

  const expectedToken = maintenanceEnv.workerToken;
  if (expectedToken) {
    const providedToken = readInternalWorkerToken(
      request,
      MAINTENANCE_WORKER_HEADER,
    );
    if (!providedToken || !tokensMatch(expectedToken, providedToken)) {
      logger.warn(
        {
          path: pathname,
          method: request.method,
          hasToken: Boolean(providedToken),
        },
        'Unauthorized retention cleanup trigger attempt',
      );

      throw new AuthError('Unauthorized worker trigger.');
    }
  } else if (appEnv.isProduction) {
    logger.error(
      { path: pathname, method: request.method },
      'Maintenance worker token missing in production',
    );

    throw new ServiceUnavailableError(
      'Retention cleanup is currently unavailable.',
    );
  }

  logger.info('Starting retention cleanup');

  const deleted = await cleanupRetainedDbRows();

  logger.info({ deleted }, 'Completed retention cleanup');

  return json({ ok: true, ...deleted });
});
