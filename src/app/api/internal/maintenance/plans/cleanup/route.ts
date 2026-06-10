import type { PlainHandler } from '@/lib/api/auth';

import { runPlanCleanupMaintenance } from '@/features/plans/cleanup';
import { assertMaintenanceWorkerAccess } from '@/lib/api/internal/internal-worker-access';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { json } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/route-wrappers';
import { maintenanceEnv } from '@/lib/config/env';
import { getLoggingRequestContext } from '@/lib/logging/request-context';
import * as Sentry from '@sentry/nextjs';

const PLAN_CLEANUP_MONITOR_SLUG = 'plan-cleanup-maintenance';
const PLAN_CLEANUP_MONITOR_CONFIG = {
  schedule: { type: 'crontab', value: '*/15 * * * *' },
  checkinMargin: 5,
  maxRuntime: 5,
  timezone: 'UTC',
  failureIssueThreshold: 1,
  recoveryThreshold: 1,
  isolateTrace: true,
} as const;

const runPlanCleanup: PlainHandler = async (request) => {
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

  return Sentry.withMonitor(
    PLAN_CLEANUP_MONITOR_SLUG,
    async () => {
      logger.info('Starting plan cleanup');

      const result = await runPlanCleanupMaintenance();

      logger.info(result, 'Completed plan cleanup');

      return json({
        ...result,
        ok: true,
      });
    },
    PLAN_CLEANUP_MONITOR_CONFIG,
  );
};

export const POST: PlainHandler = withErrorBoundary(runPlanCleanup);
