import { runRegenerationQuotaReserved } from '@/features/billing/regeneration-quota-boundary';
import { resolveUserTier } from '@/features/billing/tier';
import { computeJobPriority, isPriorityTopic } from '@/features/jobs/priority';
import {
  completeJob,
  enqueueJobWithResult,
  failJob,
  getNextJob,
} from '@/features/jobs/queue';
import { tryRegisterInlineDrain } from '@/features/jobs/regeneration-inline-drain';
import { createPlanLifecycleService } from '@/features/plans/lifecycle/factory';
import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { PlanGenerationRateLimitResult } from '@/lib/api/rate-limit';
import { checkPlanGenerationRateLimit } from '@/lib/api/rate-limit';
import { regenerationQueueEnv } from '@/lib/config/env';
import { selectOwnedPlanById } from '@/lib/db/queries/helpers/plans-helpers';
import { getActiveRegenerationJob } from '@/lib/db/queries/jobs';
import type { DbClient } from '@/lib/db/types';
import { logger } from '@/lib/logging/logger';

import type { RegenerationOwnedPlan } from './types';

// Regeneration orchestration owns enqueue/complete/fail via deps.queue and process/request.

export interface RegenerationOrchestrationDeps {
  dbClient: DbClient;
  queue: {
    enabled: () => boolean;
    enqueueWithResult: typeof enqueueJobWithResult;
    getNextJob: typeof getNextJob;
    completeJob: typeof completeJob;
    failJob: typeof failJob;
  };
  quota: {
    runReserved: typeof runRegenerationQuotaReserved;
  };
  plans: {
    getActiveRegenerationJob: (
      planId: string,
      userId: string,
      dbClient: DbClient,
    ) => Promise<{ id: string } | null>;
    findOwnedPlan: (
      planId: string,
      userId: string,
      dbClient: DbClient,
    ) => Promise<RegenerationOwnedPlan | null>;
  };
  tier: {
    resolveUserTier: typeof resolveUserTier;
  };
  priority: {
    computeJobPriority: typeof computeJobPriority;
    isPriorityTopic: typeof isPriorityTopic;
  };
  lifecycle: {
    service: PlanLifecycleService;
  };
  inlineDrain: {
    tryRegister: typeof tryRegisterInlineDrain;
    drain: () => Promise<void>;
  };
  /**
   * Invoked after active-job dedupe passes and before quota reserve + enqueue.
   * Must match {@link checkPlanGenerationRateLimit} semantics (throws RateLimitError when exceeded).
   */
  rateLimit: {
    check: (
      userId: string,
      dbClient: DbClient,
    ) => Promise<PlanGenerationRateLimitResult>;
  };
  logger: Pick<typeof logger, 'debug' | 'info' | 'error' | 'warn'>;
}

type DefaultRegenerationOrchestrationDepsOptions = {
  /**
   * Runs after successful enqueue when inline processing registers.
   * App boundary (e.g. `request.ts`) must pass real drain; `process.ts` uses no-op default.
   */
  inlineDrain?: () => Promise<void>;
};

async function noopInlineDrain(): Promise<void> {}

export function createDefaultRegenerationOrchestrationDeps(
  dbClient: DbClient,
  options: DefaultRegenerationOrchestrationDepsOptions = {},
): RegenerationOrchestrationDeps {
  return {
    dbClient,
    queue: {
      enabled: () => regenerationQueueEnv.enabled,
      enqueueWithResult: enqueueJobWithResult,
      getNextJob,
      completeJob,
      failJob,
    },
    quota: { runReserved: runRegenerationQuotaReserved },
    plans: {
      getActiveRegenerationJob,
      findOwnedPlan: async (planId, userId, client) => {
        const row = await selectOwnedPlanById({
          planId,
          ownerUserId: userId,
          dbClient: client,
        });
        return row;
      },
    },
    tier: { resolveUserTier },
    priority: { computeJobPriority, isPriorityTopic },
    lifecycle: {
      service: createPlanLifecycleService({ dbClient }),
    },
    inlineDrain: {
      tryRegister: tryRegisterInlineDrain,
      drain: options.inlineDrain ?? noopInlineDrain,
    },
    rateLimit: { check: checkPlanGenerationRateLimit },
    logger,
  };
}
