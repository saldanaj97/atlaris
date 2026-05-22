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
   * Master switch for the retention cleanup maintenance endpoint.
   */
  get retentionCleanupEnabled(): boolean {
    return toBoolean(
      defaultMaintenanceAccess.getServerOptional('RETENTION_CLEANUP_ENABLED'),
      true,
    );
  },
  /**
   * Shared bearer token for scheduled retention cleanup triggers.
   */
  get workerToken(): string | undefined {
    return defaultMaintenanceAccess.getServerRequiredProdOnly(
      'MAINTENANCE_WORKER_TOKEN',
    );
  },
};
