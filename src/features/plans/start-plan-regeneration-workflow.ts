import { planRegenerationWorkflow } from '@/features/plans/workflows/plan-regeneration.workflow';
import { workflowEnv } from '@/lib/config/env/workflow';
import { logger } from '@/lib/logging/logger';
import { start } from 'workflow/api';

export type StartPlanRegenerationWorkflowInput = {
  readonly jobId: string;
  readonly planId: string;
  readonly userId: string;
  readonly correlationId: string;
};

export type StartPlanRegenerationWorkflowDeps = {
  readonly isEnabled?: () => boolean;
  readonly workflowStart?: typeof start;
  readonly log?: Pick<typeof logger, 'info' | 'error'>;
};

/**
 * Starts durable plan regeneration for a queued job. Resolves once the workflow
 * run is created; completion is handled inside `planRegenerationWorkflow`.
 */
export async function startPlanRegenerationWorkflow(
  input: StartPlanRegenerationWorkflowInput,
  deps: StartPlanRegenerationWorkflowDeps = {},
): Promise<boolean> {
  const isEnabled =
    deps.isEnabled ?? (() => workflowEnv.planRegenerationWorkflowEnabled);
  if (!isEnabled()) {
    return false;
  }

  const workflowStart = deps.workflowStart ?? start;
  const log = deps.log ?? logger;

  let run: Awaited<ReturnType<typeof workflowStart>>;
  try {
    run = await workflowStart(planRegenerationWorkflow, [input]);
  } catch (error: unknown) {
    log.error(
      {
        err: error,
        jobId: input.jobId,
        planId: input.planId,
        userId: input.userId,
        correlationId: input.correlationId,
      },
      'Plan regeneration workflow failed to start',
    );
    return false;
  }
  log.info(
    {
      jobId: input.jobId,
      planId: input.planId,
      userId: input.userId,
      workflowRunId: run.runId,
      correlationId: input.correlationId,
    },
    'Plan regeneration workflow started',
  );

  void run.returnValue.catch((error: unknown) => {
    log.error(
      {
        err: error,
        jobId: input.jobId,
        planId: input.planId,
        userId: input.userId,
        correlationId: input.correlationId,
        workflowRunId: run.runId,
      },
      'Plan regeneration workflow failed',
    );
  });

  return true;
}
