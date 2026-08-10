import type { RegenerationOrchestrationDeps } from './deps';
import type { PlanRegenerationJobPayload } from './schema';
import type { ProcessPlanRegenerationJobResult } from './types';
import type { Job } from '@/features/jobs/types';

import { attachPlanRegenerationWorkflow } from './attach-workflow';
import { createDefaultRegenerationOrchestrationDeps } from './deps';
import {
  applyRegenerationGenerationResult,
  buildRegenerationGenerationInput,
  loadAuthorizedRegenerationPlan,
  validateQueuedRegenerationPayload,
} from './process-workflow-support';
import { JOB_TYPES } from '@/features/jobs/types';
import {
  PLAN_REGENERATION_SYNC_FAILURE_MESSAGE,
  PLAN_REGENERATION_WORKFLOW_FAILURE_MESSAGE,
} from '@/features/plans/start-plan-regeneration-workflow';
import { workflowEnv } from '@/lib/config/env/workflow';
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
  const workflowEnabled = workflowEnv.planRegenerationWorkflowEnabled;

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

    if (workflowEnabled) {
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

      if (attachResult.kind === 'already-attached') {
        return {
          kind: 'workflow-in-flight',
          jobId: job.id,
          planId: payload.planId,
        };
      }

      if (attachResult.kind === 'start-failed') {
        await d.queue.failJob(
          job.id,
          PLAN_REGENERATION_WORKFLOW_FAILURE_MESSAGE,
          {
            retryable: false,
          },
        );
        return {
          kind: 'permanent-failure',
          jobId: job.id,
          planId: payload.planId,
        };
      }

      if (attachResult.kind === 'persist-failed') {
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
      }

      return {
        kind: 'workflow-in-flight',
        jobId: job.id,
        planId: payload.planId,
      };
    }

    const userTier = await d.tier.resolveUserTier(plan.userId, d.dbClient);
    const generationInput = buildRegenerationGenerationInput(payload, plan);

    const result = await d.lifecycle.service.processGenerationAttempt({
      planId: plan.id,
      userId: plan.userId,
      tier: userTier,
      input: generationInput,
    });

    return applyRegenerationGenerationResult({ job, plan }, result, d);
  } catch (error) {
    d.logger.error(
      { jobId: job.id, error },
      'Failed while processing queued plan regeneration job',
    );

    const failureMessage = workflowEnabled
      ? PLAN_REGENERATION_WORKFLOW_FAILURE_MESSAGE
      : PLAN_REGENERATION_SYNC_FAILURE_MESSAGE;

    try {
      await d.queue.failJob(job.id, failureMessage, {
        retryable: false,
      });
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
