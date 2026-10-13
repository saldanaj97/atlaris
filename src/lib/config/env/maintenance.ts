import {
  createServerEnvAccess,
  type EnvSource,
  getProcessEnvSource,
  type ServerEnvAccess,
  toBoolean,
} from '@/lib/config/env/shared';

/**
 * Maintenance cleanup env flags consumed by internal maintenance routes.
 */
interface MaintenanceEnv {
  readonly retentionCleanupEnabled: boolean;
  readonly planCleanupEnabled: boolean;
  readonly clerkBillingReconciliationEnabled: boolean;
  readonly workerToken: string | undefined;
  readonly workerHealthToken: string | undefined;
}

const defaultMaintenanceAccess = createServerEnvAccess(getProcessEnvSource);

function createMaintenanceEnv(access: ServerEnvAccess): MaintenanceEnv {
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
     * Master switch for the manual plan cleanup HTTP endpoint.
     */
    get planCleanupEnabled(): boolean {
      return toBoolean(access.getServerOptional('PLAN_CLEANUP_ENABLED'), false);
    },
    /**
     * Master switch for the manual Clerk Billing reconciliation HTTP endpoint.
     */
    get clerkBillingReconciliationEnabled(): boolean {
      return toBoolean(
        access.getServerOptional('CLERK_BILLING_RECONCILIATION_ENABLED'),
        false,
      );
    },
    /**
     * Bearer token for authenticated maintenance HTTP routes.
     * Availability is independent of the email-notification-delivery Vercel Flag.
     * In production, missing token makes the authenticated worker boundary unavailable.
     */
    get workerToken(): string | undefined {
      return access.getServerRequiredProdOnly('MAINTENANCE_WORKER_TOKEN');
    },
    /**
     * Bearer token for GET /api/health/worker operator metrics.
     */
    get workerHealthToken(): string | undefined {
      return access.getServerRequiredProdOnly('WORKER_HEALTH_TOKEN');
    },
  };
}

export function createMaintenanceEnvForTests(env: EnvSource): MaintenanceEnv {
  return createMaintenanceEnv(createServerEnvAccess(() => env));
}

export const maintenanceEnv = createMaintenanceEnv(defaultMaintenanceAccess);
