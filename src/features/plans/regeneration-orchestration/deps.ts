import type { RegenerationOwnedPlan } from './types';
import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { PlanContentAccess } from '@/features/plans/policy/entitlement';
import type { PlanGenerationRateLimitResult } from '@/lib/api/rate-limit';
import type { DbClient } from '@/lib/db/types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { isRegenerationPaused } from './paused-flag';
import { isGroundedEnabled } from '@/features/ai/grounded-generation-flag';
import { countProviderStartedRegenerations } from '@/features/billing/regeneration-quota-boundary';
import { resolveUserTier } from '@/features/billing/tier';
import {
  getUsageSummaryForTier,
  type UsageSummary,
} from '@/features/billing/usage-metrics';
import {
  computeJobPriority,
  isPriorityTopic,
} from '@/features/job-queue/priority';
import {
  completeJob,
  enqueueJobWithResult,
  failJob,
} from '@/features/job-queue/queue';
import { readPlanContentAccess } from '@/features/plans/entitlement/access';
import { createPlanLifecycleService } from '@/features/plans/lifecycle/factory';
import { checkPlanGenerationRateLimit } from '@/lib/api/rate-limit';
import { selectOwnedPlanById } from '@/lib/db/queries/helpers/plans-helpers';
import { getActiveRegenerationJob } from '@/lib/db/queries/jobs';
import { logger } from '@/lib/logging/logger';
import { db as serviceRoleDb } from '@supabase/service-role';

export interface RegenerationOrchestrationDeps {
  dbClient: DbClient;
  queue: {
    isPaused: () => Promise<boolean>;
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
    countPlanRegenerations: (
      planId: string,
      dbClient: DbClient,
    ) => Promise<number>;
  };
  grounded: {
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
  rateLimit: {
    check: (
      userId: string,
      dbClient: DbClient,
    ) => Promise<PlanGenerationRateLimitResult>;
  };
  logger: Pick<typeof logger, 'debug' | 'info' | 'error' | 'warn'>;
}

export interface RegenerationRequestDeps extends RegenerationOrchestrationDeps {
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
      isPaused: isRegenerationPaused,
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
