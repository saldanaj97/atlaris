import {
  createServerEnvAccess,
  getProcessEnvSource,
  toBoolean,
} from '@/lib/config/env/shared';

/**
 * Retention cleanup env flags consumed by the internal maintenance route.
 */
interface MaintenanceEnv {
  readonly retentionCleanupEnabled: boolean;
  readonly workerToken: string | undefined;
}

const defaultMaintenanceAccess = createServerEnvAccess(getProcessEnvSource);

export const maintenanceEnv: MaintenanceEnv = {
  /**
   * Master switch for the manual retention cleanup HTTP endpoint.
   * Scheduled pg_cron cleanup is controlled separately in Supabase.
   */
  get retentionCleanupEnabled(): boolean {
    return toBoolean(
      defaultMaintenanceAccess.getServerOptional('RETENTION_CLEANUP_ENABLED'),
      false,
    );
  },
  /**
   * Bearer token for manual retention cleanup via the internal HTTP route.
   */
  get workerToken(): string | undefined {
    return defaultMaintenanceAccess.getServerRequiredProdOnly(
      'MAINTENANCE_WORKER_TOKEN',
    );
  },
};
