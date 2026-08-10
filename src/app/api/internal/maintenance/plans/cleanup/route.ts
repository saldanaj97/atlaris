import { runPlanCleanupMaintenance } from '@/features/plans/cleanup';
import { createMaintenancePostRoute } from '@/lib/api/internal/maintenance-route';
import { json } from '@/lib/api/response';
import { maintenanceEnv } from '@/lib/config/env';

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

export const POST = createMaintenancePostRoute({
  enabled: () => maintenanceEnv.planCleanupEnabled,
  unavailableMessage: 'Plan cleanup is currently unavailable.',
  unauthorizedLogMessage: 'Unauthorized plan cleanup trigger attempt',
  monitor: {
    slug: PLAN_CLEANUP_MONITOR_SLUG,
    config: PLAN_CLEANUP_MONITOR_CONFIG,
  },
  run: async ({ logger }) => {
    logger.info('Starting plan cleanup');

    const result = await runPlanCleanupMaintenance();

    logger.info(result, 'Completed plan cleanup');

    return json({
      ...result,
      ok: true,
    });
  },
});
