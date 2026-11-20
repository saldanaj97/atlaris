import type { GenerationFinalizationStoreDeps } from './generation-finalization/types';
import type { AiPlanGenerationProvider } from '@/features/ai/types/provider.types';
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
import { resolveUserTier, resolveUserTrialing } from '@/features/billing/tier';
import {
  checkPlanDurationCap,
  normalizePlanDurationForTier,
} from '@/features/plans/policy/duration';

export function createPlanLifecycleService(params: {
  dbClient: DbClient;
  startModuleLessons?: GenerationFinalizationStoreDeps['startModuleLessons'];
  generationProvider?: AiPlanGenerationProvider;
}): PlanLifecycleService {
  const { dbClient, startModuleLessons, generationProvider } = params;

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
      resolveUserTrialing: (userId) => resolveUserTrialing(userId, dbClient),
      checkDurationCap: checkPlanDurationCap,
      normalizePlanDuration: normalizePlanDurationForTier,
    },
    generation: createPlanLifecycleGeneration(
      dbClient,
      generationProvider ? { provider: generationProvider } : {},
    ),
    // Intended owner: these store functions implement the lifecycle port.
    // Production callers settle through PlanLifecycleService, not these imports.
    generationFinalization: {
      finalizeSuccess: (input) =>
        commitPlanGenerationSuccess(
          dbClient,
          input,
          startModuleLessons ? { startModuleLessons } : {},
        ),
      finalizeFailure: (input) => commitPlanGenerationFailure(dbClient, input),
    },
  });
}
