import type { RegenerationOrchestrationDeps } from './deps';
import type { PlanRegenerationJobPayload } from './schema';
import type { ProcessPlanRegenerationJobResult } from './types';
import type { Job } from '@/features/jobs/types';

import { attachPlanRegenerationWorkflow } from './attach-workflow';
import { createDefaultRegenerationOrchestrationDeps } from './deps';
import {
  loadAuthorizedRegenerationPlan,
  validateQueuedRegenerationPayload,
} from './process-workflow-support';
import { JOB_TYPES } from '@/features/jobs/types';
import { PLAN_REGENERATION_WORKFLOW_FAILURE_MESSAGE } from '@/features/plans/start-plan-regeneration-workflow';
import { recordRegenerationWorkflowAttachUncertain } from '@/lib/logging/ops-alerts';
import { db as serviceRoleDb } from '@supabase/service-role';

export async function processNextPlanRegenerationJob(
  deps?: RegenerationOrchestrationDeps,
): Promise<ProcessPlanRegenerationJobResult> {
  const d = deps ?? createDefaultRegenerationOrchestrationDeps(serviceRoleDb);
  const job = await d.queue.getNextJob([JOB_TYPES.PLAN_REGENERATION]);

  if (!job) {
    return { kind: 'no-job' };
  }

  return processPlanRegenerationJob(job, d);
}

export async function processPlanRegenerationJob(
  job: Job,
  deps?: RegenerationOrchestrationDeps,
): Promise<ProcessPlanRegenerationJobResult> {
  const d = deps ?? createDefaultRegenerationOrchestrationDeps(serviceRoleDb);

  /** Set after successful parse; available in `catch` for `permanent-failure` planId when the row lacks it. */
  let payload: PlanRegenerationJobPayload | undefined;

  try {
    const validation = await validateQueuedRegenerationPayload(job, d);
    if (!validation.ok) {
      return validation.result;
    }

    payload = validation.payload;

    const plan = await loadAuthorizedRegenerationPlan(payload, job, d);
    if (!plan) {
      await d.queue.failJob(job.id, 'Plan not found for queued regeneration.', {
        retryable: false,
      });
      return {
        kind: 'plan-not-found-or-unauthorized',
        jobId: job.id,
        planId: payload.planId,
      };
    }

    const attachResult = await attachPlanRegenerationWorkflow(
      {
        jobId: job.id,
        planId: payload.planId,
        userId: job.userId,
        payload,
        correlationId: `regen-drain-${job.id}`,
      },
      d.queue,
    );

    if (
      attachResult.kind === 'already-attached' ||
      attachResult.kind === 'attached'
    ) {
      return {
        kind: 'workflow-in-flight',
        jobId: job.id,
        planId: payload.planId,
      };
    }

    if (attachResult.kind === 'start-failed') {
      // Match enqueue-time start-failed: keep the job pending for retry.
      const failedJob = await d.queue.failJob(
        job.id,
        PLAN_REGENERATION_WORKFLOW_FAILURE_MESSAGE,
        { retryable: true },
      );
      return {
        kind: 'retryable-failure',
        jobId: job.id,
        planId: payload.planId,
        willRetry: failedJob?.status === 'pending',
      };
    }

    d.logger.error(
      {
        jobId: job.id,
        planId: payload.planId,
        userId: job.userId,
        workflowRunId: attachResult.runId,
        persistError: attachResult.persistError,
        cancellationSucceeded: attachResult.cancellation.succeeded,
      },
      'Failed to persist plan regeneration workflow run id after start',
    );
    if (!attachResult.cancellation.succeeded) {
      recordRegenerationWorkflowAttachUncertain(
        {
          jobId: job.id,
          planId: payload.planId,
          userId: job.userId,
          workflowRunId: attachResult.runId,
          cancellationSucceeded: false,
        },
        attachResult.persistError,
      );
    }
    await d.queue.failJob(
      job.id,
      'Failed to persist plan regeneration workflow run id.',
      { retryable: false },
    );
    return {
      kind: 'permanent-failure',
      jobId: job.id,
      planId: payload.planId,
    };
  } catch (error) {
    d.logger.error(
      { jobId: job.id, error },
      'Failed while processing queued plan regeneration job',
    );

    try {
      await d.queue.failJob(
        job.id,
        PLAN_REGENERATION_WORKFLOW_FAILURE_MESSAGE,
        {
          retryable: false,
        },
      );
    } catch (secondaryError) {
      d.logger.error(
        { jobId: job.id, error: secondaryError },
        'Failed to persist failure state for queued plan regeneration job',
      );
    }

    const planIdForFailure = job.planId ?? payload?.planId;

    return {
      kind: 'permanent-failure',
      jobId: job.id,
      ...(planIdForFailure != null ? { planId: planIdForFailure } : {}),
    };
  }
}
