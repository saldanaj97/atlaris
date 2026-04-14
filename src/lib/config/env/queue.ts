import {
  getServerOptional,
  getServerRequiredProdOnly,
  IS_PROD_RUNTIME,
  parseEnvNumber,
  toBoolean,
} from '@/lib/config/env/shared';

export const regenerationQueueEnv = {
  /**
   * Master switch for regeneration queue endpoint availability.
   */
  get enabled(): boolean {
    return toBoolean(getServerOptional('REGENERATION_QUEUE_ENABLED'), true);
  },
  /**
   * Optional inline processing mode for local/test environments.
   * In production this should remain disabled and be replaced by a dedicated worker trigger.
   */
  get inlineProcessingEnabled(): boolean {
    return toBoolean(
      getServerOptional('REGENERATION_INLINE_PROCESSING'),
      !IS_PROD_RUNTIME
    );
  },
  /**
   * Maximum jobs to process per worker drain invocation.
   * Explicit 0 means no work per drain (caller can use this to disable processing).
   * Positive fractional values are rounded down, except values between 0 and 1,
   * which resolve to 1 so only an explicit 0 disables draining.
   */
  get maxJobsPerDrain(): number {
    const parsed = parseEnvNumber(
      getServerOptional('REGENERATION_MAX_JOBS_PER_DRAIN')
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
   * Shared bearer token used by scheduled worker trigger calls.
   * This getter delegates to {@link getServerRequiredProdOnly}('REGENERATION_WORKER_TOKEN'),
   * which returns `undefined` in non-production (dev/test) environments. Callers must handle
   * a possibly undefined token when using this value outside production.
   */
  get workerToken(): string | undefined {
    return getServerRequiredProdOnly('REGENERATION_WORKER_TOKEN');
  },
} as const;
