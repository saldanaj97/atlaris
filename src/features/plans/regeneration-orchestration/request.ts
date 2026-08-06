import type {
  RequestPlanRegenerationArgs,
  RequestPlanRegenerationResult,
} from './types';
import type { RegenerationQuotaWorkResult } from '@/features/billing/regeneration-quota-boundary';

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

type RegenerationRejectedResult = Exclude<
  RequestPlanRegenerationResult,
  { kind: 'enqueued' }
>;

type AdmittedRegeneration = {
  readonly userId: string;
  readonly planId: string;
  readonly payload: PlanRegenerationJobData;
  readonly priority: number;
  readonly workflowEnabled: boolean;
  readonly inlineProcessingEnabled: boolean;
  readonly planGenerationRateLimit: {
    readonly remaining: number;
    readonly limit: number;
    readonly reset: number;
  };
};

type RegenerationAdmission =
  | { readonly kind: 'admitted'; readonly value: AdmittedRegeneration }
  | { readonly kind: 'rejected'; readonly result: RegenerationRejectedResult };

type ReservationBoundaryResult =
  | {
      readonly ok: false;
      readonly currentCount: number;
      readonly limit: number;
    }
  | {
      readonly ok: true;
      readonly consumed: true;
      readonly value: ReservedRegenerationWorkValue;
    }
  | {
      readonly ok: true;
      readonly consumed: false;
      readonly value: RevertedRegenerationWorkValue;
      readonly reconciliationRequired: boolean;
    };

type SettledRegenerationAdmission =
  | { readonly kind: 'accepted'; readonly jobId: string }
  | { readonly kind: 'result'; readonly result: RegenerationRejectedResult };

async function admitPlanRegeneration(
  args: RequestPlanRegenerationArgs,
  d: RegenerationOrchestrationDeps,
): Promise<RegenerationAdmission> {
  const { userId, planId, overrides, inlineProcessingEnabled } = args;

  if (!d.queue.enabled()) {
    return { kind: 'rejected', result: { kind: 'queue-disabled' } };
  }

  const plan = await d.plans.findOwnedPlan(planId, userId, d.dbClient);
  if (!plan) {
    return { kind: 'rejected', result: { kind: 'plan-not-found' } };
  }

  const existingActiveJob = await d.plans.getActiveRegenerationJob(
    planId,
    userId,
    d.dbClient,
  );
  if (existingActiveJob) {
    return {
      kind: 'rejected',
      result: {
        kind: 'active-job-conflict',
        existingJobId: existingActiveJob.id,
      },
    };
  }

  const [planGenerationRateLimit, tier] = await Promise.all([
    d.rateLimit.check(userId, d.dbClient),
    d.tier.resolveUserTier(userId, d.dbClient),
  ]);

  return {
    kind: 'admitted',
    value: {
      userId,
      planId,
      payload: { planId, overrides },
      priority: d.priority.computeJobPriority({
        tier,
        isPriorityTopic: d.priority.isPriorityTopic(
          overrides?.topic ?? plan.topic,
        ),
      }),
      workflowEnabled: workflowEnv.planRegenerationWorkflowEnabled,
      inlineProcessingEnabled,
      planGenerationRateLimit,
    },
  };
}

async function runReservedRegenerationAdmission(
  admission: AdmittedRegeneration,
  d: RegenerationOrchestrationDeps,
): Promise<
  RegenerationQuotaWorkResult<
    ReservedRegenerationWorkValue,
    RevertedRegenerationWorkValue
  >
> {
  const { userId, planId, payload, priority, workflowEnabled } = admission;
  const enqueueResult = await d.queue.enqueueWithResult(
    JOB_TYPES.PLAN_REGENERATION,
    planId,
    userId,
    payload,
    priority,
  );

  if (enqueueResult.deduplicated) {
    return {
      disposition: 'revert',
      value: {
        kind: 'queue-dedupe-conflict',
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
      disposition: 'consumed',
      value: { kind: 'enqueued', jobId: acceptedJobId },
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
        disposition: 'consumed',
        value: {
          kind: 'workflow-start-failed',
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
          disposition: 'revert',
          value: {
            kind: 'workflow-attach-canceled',
            jobId: acceptedJobId,
          },
          reason: 'workflow-attach-canceled',
          jobId: acceptedJobId,
        };
      }

      return {
        disposition: 'consumed',
        value: {
          kind: 'workflow-start-failed',
          jobId: acceptedJobId,
          retryable: false,
        },
      };
    }

    return {
      disposition: 'consumed',
      value: { kind: 'enqueued', jobId: acceptedJobId },
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
      disposition: 'consumed',
      value: { kind: 'workflow-attach-error', error },
    };
  }
}

function mapReservedRegenerationAdmission(
  planId: string,
  boundaryResult: ReservationBoundaryResult,
  d: RegenerationOrchestrationDeps,
): SettledRegenerationAdmission {
  if (!boundaryResult.ok) {
    return {
      kind: 'result',
      result: {
        kind: 'quota-denied',
        currentCount: boundaryResult.currentCount,
        limit: boundaryResult.limit,
        reason: 'Regeneration quota exceeded for your subscription tier.',
      },
    };
  }

  if (!boundaryResult.consumed) {
    if (boundaryResult.value.kind === 'workflow-attach-canceled') {
      if (boundaryResult.reconciliationRequired) {
        d.logger.error(
          {
            jobId: boundaryResult.value.jobId,
            planId,
            reconciliationRequired: true,
          },
          'Regeneration quota revert requires reconciliation after workflow attach cancellation',
        );
      }
      return {
        kind: 'result',
        result: {
          kind: 'workflow-start-failed',
          jobId: boundaryResult.value.jobId,
          planId,
          retryable: false,
        },
      };
    }

    return {
      kind: 'result',
      result: {
        kind: 'queue-dedupe-conflict',
        existingJobId: boundaryResult.value.existingJobId,
        ...(boundaryResult.reconciliationRequired && {
          reconciliationRequired: true,
        }),
      },
    };
  }

  if (boundaryResult.value.kind === 'workflow-attach-error') {
    throw boundaryResult.value.error;
  }

  if (boundaryResult.value.kind === 'workflow-start-failed') {
    return {
      kind: 'result',
      result: {
        kind: 'workflow-start-failed',
        jobId: boundaryResult.value.jobId,
        planId,
        retryable: boundaryResult.value.retryable,
      },
    };
  }

  return { kind: 'accepted', jobId: boundaryResult.value.jobId };
}

function scheduleInlineDrain(
  admission: AdmittedRegeneration,
  d: RegenerationOrchestrationDeps,
): boolean {
  if (admission.workflowEnabled || !admission.inlineProcessingEnabled) {
    return false;
  }

  return d.inlineDrain.tryRegister(() => {
    return (async () => {
      try {
        await d.inlineDrain.drain();
      } catch (error: unknown) {
        d.logger.error(
          {
            planId: admission.planId,
            userId: admission.userId,
            error,
            inlineProcessingEnabled: admission.inlineProcessingEnabled,
            drainFn: 'drainRegenerationQueue',
          },
          'Inline regeneration queue drain failed',
        );
      }
    })();
  });
}

export async function requestPlanRegeneration(
  args: RequestPlanRegenerationArgs,
  deps?: RegenerationOrchestrationDeps,
): Promise<RequestPlanRegenerationResult> {
  const d =
    deps ??
    createDefaultRegenerationOrchestrationDeps(getDb(), {
      inlineDrain: async () => {
        await drainRegenerationQueue({ maxJobs: 1 });
      },
    });

  const admission = await admitPlanRegeneration(args, d);
  if (admission.kind === 'rejected') {
    return admission.result;
  }

  const boundaryResult = await d.quota.runReserved<
    ReservedRegenerationWorkValue,
    RevertedRegenerationWorkValue
  >({
    userId: admission.value.userId,
    planId: admission.value.planId,
    dbClient: d.dbClient,
    work: () => runReservedRegenerationAdmission(admission.value, d),
  });

  const settled = mapReservedRegenerationAdmission(
    admission.value.planId,
    boundaryResult,
    d,
  );
  if (settled.kind === 'result') return settled.result;

  return {
    kind: 'enqueued',
    jobId: settled.jobId,
    planId: admission.value.planId,
    status: 'pending',
    inlineDrainScheduled: scheduleInlineDrain(admission.value, d),
    planGenerationRateLimit: {
      remaining: admission.value.planGenerationRateLimit.remaining,
      limit: admission.value.planGenerationRateLimit.limit,
      reset: admission.value.planGenerationRateLimit.reset,
    },
  };
}
