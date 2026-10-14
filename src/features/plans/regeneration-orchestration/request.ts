import type { RegenerationRequestDeps } from './deps';
import type {
  RequestPlanRegenerationArgs,
  RequestPlanRegenerationResult,
} from './types';

import {
  buildPersistedRegenerationInput,
  resolveRegenerationPolicyDenial,
} from './admission';
import { JOB_TYPES, type PlanRegenerationJobData } from '@/features/jobs/types';

type EnqueuedRegenerationWork =
  | { kind: 'enqueued'; jobId: string }
  | { kind: 'queue-dedupe-conflict'; existingJobId: string };

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
  d: RegenerationRequestDeps,
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
  d: RegenerationRequestDeps,
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

  await d.dispatch({ jobId: enqueueResult.id, planId, userId });
  return { kind: 'enqueued', jobId: enqueueResult.id };
}

function mapEnqueuedRegeneration(
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
    default: {
      const _never: never = work;
      return _never;
    }
  }
}

export async function requestPlanRegeneration(
  args: RequestPlanRegenerationArgs,
  deps: RegenerationRequestDeps,
): Promise<RequestPlanRegenerationResult> {
  const d = deps;

  const admission = await admitPlanRegeneration(args, d);
  if (admission.kind === 'rejected') {
    return admission.result;
  }

  const work = await enqueueAdmittedRegeneration(admission.value, d);
  const settled = mapEnqueuedRegeneration(work);
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
