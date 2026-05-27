import {
  createServerEnvAccess,
  type EnvSource,
  getProcessEnvSource,
  type ServerEnvAccess,
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

export function createMaintenanceEnv(access: ServerEnvAccess): MaintenanceEnv {
  return {
    /**
     * Master switch for the manual retention cleanup HTTP endpoint.
     * Scheduled pg_cron cleanup is controlled separately in Supabase.
     */
    get retentionCleanupEnabled(): boolean {
      return toBoolean(
        access.getServerOptional('RETENTION_CLEANUP_ENABLED'),
        false,
      );
    },
    /**
     * Bearer token for manual retention cleanup via the internal HTTP route.
     */
    get workerToken(): string | undefined {
      if (!this.retentionCleanupEnabled) {
        return undefined;
      }
      return access.getServerRequiredProdOnly('MAINTENANCE_WORKER_TOKEN');
    },
  };
}

export function createMaintenanceEnvForTests(env: EnvSource): MaintenanceEnv {
  return createMaintenanceEnv(createServerEnvAccess(() => env));
}

export const maintenanceEnv = createMaintenanceEnv(defaultMaintenanceAccess);
