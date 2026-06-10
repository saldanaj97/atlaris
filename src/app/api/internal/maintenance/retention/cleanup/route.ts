import type { PlainHandler } from '@/lib/api/auth';

import { assertMaintenanceWorkerAccess } from '@/lib/api/internal/internal-worker-access';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { json } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/route-wrappers';
import { maintenanceEnv } from '@/lib/config/env';
import { cleanupRetainedDbRows } from '@/lib/db/queries/admin/retention';
import { getLoggingRequestContext } from '@/lib/logging/request-context';

export const POST: PlainHandler = withErrorBoundary(async (request) => {
  const { logger } = getLoggingRequestContext(request);
  const pathname = new URL(request.url).pathname;

  checkIpRateLimit(request, 'internal');

  assertMaintenanceWorkerAccess({
    request,
    pathname,
    logger,
    enabled: maintenanceEnv.retentionCleanupEnabled,
    unavailableMessage: 'Retention cleanup is currently unavailable.',
    unauthorizedLogMessage: 'Unauthorized retention cleanup trigger attempt',
  });

  logger.info('Starting retention cleanup');

  const deleted = await cleanupRetainedDbRows();

  logger.info({ deleted }, 'Completed retention cleanup');

  return json({ ok: true, ...deleted });
});
