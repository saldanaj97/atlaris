/**
 * Factory for creating a fully-wired PlanLifecycleService instance.
 *
 * Creates a PlanLifecycleService with all collaborators wired to a single DB connection.
 *
 * Design: All lifecycle operations (plan creation, generation, generation finalization)
 * use the same database connection. This prevents the "closed connection" bug where
 * Connection 1 (request-scoped) was used for lifecycle operations after withAuth's
 * finally block closed it.
 *
 * DB client scoping (server-owned writes):
 *   - Plan stream/retry sessions: service-role client for generation persistence
 *     after request auth and ownership checks at the route boundary
 *   - Workers: service-role client (same server-owned write boundary)
 *   - Reads and pre-write access checks: request-scoped RLS via getDb()
 */

import type { DbClient } from '@/lib/db/types';

import { createPlanLifecycleGeneration } from './generation';
import {
  commitPlanGenerationFailure,
  commitPlanGenerationSuccess,
} from './generation-finalization/store';
import {
  atomicCheckAndInsertPlan,
  findCappedPlanWithoutModules,
  markPlanGenerationFailure,
  markPlanGenerationSuccess,
} from './plan-persistence-store';
import { PlanLifecycleService } from './service';
import { resolveUserTier } from '@/features/billing/tier';
import {
  checkPlanDurationCap,
  normalizePlanDurationForTier,
} from '@/features/plans/policy/duration';

export function createPlanLifecycleService(params: {
  dbClient: DbClient;
}): PlanLifecycleService {
  const { dbClient } = params;

  return new PlanLifecycleService({
    planPersistence: {
      atomicInsertPlan: (userId, planData) =>
        atomicCheckAndInsertPlan(userId, planData, dbClient),
      findCappedPlanWithoutModules: (userId) =>
        findCappedPlanWithoutModules(userId, dbClient),
      markGenerationSuccess: (planId) =>
        markPlanGenerationSuccess(planId, dbClient),
      markGenerationFailure: (planId) =>
        markPlanGenerationFailure(planId, dbClient),
    },
    quota: {
      resolveUserTier: (userId) => resolveUserTier(userId, dbClient),
      checkDurationCap: checkPlanDurationCap,
      normalizePlanDuration: normalizePlanDurationForTier,
    },
    generation: createPlanLifecycleGeneration(dbClient),
    generationFinalization: {
      finalizeSuccess: (input) => commitPlanGenerationSuccess(dbClient, input),
      finalizeFailure: (input) => commitPlanGenerationFailure(dbClient, input),
    },
  });
}
