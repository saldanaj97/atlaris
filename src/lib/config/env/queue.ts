import {
  createServerEnvAccess,
  getProcessEnvSource,
  isProdRuntimeEnv,
  toBoolean,
} from '@/lib/config/env/shared';

/**
 * Regeneration queue env flag consumed by the regenerate API route.
 */
interface RegenerationQueueEnv {
  readonly enabled: boolean;
}

const defaultQueueAccess = createServerEnvAccess(getProcessEnvSource);

function isQueueProductionRuntime(): boolean {
  const env = getProcessEnvSource();
  return isProdRuntimeEnv(env) && env.VERCEL_ENV !== 'preview';
}

export const regenerationQueueEnv: RegenerationQueueEnv = {
  /**
   * Master switch for regeneration queue endpoint availability.
   */
  get enabled(): boolean {
    return toBoolean(
      defaultQueueAccess.getServerOptional('REGENERATION_QUEUE_ENABLED'),
      !isQueueProductionRuntime(),
    );
  },
};
