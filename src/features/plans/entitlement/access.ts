import type { PlanContentAccess } from '@/features/plans/policy/entitlement';
import type { DbClient } from '@/lib/db/types';

import {
  throwFreePlanSelectionRequired,
  throwPlanEntitlementRequired,
} from '@/features/plans/entitlement/errors';
import { ensureFreeAccessSelection } from '@/features/plans/entitlement/store';
import { resolvePlanContentAccess } from '@/features/plans/policy/entitlement';

export async function readPlanContentAccess(params: {
  userId: string;
  planId: string;
  dbClient: DbClient;
}): Promise<PlanContentAccess> {
  const dbClient = params.dbClient;
  const { snapshot } = await ensureFreeAccessSelection({
    userId: params.userId,
    dbClient,
  });

  return resolvePlanContentAccess({
    tier: snapshot.subscriptionTier,
    planId: params.planId,
    initialPlanGeneratedAt: snapshot.initialPlanGeneratedAt,
    freeAccessPlanId: snapshot.freeAccessPlanId,
    freeAccessPlanSelectedAt: snapshot.freeAccessPlanSelectedAt,
  });
}

export async function assertPlanContentAccess(params: {
  userId: string;
  planId: string;
  dbClient: DbClient;
}): Promise<void> {
  const dbClient = params.dbClient;
  const { snapshot, decision, candidates } = await ensureFreeAccessSelection({
    userId: params.userId,
    dbClient,
  });
  const access = resolvePlanContentAccess({
    tier: snapshot.subscriptionTier,
    planId: params.planId,
    initialPlanGeneratedAt: snapshot.initialPlanGeneratedAt,
    freeAccessPlanId: snapshot.freeAccessPlanId,
    freeAccessPlanSelectedAt: snapshot.freeAccessPlanSelectedAt,
  });

  switch (access) {
    case 'full':
      return;
    case 'locked':
      throwPlanEntitlementRequired();
    case 'selection_pending':
      if (decision === 'selection_required') {
        throwFreePlanSelectionRequired(candidates);
      }
      throwPlanEntitlementRequired();
    default: {
      const _exhaustive: never = access;
      return _exhaustive;
    }
  }
}
