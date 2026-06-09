import type { PlainHandler } from '@/lib/api/auth';

import { runPlanCleanupMaintenance } from '@/features/plans/cleanup';
import { assertMaintenanceWorkerAccess } from '@/lib/api/internal/internal-worker-access';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { json } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/route-wrappers';
import { maintenanceEnv } from '@/lib/config/env';
import { getLoggingRequestContext } from '@/lib/logging/request-context';

export const POST: PlainHandler = withErrorBoundary(async (request) => {
  const { logger } = getLoggingRequestContext(request);
  const pathname = new URL(request.url).pathname;

  checkIpRateLimit(request, 'internal');

  assertMaintenanceWorkerAccess({
    request,
    pathname,
    logger,
    enabled: maintenanceEnv.planCleanupEnabled,
    unavailableMessage: 'Plan cleanup is currently unavailable.',
    unauthorizedLogMessage: 'Unauthorized plan cleanup trigger attempt',
  });

  logger.info('Starting plan cleanup');

  const result = await runPlanCleanupMaintenance();

  logger.info(result, 'Completed plan cleanup');

  return json({
    ok: true,
    ...result,
  });
});
