import type {
  RequestPlanRegenerationArgs,
  RequestPlanRegenerationResult,
} from './types';

import {
  buildPersistedRegenerationInput,
  resolveRegenerationPolicyDenial,
} from './admission';
import { attachPlanRegenerationWorkflow } from './attach-workflow';
import {
  createDefaultRegenerationOrchestrationDeps,
  type RegenerationOrchestrationDeps,
} from './deps';
import { JOB_TYPES, type PlanRegenerationJobData } from '@/features/jobs/types';
import { recordRegenerationWorkflowAttachUncertain } from '@/lib/logging/ops-alerts';
import { getDb } from '@supabase/runtime';

type EnqueuedRegenerationWork =
  | { kind: 'enqueued'; jobId: string }
  | { kind: 'workflow-start-failed'; jobId: string; retryable: boolean }
  | { kind: 'workflow-attach-error'; error: unknown }
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
  readonly planGenerationRateLimit: {
    readonly remaining: number;
    readonly limit: number;
    readonly reset: number;
  };
};

type RegenerationAdmission =
  | { readonly kind: 'admitted'; readonly value: AdmittedRegeneration }
  | { readonly kind: 'rejected'; readonly result: RegenerationRejectedResult };

async function admitPlanRegeneration(
  args: RequestPlanRegenerationArgs,
  d: RegenerationOrchestrationDeps,
): Promise<RegenerationAdmission> {
  const { userId, planId, overrides } = args;

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

  const merged = buildPersistedRegenerationInput(plan, overrides);
  const policyDenial = resolveRegenerationPolicyDenial({
    tier,
    weeklyHours: merged.weeklyHours,
    startDate: merged.startDate,
    deadlineDate: merged.deadlineDate,
  });
  if (policyDenial?.kind === 'not-included') {
    return { kind: 'rejected', result: { kind: 'not-included' } };
  }
  if (policyDenial?.kind === 'duration-exceeded') {
    return {
      kind: 'rejected',
      result: {
        kind: 'duration-exceeded',
        reason: policyDenial.reason,
        ...(policyDenial.upgradeUrl !== undefined
          ? { upgradeUrl: policyDenial.upgradeUrl }
          : {}),
      },
    };
  }

  const access = await d.plans.readContentAccess(planId, userId, d.dbClient);
  if (access !== 'full') {
    return { kind: 'rejected', result: { kind: 'content-locked' } };
  }

  const usage = await d.quota.peekUsage(userId, tier, d.dbClient);
  if (usage.regenerations.used >= usage.regenerations.limit) {
    return {
      kind: 'rejected',
      result: {
        kind: 'quota-denied',
        currentCount: usage.regenerations.used,
        limit: usage.regenerations.limit,
        reason: 'Regeneration quota exceeded for your subscription tier.',
      },
    };
  }

  return {
    kind: 'admitted',
    value: {
      userId,
      planId,
      payload: { planId, overrides },
      priority: d.priority.computeJobPriority({
        tier,
        isPriorityTopic: d.priority.isPriorityTopic(plan.topic),
      }),
      planGenerationRateLimit,
    },
  };
}

async function enqueueAdmittedRegeneration(
  admission: AdmittedRegeneration,
  d: RegenerationOrchestrationDeps,
): Promise<EnqueuedRegenerationWork> {
  const { userId, planId, payload, priority } = admission;
  const enqueueResult = await d.queue.enqueueWithResult(
    JOB_TYPES.PLAN_REGENERATION,
    planId,
    userId,
    payload,
    priority,
  );

  if (enqueueResult.deduplicated) {
    return {
      kind: 'queue-dedupe-conflict',
      existingJobId: enqueueResult.id,
    };
  }

  const acceptedJobId = enqueueResult.id;
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
          kind: 'workflow-attach-canceled',
          jobId: acceptedJobId,
        };
      }

      return {
        kind: 'workflow-start-failed',
        jobId: acceptedJobId,
        retryable: false,
      };
    }

    return { kind: 'enqueued', jobId: acceptedJobId };
  } catch (error: unknown) {
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
      kind: 'workflow-attach-error',
      error,
    };
  }
}

function mapEnqueuedRegeneration(
  planId: string,
  work: EnqueuedRegenerationWork,
):
  | { kind: 'accepted'; jobId: string }
  | { kind: 'result'; result: RegenerationRejectedResult } {
  switch (work.kind) {
    case 'enqueued':
      return { kind: 'accepted', jobId: work.jobId };
    case 'queue-dedupe-conflict':
      return {
        kind: 'result',
        result: {
          kind: 'queue-dedupe-conflict',
          existingJobId: work.existingJobId,
        },
      };
    case 'workflow-attach-canceled':
      return {
        kind: 'result',
        result: {
          kind: 'workflow-start-failed',
          jobId: work.jobId,
          planId,
          retryable: false,
        },
      };
    case 'workflow-start-failed':
      return {
        kind: 'result',
        result: {
          kind: 'workflow-start-failed',
          jobId: work.jobId,
          planId,
          retryable: work.retryable,
        },
      };
    case 'workflow-attach-error':
      throw work.error;
    default: {
      const _never: never = work;
      return _never;
    }
  }
}

export async function requestPlanRegeneration(
  args: RequestPlanRegenerationArgs,
  deps?: RegenerationOrchestrationDeps,
): Promise<RequestPlanRegenerationResult> {
  const d = deps ?? createDefaultRegenerationOrchestrationDeps(getDb());

  const admission = await admitPlanRegeneration(args, d);
  if (admission.kind === 'rejected') {
    return admission.result;
  }

  const work = await enqueueAdmittedRegeneration(admission.value, d);
  const settled = mapEnqueuedRegeneration(admission.value.planId, work);
  if (settled.kind === 'result') return settled.result;

  return {
    kind: 'enqueued',
    jobId: settled.jobId,
    planId: admission.value.planId,
    status: 'pending',
    planGenerationRateLimit: {
      remaining: admission.value.planGenerationRateLimit.remaining,
      limit: admission.value.planGenerationRateLimit.limit,
      reset: admission.value.planGenerationRateLimit.reset,
    },
  };
}
