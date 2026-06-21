import type {
  RequestPlanRegenerationArgs,
  RequestPlanRegenerationResult,
} from './types';

import { attachPlanRegenerationWorkflow } from './attach-workflow';
import {
  createDefaultRegenerationOrchestrationDeps,
  type RegenerationOrchestrationDeps,
} from './deps';
import { drainRegenerationQueue } from '@/features/jobs/regeneration-worker';
import { JOB_TYPES, type PlanRegenerationJobData } from '@/features/jobs/types';
import { workflowEnv } from '@/lib/config/env/workflow';
import { recordRegenerationWorkflowAttachUncertain } from '@/lib/logging/ops-alerts';
import { getDb } from '@supabase/runtime';

export async function requestPlanRegeneration(
  args: RequestPlanRegenerationArgs,
  deps?: RegenerationOrchestrationDeps,
): Promise<RequestPlanRegenerationResult> {
  const { userId, planId, overrides, inlineProcessingEnabled } = args;
  const d =
    deps ??
    createDefaultRegenerationOrchestrationDeps(getDb(), {
      inlineDrain: async () => {
        await drainRegenerationQueue({ maxJobs: 1 });
      },
    });

  if (!d.queue.enabled()) {
    return { kind: 'queue-disabled' };
  }

  const plan = await d.plans.findOwnedPlan(planId, userId, d.dbClient);
  if (!plan) {
    return { kind: 'plan-not-found' };
  }

  const existingActiveJob = await d.plans.getActiveRegenerationJob(
    planId,
    userId,
    d.dbClient,
  );
  if (existingActiveJob) {
    return {
      kind: 'active-job-conflict',
      existingJobId: existingActiveJob.id,
    };
  }

  const [planGenerationRateLimit, tier] = await Promise.all([
    d.rateLimit.check(userId, d.dbClient),
    d.tier.resolveUserTier(userId, d.dbClient),
  ]);
  const priority = d.priority.computeJobPriority({
    tier,
    isPriorityTopic: d.priority.isPriorityTopic(overrides?.topic ?? plan.topic),
  });

  const payload: PlanRegenerationJobData = { planId, overrides };

  const boundaryResult = await d.quota.runReserved<
    { jobId: string },
    { existingJobId: string }
  >({
    userId,
    planId,
    dbClient: d.dbClient,
    work: async () => {
      const enqueueResult = await d.queue.enqueueWithResult(
        JOB_TYPES.PLAN_REGENERATION,
        planId,
        userId,
        payload,
        priority,
      );

      if (enqueueResult.deduplicated) {
        return {
          disposition: 'revert' as const,
          value: { existingJobId: enqueueResult.id },
          reason: 'queue-dedupe',
          // Same id as existingJobId; boundary passes to compensation / reconciliation telemetry.
          jobId: enqueueResult.id,
        };
      }

      return {
        disposition: 'consumed' as const,
        value: { jobId: enqueueResult.id },
      };
    },
  });

  if (!boundaryResult.ok) {
    return {
      kind: 'quota-denied',
      currentCount: boundaryResult.currentCount,
      limit: boundaryResult.limit,
      reason: 'Regeneration quota exceeded for your subscription tier.',
    };
  }

  if (!boundaryResult.consumed) {
    return {
      kind: 'queue-dedupe-conflict',
      existingJobId: boundaryResult.value.existingJobId,
      ...(boundaryResult.reconciliationRequired && {
        reconciliationRequired: true,
      }),
    };
  }

  const acceptedJobId = boundaryResult.value.jobId;
  let inlineDrainScheduled = false;

  if (workflowEnv.planRegenerationWorkflowEnabled) {
    const correlationId = `regen-${acceptedJobId}`;
    try {
      const attachResult = await attachPlanRegenerationWorkflow(
        {
          jobId: acceptedJobId,
          planId,
          userId,
          payload,
          correlationId,
        },
        d.queue,
      );
      if (attachResult.kind === 'start-failed') {
        d.logger.error(
          {
            acceptedJobId,
            planId,
            userId,
            correlationId,
          },
          'Failed to start plan regeneration workflow at enqueue time',
        );
        await d.queue.failJob(
          acceptedJobId,
          'Failed to start plan regeneration workflow.',
          { retryable: true },
        );
        return {
          kind: 'workflow-start-failed',
          jobId: acceptedJobId,
          planId,
          retryable: true,
        };
      }

      if (attachResult.kind === 'persist-failed') {
        d.logger.error(
          {
            acceptedJobId,
            planId,
            userId,
            correlationId,
            workflowRunId: attachResult.runId,
            persistError: attachResult.persistError,
            cancellationSucceeded: attachResult.cancellation.succeeded,
          },
          'Failed to persist plan regeneration workflow run id after start',
        );
        if (!attachResult.cancellation.succeeded) {
          recordRegenerationWorkflowAttachUncertain(
            {
              jobId: acceptedJobId,
              planId,
              userId,
              workflowRunId: attachResult.runId,
              cancellationSucceeded: false,
            },
            attachResult.persistError,
          );
        }
        try {
          await d.queue.failJob(
            acceptedJobId,
            'Failed to persist plan regeneration workflow run id.',
            { retryable: false },
          );
        } catch (terminalizeError: unknown) {
          d.logger.error(
            {
              acceptedJobId,
              planId,
              userId,
              correlationId,
              workflowRunId: attachResult.runId,
              terminalizeError,
            },
            'Failed to terminalize plan regeneration job after workflow run id persistence failure',
          );
        }
        return {
          kind: 'workflow-start-failed',
          jobId: acceptedJobId,
          planId,
          retryable: false,
        };
      }
    } catch (error: unknown) {
      // Unexpected attach failure after workflow may have started; do not
      // compensate or mark retryable — rely on reconciliation instead.
      d.logger.error(
        {
          acceptedJobId,
          planId,
          userId,
          correlationId,
          error,
        },
        'Failed to attach plan regeneration workflow',
      );
      await d.queue.failJob(
        acceptedJobId,
        'Failed to attach plan regeneration workflow.',
        { retryable: false },
      );
      throw error;
    }
  } else if (inlineProcessingEnabled) {
    const registered = d.inlineDrain.tryRegister(() => {
      return (async () => {
        try {
          await d.inlineDrain.drain();
        } catch (error: unknown) {
          d.logger.error(
            {
              planId,
              userId,
              error,
              inlineProcessingEnabled,
              drainFn: 'drainRegenerationQueue',
            },
            'Inline regeneration queue drain failed',
          );
        }
      })();
    });
    if (registered) {
      inlineDrainScheduled = true;
    }
  }

  return {
    kind: 'enqueued',
    jobId: acceptedJobId,
    planId,
    status: 'pending',
    inlineDrainScheduled,
    planGenerationRateLimit: {
      remaining: planGenerationRateLimit.remaining,
      limit: planGenerationRateLimit.limit,
      reset: planGenerationRateLimit.reset,
    },
  };
}
