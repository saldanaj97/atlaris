import type { RegenerationOwnedPlan } from './types';
import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { PlanContentAccess } from '@/features/plans/policy/entitlement';
import type { PlanGenerationRateLimitResult } from '@/lib/api/rate-limit';
import type { DbClient } from '@/lib/db/types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

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
  getNextJob,
  updateJobPayloadIfRunIdMissing,
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
    getNextJob: typeof getNextJob;
    completeJob: typeof completeJob;
    failJob: typeof failJob;
    /**
     * First-writer runId claim used by attach. Must be the CAS variant that
     * refuses to overwrite an existing workflow.runId.
     */
    updateRegenerationJobPayload: typeof updateJobPayloadIfRunIdMissing;
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

export function createDefaultRegenerationOrchestrationDeps(
  dbClient: DbClient,
): RegenerationOrchestrationDeps {
  return {
    dbClient,
    queue: {
      enabled: () => regenerationQueueEnv.enabled,
      enqueueWithResult: enqueueJobWithResult,
      getNextJob,
      completeJob,
      failJob,
      updateRegenerationJobPayload: updateJobPayloadIfRunIdMissing,
    },
    quota: {
      peekUsage: (userId, tier, client) =>
        getUsageSummaryForTier({ userId, tier, dbClient: client }),
    },
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
