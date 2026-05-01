import {
  createServerEnvAccess,
  getProcessEnvSource,
  isProdRuntimeEnv,
  parseEnvNumber,
  toBoolean,
} from '@/lib/config/env/shared';

/**
 * Regeneration queue env flags consumed by API routes and worker triggers.
 */
interface RegenerationQueueEnv {
  readonly enabled: boolean;
  readonly inlineProcessingEnabled: boolean;
  readonly maxJobsPerDrain: number;
  readonly workerToken: string | undefined;
}

const defaultQueueAccess = createServerEnvAccess(getProcessEnvSource);

function isQueueProductionRuntime(): boolean {
  return isProdRuntimeEnv(getProcessEnvSource());
}

export const regenerationQueueEnv: RegenerationQueueEnv = {
  /**
   * Master switch for regeneration queue endpoint availability.
   */
  get enabled(): boolean {
    return toBoolean(
      defaultQueueAccess.getServerOptional('REGENERATION_QUEUE_ENABLED'),
      true,
    );
  },
  /**
   * Optional inline processing mode for local/test environments.
   * In production this should remain disabled and be replaced by a dedicated worker trigger.
   */
  get inlineProcessingEnabled(): boolean {
    return toBoolean(
      defaultQueueAccess.getServerOptional('REGENERATION_INLINE_PROCESSING'),
      !isQueueProductionRuntime(),
    );
  },
  /**
   * Maximum jobs to process per worker drain invocation.
   * Explicit 0 means no work per drain (caller can use this to disable processing).
   */
  get maxJobsPerDrain(): number {
    const parsed = parseEnvNumber(
      defaultQueueAccess.getServerOptional('REGENERATION_MAX_JOBS_PER_DRAIN'),
    );
    if (parsed === undefined || !Number.isFinite(parsed) || parsed < 0) {
      return 1;
    }
    if (parsed === 0) {
      return 0;
    }
    return Math.max(1, Math.floor(parsed));
  },
  /**
   * Shared bearer token for scheduled worker triggers. Undefined outside production.
   */
  get workerToken(): string | undefined {
    return defaultQueueAccess.getServerRequiredProdOnly(
      'REGENERATION_WORKER_TOKEN',
    );
  },
};
