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

type ReservedRegenerationWorkValue =
  | { kind: 'enqueued'; jobId: string }
  | { kind: 'workflow-start-failed'; jobId: string; retryable: boolean }
  | { kind: 'workflow-attach-error'; error: unknown };

type RevertedRegenerationWorkValue =
  | { kind: 'queue-dedupe-conflict'; existingJobId: string }
  | { kind: 'workflow-attach-canceled'; jobId: string };

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
  const workflowEnabled = workflowEnv.planRegenerationWorkflowEnabled;

  const boundaryResult = await d.quota.runReserved<
    ReservedRegenerationWorkValue,
    RevertedRegenerationWorkValue
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
          value: {
            kind: 'queue-dedupe-conflict' as const,
            existingJobId: enqueueResult.id,
          },
          reason: 'queue-dedupe',
          // Same id as existingJobId; boundary passes to compensation / reconciliation telemetry.
          jobId: enqueueResult.id,
        };
      }

      const acceptedJobId = enqueueResult.id;
      if (!workflowEnabled) {
        return {
          disposition: 'consumed' as const,
          value: { kind: 'enqueued' as const, jobId: acceptedJobId },
        };
      }

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
            disposition: 'consumed' as const,
            value: {
              kind: 'workflow-start-failed' as const,
              jobId: acceptedJobId,
              retryable: true,
            },
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

          let terminalized = false;
          try {
            await d.queue.failJob(
              acceptedJobId,
              'Failed to persist plan regeneration workflow run id.',
              { retryable: false },
            );
            terminalized = true;
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

          if (attachResult.cancellation.succeeded && terminalized) {
            return {
              disposition: 'revert' as const,
              value: {
                kind: 'workflow-attach-canceled' as const,
                jobId: acceptedJobId,
              },
              reason: 'workflow-attach-canceled',
              jobId: acceptedJobId,
            };
          }

          return {
            disposition: 'consumed' as const,
            value: {
              kind: 'workflow-start-failed' as const,
              jobId: acceptedJobId,
              retryable: false,
            },
          };
        }

        return {
          disposition: 'consumed' as const,
          value: { kind: 'enqueued' as const, jobId: acceptedJobId },
        };
      } catch (error: unknown) {
        // A workflow may have started, so preserve the reservation for reconciliation.
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
        recordRegenerationWorkflowAttachUncertain(
          {
            jobId: acceptedJobId,
            planId,
            userId,
            correlationId,
          },
          error,
        );
        try {
          await d.queue.failJob(
            acceptedJobId,
            'Failed to attach plan regeneration workflow.',
            { retryable: false },
          );
        } catch (terminalizeError: unknown) {
          d.logger.error(
            { acceptedJobId, terminalizeError },
            'Failed to terminalize plan regeneration job after workflow attachment failure',
          );
        }
        return {
          disposition: 'consumed' as const,
          value: { kind: 'workflow-attach-error' as const, error },
        };
      }
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
    if (boundaryResult.value.kind === 'workflow-attach-canceled') {
      return {
        kind: 'workflow-start-failed',
        jobId: boundaryResult.value.jobId,
        planId,
        retryable: false,
      };
    }

    return {
      kind: 'queue-dedupe-conflict',
      existingJobId: boundaryResult.value.existingJobId,
      ...(boundaryResult.reconciliationRequired && {
        reconciliationRequired: true,
      }),
    };
  }

  if (boundaryResult.value.kind === 'workflow-attach-error') {
    throw boundaryResult.value.error;
  }

  if (boundaryResult.value.kind === 'workflow-start-failed') {
    return {
      kind: 'workflow-start-failed',
      jobId: boundaryResult.value.jobId,
      planId,
      retryable: boundaryResult.value.retryable,
    };
  }

  const acceptedJobId = boundaryResult.value.jobId;
  let inlineDrainScheduled = false;

  if (!workflowEnabled && inlineProcessingEnabled) {
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
