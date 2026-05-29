import type { RegenerationOrchestrationDeps } from './deps';
import type { PlanRegenerationJobPayload } from './schema';
import type { ProcessPlanRegenerationJobResult } from './types';
import type { Job } from '@/features/jobs/types';

import { createDefaultRegenerationOrchestrationDeps } from './deps';
import {
  applyRegenerationGenerationResult,
  buildRegenerationGenerationInput,
  loadAuthorizedRegenerationPlan,
  validateQueuedRegenerationPayload,
} from './process-workflow-support';
import { planRegenerationJobPayloadSchema } from './schema';
import { JOB_TYPES } from '@/features/jobs/types';
import { startPlanRegenerationWorkflow } from '@/features/plans/start-plan-regeneration-workflow';
import { workflowEnv } from '@/lib/config/env/workflow';
import { db as serviceRoleDb } from '@supabase/service-role';

const UNSAFE_WORKER_FAILURE_MESSAGE = 'Queued plan regeneration failed.';

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

    if (workflowEnv.planRegenerationWorkflowEnabled) {
      if (payload.workflow?.runId) {
        return {
          kind: 'workflow-in-flight',
          jobId: job.id,
          planId: payload.planId,
        };
      }

      const workflowStart = await startPlanRegenerationWorkflow(
        {
          jobId: job.id,
          planId: payload.planId,
          userId: job.userId,
          correlationId: `regen-drain-${job.id}`,
        },
        { failJob: d.queue.failJob },
      );

      if (!workflowStart.started) {
        await d.queue.failJob(job.id, UNSAFE_WORKER_FAILURE_MESSAGE, {
          retryable: false,
        });
        return {
          kind: 'permanent-failure',
          jobId: job.id,
          planId: payload.planId,
        };
      }

      const launchedPayload = planRegenerationJobPayloadSchema.parse({
        ...payload,
        workflow: {
          provider: 'workflow-sdk' as const,
          runId: workflowStart.runId,
          startedAt: payload.workflow?.startedAt ?? new Date().toISOString(),
        },
      });
      await d.queue.updateRegenerationJobPayload(job.id, launchedPayload);

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

    try {
      await d.queue.failJob(job.id, UNSAFE_WORKER_FAILURE_MESSAGE, {
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
