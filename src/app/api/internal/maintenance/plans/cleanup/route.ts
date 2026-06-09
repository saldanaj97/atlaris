import type { PlainHandler } from '@/lib/api/auth';

import { runPlanCleanupMaintenance } from '@/features/plans/cleanup';
import { assertInternalWorkerAccess } from '@/lib/api/internal/internal-worker-access';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { json } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/route-wrappers';
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
    enabled: maintenanceEnv.planCleanupEnabled,
    workerToken: maintenanceEnv.workerToken,
    headerName: MAINTENANCE_WORKER_HEADER,
    unavailableMessage: 'Plan cleanup is currently unavailable.',
    unauthorizedLogMessage: 'Unauthorized plan cleanup trigger attempt',
    missingWorkerTokenLogMessage:
      'Maintenance worker token missing in production',
  });

  logger.info('Starting plan cleanup');

  const result = await runPlanCleanupMaintenance();

  logger.info(result, 'Completed plan cleanup');

  return json({
    ok: true,
    ...result,
  });
});
