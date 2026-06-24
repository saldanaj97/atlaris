import { createMaintenancePostRoute } from '@/lib/api/internal/maintenance-route';
import { json } from '@/lib/api/response';
import { maintenanceEnv } from '@/lib/config/env';
import { cleanupRetainedDbRows } from '@/lib/db/queries/admin/retention';

export const POST = createMaintenancePostRoute({
  enabled: () => maintenanceEnv.retentionCleanupEnabled,
  unavailableMessage: 'Retention cleanup is currently unavailable.',
  unauthorizedLogMessage: 'Unauthorized retention cleanup trigger attempt',
  run: async ({ logger }) => {
    logger.info('Starting retention cleanup');

    const deleted = await cleanupRetainedDbRows();

    logger.info({ deleted }, 'Completed retention cleanup');

    return json({ ok: true, ...deleted });
  },
});
