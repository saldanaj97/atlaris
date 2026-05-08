import * as Sentry from '@sentry/nextjs';

export type ResolveMaintenanceFlag = () => Promise<boolean>;

const MAINTENANCE_FLAG_FAIL_OPEN =
  'Maintenance flag evaluation failed; failing open (not treating as maintenance mode).';

export async function resolveEffectiveMaintenanceMode(
  envMaintenanceMode: boolean,
  options: { resolveMaintenanceFlag: ResolveMaintenanceFlag },
): Promise<boolean> {
  if (envMaintenanceMode) {
    return true;
  }

  try {
    return await options.resolveMaintenanceFlag();
  } catch (error: unknown) {
    console.warn(`[atlaris] ${MAINTENANCE_FLAG_FAIL_OPEN}`, error);
    Sentry.withScope((scope) => {
      scope.setTag('feature', 'maintenance_flag');
      scope.setTag('outcome', 'fail_open');
      scope.setExtra('detail', MAINTENANCE_FLAG_FAIL_OPEN);
      const err = error instanceof Error ? error : new Error(String(error));
      Sentry.captureException(err);
    });
    return false;
  }
}
