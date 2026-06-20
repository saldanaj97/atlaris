import { logger } from '@/lib/logging/logger';
import { getRun } from 'workflow/api';

export type CancelPlanRegenerationWorkflowDeps = {
  readonly getRunFn?: typeof getRun;
  readonly log?: Pick<typeof logger, 'info' | 'error'>;
};

/**
 * Best-effort cancellation of a started regeneration run. Used when the run was
 * created but its runId could not be persisted, to avoid a duplicate run on retry.
 * Returns true if cancel succeeded; never throws.
 */
export async function cancelPlanRegenerationWorkflow(
  runId: string,
  deps: CancelPlanRegenerationWorkflowDeps = {},
): Promise<boolean> {
  const getRunFn = deps.getRunFn ?? getRun;
  const log = deps.log ?? logger;
  try {
    await getRunFn(runId).cancel();
    return true;
  } catch (error: unknown) {
    log.error(
      { err: error, workflowRunId: runId },
      'Failed to cancel orphaned plan regeneration run',
    );
    return false;
  }
}
