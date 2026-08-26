import type { PlanListItem } from '@/features/plans/read-projection/types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  evaluateFreeInitialAdmission,
  type FreeInitialAdmissionDecision,
} from '@/shared/policy/free-initial-admission';

export { evaluateFreeInitialAdmission, type FreeInitialAdmissionDecision };

export type PlanContentAccess = 'full' | 'locked' | 'selection_pending';

export type FreeAccessSelectionDecision =
  | 'not_applicable'
  | 'no_plan_available'
  | 'auto_select'
  | 'selection_required';

export type FreeAccessPlanCandidate = {
  readonly id: string;
  readonly topic: string;
  readonly createdAt: string;
  readonly generationStatus:
    | 'generating'
    | 'ready'
    | 'failed'
    | 'pending_retry';
};

export type PlanEntitlementSnapshot = {
  readonly subscriptionTier: SubscriptionTier;
  readonly initialPlanGeneratedAt: Date | null;
  readonly freeAccessPlanId: string | null;
  readonly freeAccessPlanSelectedAt: Date | null;
};

export function isFreeAdmittedTier(
  tier: SubscriptionTier | null | undefined,
): tier is 'free' {
  return tier === 'free';
}

export function resolvePlanContentAccess(params: {
  tier: SubscriptionTier;
  planId: string;
  initialPlanGeneratedAt: Date | null;
  freeAccessPlanId: string | null;
  freeAccessPlanSelectedAt: Date | null;
}): PlanContentAccess {
  if (params.tier !== 'free') {
    return 'full';
  }
  if (params.freeAccessPlanSelectedAt != null) {
    return params.planId === params.freeAccessPlanId ? 'full' : 'locked';
  }
  if (params.initialPlanGeneratedAt != null) {
    return 'selection_pending';
  }
  return 'full';
}

export function resolveFreeAccessSelection(params: {
  tier: SubscriptionTier;
  initialPlanGeneratedAt: Date | null;
  freeAccessPlanSelectedAt: Date | null;
  candidateCount: number;
}): FreeAccessSelectionDecision {
  if (
    params.tier !== 'free' ||
    params.initialPlanGeneratedAt == null ||
    params.freeAccessPlanSelectedAt != null
  ) {
    return 'not_applicable';
  }
  if (params.candidateCount <= 0) {
    return 'no_plan_available';
  }
  if (params.candidateCount === 1) {
    return 'auto_select';
  }
  return 'selection_required';
}

export function projectLockedPlanListItem(
  item: Omit<PlanListItem, 'access'>,
): PlanListItem {
  return {
    id: item.id,
    topic: item.topic,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    status: item.status,
    completion: 0,
    completedTasks: 0,
    totalTasks: 0,
    access: 'locked',
  };
}

export function projectPlanListItemForAccess(
  item: Omit<PlanListItem, 'access'>,
  access: PlanContentAccess,
): PlanListItem {
  switch (access) {
    case 'full':
      return { ...item, access: 'full' };
    case 'locked':
    case 'selection_pending':
      return projectLockedPlanListItem(item);
    default: {
      const _exhaustive: never = access;
      return _exhaustive;
    }
  }
}

export function canCreatePlanOnCurrentTier(
  snapshot: PlanEntitlementSnapshot,
): boolean {
  return !(
    snapshot.subscriptionTier === 'free' &&
    snapshot.initialPlanGeneratedAt != null
  );
}
