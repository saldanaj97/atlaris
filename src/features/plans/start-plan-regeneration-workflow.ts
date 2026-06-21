import { failJob } from '@/features/jobs/queue';
import { consumeIntentionalPlanRegenerationCancellation } from '@/features/plans/cancel-plan-regeneration-workflow';
import { planRegenerationWorkflow } from '@/features/plans/workflows/plan-regeneration.workflow';
import { workflowEnv } from '@/lib/config/env/workflow';
import { logger } from '@/lib/logging/logger';
import { start } from 'workflow/api';

export const PLAN_REGENERATION_WORKFLOW_FAILURE_MESSAGE =
  'Queued plan regeneration failed.';

export const PLAN_REGENERATION_SYNC_FAILURE_MESSAGE =
  'Failed while processing queued plan regeneration job.';

export type StartPlanRegenerationWorkflowInput = {
  readonly jobId: string;
  readonly planId: string;
  readonly userId: string;
  readonly correlationId: string;
};

export type StartPlanRegenerationWorkflowResult =
  | { readonly started: false }
  | { readonly started: true; readonly runId: string };

export type StartPlanRegenerationWorkflowDeps = {
  readonly isEnabled?: () => boolean;
  readonly workflowStart?: typeof start;
  readonly failJob?: typeof failJob;
  readonly log?: Pick<typeof logger, 'info' | 'error'>;
};

/**
 * Starts durable plan regeneration for a queued job. Resolves once the workflow
 * run is created; completion is handled inside `planRegenerationWorkflow`.
 */
export async function startPlanRegenerationWorkflow(
  input: StartPlanRegenerationWorkflowInput,
  deps: StartPlanRegenerationWorkflowDeps = {},
): Promise<StartPlanRegenerationWorkflowResult> {
  const isEnabled =
    deps.isEnabled ?? (() => workflowEnv.planRegenerationWorkflowEnabled);
  if (!isEnabled()) {
    return { started: false };
  }

  const workflowStart = deps.workflowStart ?? start;
  const queueFailJob = deps.failJob ?? failJob;
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
    return { started: false };
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
    if (consumeIntentionalPlanRegenerationCancellation(run.runId)) {
      log.info(
        {
          jobId: input.jobId,
          planId: input.planId,
          userId: input.userId,
          correlationId: input.correlationId,
          workflowRunId: run.runId,
        },
        'Plan regeneration workflow cancelled after orphan cleanup',
      );
      return;
    }

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

    void queueFailJob(input.jobId, PLAN_REGENERATION_WORKFLOW_FAILURE_MESSAGE, {
      retryable: false,
    }).catch((failError: unknown) => {
      log.error(
        {
          err: failError,
          jobId: input.jobId,
          planId: input.planId,
          workflowRunId: run.runId,
        },
        'Failed to terminalize plan regeneration job after workflow rejection',
      );
    });
  });

  return { started: true, runId: run.runId };
}
