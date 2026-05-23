import { cleanupRetainedDbRows } from '@/lib/db/queries/admin/retention';
import type { PlainHandler } from '@/lib/api/auth';
import { assertInternalWorkerAccess } from '@/lib/api/internal/internal-worker-access';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { withErrorBoundary } from '@/lib/api/route-wrappers';
import { json } from '@/lib/api/response';
import { maintenanceEnv } from '@/lib/config/env';
import { getLoggingRequestContext } from '@/lib/logging/request-context';

const MAINTENANCE_WORKER_HEADER = 'x-maintenance-worker-token';

export const POST: PlainHandler = withErrorBoundary(async (request) => {
  const { logger } = getLoggingRequestContext(request);
  const pathname = new URL(request.url).pathname;

  checkIpRateLimit(request, 'internal');

  assertInternalWorkerAccess({
    request,
    pathname,
    logger,
    enabled: maintenanceEnv.retentionCleanupEnabled,
    workerToken: maintenanceEnv.workerToken,
    headerName: MAINTENANCE_WORKER_HEADER,
    unavailableMessage: 'Retention cleanup is currently unavailable.',
    unauthorizedLogMessage: 'Unauthorized retention cleanup trigger attempt',
    missingWorkerTokenLogMessage:
      'Maintenance worker token missing in production',
  });

  logger.info('Starting retention cleanup');

  const deleted = await cleanupRetainedDbRows();

  logger.info({ deleted }, 'Completed retention cleanup');

  return json({ ok: true, ...deleted });
});
