import type { RegenerationOwnedPlan } from './types';
import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { PlanContentAccess } from '@/features/plans/policy/entitlement';
import type { PlanGenerationRateLimitResult } from '@/lib/api/rate-limit';
import type { DbClient } from '@/lib/db/types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { isGroundedEnabled } from '@/features/ai/grounded-generation-flag';
import { countProviderStartedRegenerations } from '@/features/billing/regeneration-quota-boundary';
import { resolveUserTier } from '@/features/billing/tier';
import {
  getUsageSummaryForTier,
  type UsageSummary,
} from '@/features/billing/usage-metrics';
import { computeJobPriority, isPriorityTopic } from '@/features/jobs/priority';
import {
  completeJob,
  enqueueJobWithResult,
  failJob,
} from '@/features/jobs/queue';
import { readPlanContentAccess } from '@/features/plans/entitlement/access';
import { createPlanLifecycleService } from '@/features/plans/lifecycle/factory';
import { checkPlanGenerationRateLimit } from '@/lib/api/rate-limit';
import { regenerationQueueEnv } from '@/lib/config/env';
import { selectOwnedPlanById } from '@/lib/db/queries/helpers/plans-helpers';
import { getActiveRegenerationJob } from '@/lib/db/queries/jobs';
import { logger } from '@/lib/logging/logger';
import { db as serviceRoleDb } from '@supabase/service-role';

// Regeneration orchestration owns enqueue/complete/fail via deps.queue and process/request.

export interface RegenerationOrchestrationDeps {
  dbClient: DbClient;
  queue: {
    enabled: () => boolean;
    enqueueWithResult: typeof enqueueJobWithResult;
    completeJob: typeof completeJob;
    failJob: typeof failJob;
  };
  quota: {
    /**
     * Non-settling monthly usage read for HTTP fail-fast. Settlement happens at
     * provider start via `reserveRegenerationQuotaAtProviderStart`.
     */
    peekUsage: (
      userId: string,
      tier: SubscriptionTier,
      dbClient: DbClient,
    ) => Promise<UsageSummary>;
    /**
     * This plan's regenerations that reached provider start, for the
     * per-plan grounded cap (JCS-162). Settled again at provider start.
     */
    countPlanRegenerations: (
      planId: string,
      dbClient: DbClient,
    ) => Promise<number>;
  };
  grounded: {
    /** `groundedGeneration` flag for the tier (fails closed). */
    isEnabled: (tier: SubscriptionTier) => Promise<boolean>;
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
    readContentAccess: (
      planId: string,
      userId: string,
      dbClient: DbClient,
    ) => Promise<PlanContentAccess>;
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
  /**
   * Invoked after active-job dedupe passes and before enqueue.
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

/** Deps for the enqueue request, which also hands the job to the jobs Worker. */
export interface RegenerationRequestDeps extends RegenerationOrchestrationDeps {
  /**
   * Must not throw; a failed hand-off leaves the job pending for the Worker's
   * sweep.
   */
  dispatch: (input: RegenerationDispatchInput) => Promise<void>;
}

export type RegenerationDispatchInput = {
  readonly jobId: string;
  readonly planId: string;
  readonly userId: string;
};

export function createDefaultRegenerationOrchestrationDeps(
  dbClient: DbClient,
): RegenerationOrchestrationDeps {
  return {
    dbClient,
    queue: {
      enabled: () => regenerationQueueEnv.enabled,
      enqueueWithResult: enqueueJobWithResult,
      completeJob,
      failJob,
    },
    quota: {
      peekUsage: (userId, tier, client) =>
        getUsageSummaryForTier({ userId, tier, dbClient: client }),
      countPlanRegenerations: (planId, client) =>
        countProviderStartedRegenerations({ planId, dbClient: client }),
    },
    grounded: { isEnabled: isGroundedEnabled },
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
      readContentAccess: (planId, userId, client) =>
        readPlanContentAccess({ userId, planId, dbClient: client }),
    },
    tier: { resolveUserTier },
    priority: { computeJobPriority, isPriorityTopic },
    lifecycle: {
      service: createPlanLifecycleService({ dbClient: serviceRoleDb }),
    },
    rateLimit: { check: checkPlanGenerationRateLimit },
    logger,
  };
}
