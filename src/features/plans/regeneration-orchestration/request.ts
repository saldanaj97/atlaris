import type { RegenerationRequestDeps } from './deps';
import type {
  RequestPlanRegenerationArgs,
  RequestPlanRegenerationResult,
} from './types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  buildPersistedRegenerationInput,
  resolveRegenerationPolicyDenial,
} from './admission';
import { groundedRegenerationPlanCap } from '@/features/billing/regeneration-quota-boundary';
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

const QUOTA_DENIED_REASON =
  'Regeneration quota exceeded for your subscription tier.';

/** Reasons and note for the job payload; an empty note is left out. */
function regenerationFeedback(
  args: RequestPlanRegenerationArgs,
): Pick<PlanRegenerationJobData, 'reasons' | 'note'> {
  return {
    ...(args.reasons && args.reasons.length > 0
      ? { reasons: args.reasons }
      : {}),
    ...(args.note ? { note: args.note } : {}),
  };
}

/**
 * Fail-fast quota read; nothing is settled until provider start. A grounded
 * run on a tier with a per-plan cap counts this plan's regenerations instead
 * of the monthly meter.
 */
async function peekRegenerationQuota(
  params: {
    readonly userId: string;
    readonly planId: string;
    readonly tier: SubscriptionTier;
    readonly grounded: boolean;
  },
  d: RegenerationRequestDeps,
): Promise<Extract<
  RegenerationRejectedResult,
  { kind: 'quota-denied' }
> | null> {
  const planCap = groundedRegenerationPlanCap(
    params.grounded ? params.tier : undefined,
  );
  if (planCap !== null) {
    const used = await d.quota.countPlanRegenerations(
      params.planId,
      d.dbClient,
    );
    return used >= planCap
      ? {
          kind: 'quota-denied',
          currentCount: used,
          limit: planCap,
          reason: QUOTA_DENIED_REASON,
        }
      : null;
  }

  const usage = await d.quota.peekUsage(params.userId, params.tier, d.dbClient);
  return usage.regenerations.used >= usage.regenerations.limit
    ? {
        kind: 'quota-denied',
        currentCount: usage.regenerations.used,
        limit: usage.regenerations.limit,
        reason: QUOTA_DENIED_REASON,
      }
    : null;
}

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

  // Grounded regeneration (JCS-162): reasons and note, Free's per-plan cap.
  // Flag off keeps today's admission and drops reasons and note.
  const grounded = await d.grounded.isEnabled(tier);
  const merged = buildPersistedRegenerationInput(plan, overrides);
  const policyDenial = resolveRegenerationPolicyDenial({
    tier,
    grounded,
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

  const quotaDenial = await peekRegenerationQuota(
    { userId, planId, tier, grounded },
    d,
  );
  if (quotaDenial) {
    return { kind: 'rejected', result: quotaDenial };
  }

  const feedback = grounded ? regenerationFeedback(args) : {};
  return {
    kind: 'admitted',
    value: {
      userId,
      planId,
      payload: { planId, overrides, ...feedback },
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
