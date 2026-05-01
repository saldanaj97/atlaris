import { drainRegenerationQueue } from '@/features/jobs/regeneration-worker';
import { JOB_TYPES, type PlanRegenerationJobData } from '@/features/jobs/types';
import { getDb } from '@/lib/db/runtime';
import {
  createDefaultRegenerationOrchestrationDeps,
  type RegenerationOrchestrationDeps,
} from './deps';
import type {
  RequestPlanRegenerationArgs,
  RequestPlanRegenerationResult,
} from './types';

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

  const planGenerationRateLimit = await d.rateLimit.check(userId, d.dbClient);

  const tier = await d.tier.resolveUserTier(userId, d.dbClient);
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

  // When inlineProcessingEnabled and tryRegister succeeds, drain is scheduled
  // fire-and-forget: it runs async, failures are logged, response returns at
  // once with inlineDrainScheduled=true (caller does not await drain).
  if (inlineProcessingEnabled) {
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
