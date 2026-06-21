import type { RegenerationOrchestrationDeps } from './deps';
import type { PlanRegenerationJobPayload } from './schema';

import { planRegenerationJobPayloadSchema } from './schema';
import { cancelPlanRegenerationWorkflow } from '@/features/plans/cancel-plan-regeneration-workflow';
import { startPlanRegenerationWorkflow } from '@/features/plans/start-plan-regeneration-workflow';

export type AttachPlanRegenerationWorkflowInput = {
  readonly jobId: string;
  readonly planId: string;
  readonly userId: string;
  readonly payload: PlanRegenerationJobPayload;
  readonly correlationId: string;
};

export type AttachPlanRegenerationWorkflowResult =
  | { readonly kind: 'already-attached' }
  | { readonly kind: 'attached'; readonly runId: string }
  | { readonly kind: 'start-failed' }
  | {
      readonly kind: 'persist-failed';
      readonly runId: string;
      readonly persistError: unknown;
      readonly cancellation: {
        readonly requested: true;
        readonly succeeded: boolean;
      };
    };

type AttachPlanRegenerationWorkflowDeps = Pick<
  RegenerationOrchestrationDeps['queue'],
  'failJob' | 'updateRegenerationJobPayload'
>;

/**
 * Ensures a queued regeneration job has a durable workflow run attached.
 * Idempotent when payload already carries a workflow run id.
 */
export async function attachPlanRegenerationWorkflow(
  input: AttachPlanRegenerationWorkflowInput,
  deps: AttachPlanRegenerationWorkflowDeps,
  options: {
    readonly cancelWorkflow?: typeof cancelPlanRegenerationWorkflow;
  } = {},
): Promise<AttachPlanRegenerationWorkflowResult> {
  if (input.payload.workflow?.runId) {
    return { kind: 'already-attached' };
  }

  const workflowStart = await startPlanRegenerationWorkflow(
    {
      jobId: input.jobId,
      planId: input.planId,
      userId: input.userId,
      correlationId: input.correlationId,
    },
    { failJob: deps.failJob },
  );

  if (!workflowStart.started) {
    return { kind: 'start-failed' };
  }

  const cancelWorkflow =
    options.cancelWorkflow ?? cancelPlanRegenerationWorkflow;

  const launchedPayload = planRegenerationJobPayloadSchema.parse({
    ...input.payload,
    workflow: {
      provider: 'workflow-sdk' as const,
      runId: workflowStart.runId,
      startedAt: input.payload.workflow?.startedAt ?? new Date().toISOString(),
    },
  });

  try {
    await deps.updateRegenerationJobPayload(input.jobId, launchedPayload);
  } catch (persistError) {
    // Run started but runId could not be persisted. Cancel the orphan so a retry
    // re-attaches exactly once instead of starting a duplicate run.
    const cancellationSucceeded = await cancelWorkflow(workflowStart.runId);
    return {
      kind: 'persist-failed',
      runId: workflowStart.runId,
      persistError,
      cancellation: { requested: true, succeeded: cancellationSucceeded },
    };
  }

  return { kind: 'attached', runId: workflowStart.runId };
}
