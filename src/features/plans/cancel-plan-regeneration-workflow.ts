import { logger } from '@/lib/logging/logger';
import { getRun } from 'workflow/api';

const intentionallyCancelledRunIds = new Set<string>();

/** Marks a run so {@link startPlanRegenerationWorkflow} ignores its returnValue rejection. */
export function markPlanRegenerationRunIntentionallyCancelled(
  runId: string,
): void {
  intentionallyCancelledRunIds.add(runId);
}

function unmarkPlanRegenerationRunIntentionallyCancelled(runId: string): void {
  intentionallyCancelledRunIds.delete(runId);
}

export function consumeIntentionalPlanRegenerationCancellation(
  runId: string,
): boolean {
  if (!intentionallyCancelledRunIds.has(runId)) {
    return false;
  }
  intentionallyCancelledRunIds.delete(runId);
  return true;
}

/** Test-only: clears orphan-cancellation markers between specs. */
export function resetPlanRegenerationCancellationMarkersForTests(): void {
  intentionallyCancelledRunIds.clear();
}

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
  markPlanRegenerationRunIntentionallyCancelled(runId);
  try {
    await getRunFn(runId).cancel();
    return true;
  } catch (error: unknown) {
    unmarkPlanRegenerationRunIntentionallyCancelled(runId);
    log.error(
      { err: error, workflowRunId: runId },
      'Failed to cancel orphaned plan regeneration run',
    );
    return false;
  }
}
