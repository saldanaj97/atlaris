import type {
  FreeAccessPlanCandidate,
  FreeAccessSelectionDecision,
  PlanEntitlementSnapshot,
} from '@/features/plans/policy/entitlement';
import type { DbClient } from '@/lib/db/types';

import { resolveFreeAccessSelection } from '@/features/plans/policy/entitlement';
import { getDb } from '@supabase/runtime';
import { generationAttempts, learningPlans, users } from '@supabase/schema';
import { db as serviceRoleDb } from '@supabase/service-role';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';

export type EnsureFreeAccessSelectionResult = {
  readonly snapshot: PlanEntitlementSnapshot;
  readonly decision: FreeAccessSelectionDecision;
  readonly candidates: readonly FreeAccessPlanCandidate[];
};

export type SelectFreeAccessPlanResult =
  | { readonly status: 'selected'; readonly snapshot: PlanEntitlementSnapshot }
  | {
      readonly status: 'already_selected';
      readonly snapshot: PlanEntitlementSnapshot;
    }
  | {
      readonly status: 'not_applicable';
      readonly snapshot: PlanEntitlementSnapshot;
    }
  | {
      readonly status: 'no_plan_available';
      readonly snapshot: PlanEntitlementSnapshot;
    }
  | { readonly status: 'invalid_candidate' };

function toCandidate(row: {
  id: string;
  topic: string;
  createdAt: Date;
  generationStatus: FreeAccessPlanCandidate['generationStatus'];
}): FreeAccessPlanCandidate {
  return {
    id: row.id,
    topic: row.topic,
    createdAt: row.createdAt.toISOString(),
    generationStatus: row.generationStatus,
  };
}

export async function loadPlanEntitlementSnapshot(
  userId: string,
  dbClient: DbClient = getDb(),
): Promise<PlanEntitlementSnapshot> {
  const [row] = await dbClient
    .select({
      subscriptionTier: users.subscriptionTier,
      initialPlanGeneratedAt: users.initialPlanGeneratedAt,
      freeAccessPlanId: users.freeAccessPlanId,
      freeAccessPlanSelectedAt: users.freeAccessPlanSelectedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) {
    throw new Error(`User not found for plan entitlement: ${userId}`);
  }

  return row;
}

const RETAINED_ELIGIBLE_PLAN = sql`(
  ${learningPlans.finalizedAt} is not null
  or ${learningPlans.isQuotaEligible} = true
  or exists (
    select 1 from ${generationAttempts}
    where ${generationAttempts.planId} = ${learningPlans.id}
      and ${generationAttempts.status} = 'success'
  )
)
and not (
  ${learningPlans.generationStatus} = 'failed'
  and ${learningPlans.isQuotaEligible} = false
)`;

export async function listFreeAccessCandidates(
  userId: string,
  dbClient: DbClient = getDb(),
): Promise<FreeAccessPlanCandidate[]> {
  const rows = await dbClient
    .select({
      id: learningPlans.id,
      topic: learningPlans.topic,
      createdAt: learningPlans.createdAt,
      generationStatus: learningPlans.generationStatus,
    })
    .from(learningPlans)
    .where(and(eq(learningPlans.userId, userId), RETAINED_ELIGIBLE_PLAN))
    .orderBy(asc(learningPlans.createdAt));

  return rows.map(toCandidate);
}

async function candidateOwnedByUser(params: {
  userId: string;
  planId: string;
  dbClient: DbClient;
}): Promise<boolean> {
  const [row] = await params.dbClient
    .select({ id: learningPlans.id })
    .from(learningPlans)
    .where(
      and(
        eq(learningPlans.id, params.planId),
        eq(learningPlans.userId, params.userId),
        RETAINED_ELIGIBLE_PLAN,
      ),
    )
    .limit(1);

  return row != null;
}

async function casSelectFreeAccessPlan(params: {
  userId: string;
  planId: string;
  selectedAt: Date;
}): Promise<boolean> {
  const updated = await serviceRoleDb
    .update(users)
    .set({
      freeAccessPlanId: params.planId,
      freeAccessPlanSelectedAt: params.selectedAt,
    })
    .where(
      and(
        eq(users.id, params.userId),
        eq(users.subscriptionTier, 'free'),
        isNull(users.freeAccessPlanSelectedAt),
      ),
    )
    .returning({ id: users.id });

  return updated.length > 0;
}

export async function ensureFreeAccessSelection(params: {
  userId: string;
  dbClient?: DbClient;
  now?: () => Date;
}): Promise<EnsureFreeAccessSelectionResult> {
  const dbClient = params.dbClient ?? getDb();
  const snapshot = await loadPlanEntitlementSnapshot(params.userId, dbClient);
  const pendingDecision = resolveFreeAccessSelection({
    tier: snapshot.subscriptionTier,
    initialPlanGeneratedAt: snapshot.initialPlanGeneratedAt,
    freeAccessPlanSelectedAt: snapshot.freeAccessPlanSelectedAt,
    candidateCount: 1,
  });

  if (pendingDecision === 'not_applicable') {
    return { snapshot, decision: 'not_applicable', candidates: [] };
  }

  const candidates = await listFreeAccessCandidates(params.userId, dbClient);
  const decision = resolveFreeAccessSelection({
    tier: snapshot.subscriptionTier,
    initialPlanGeneratedAt: snapshot.initialPlanGeneratedAt,
    freeAccessPlanSelectedAt: snapshot.freeAccessPlanSelectedAt,
    candidateCount: candidates.length,
  });

  if (decision !== 'auto_select') {
    return { snapshot, decision, candidates };
  }

  const onlyCandidate = candidates[0];
  if (!onlyCandidate) {
    return { snapshot, decision: 'no_plan_available', candidates };
  }

  const wrote = await casSelectFreeAccessPlan({
    userId: params.userId,
    planId: onlyCandidate.id,
    selectedAt: (params.now ?? (() => new Date()))(),
  });
  const next = await loadPlanEntitlementSnapshot(params.userId, dbClient);
  if (!wrote) {
    return {
      snapshot: next,
      decision:
        next.freeAccessPlanSelectedAt != null
          ? 'not_applicable'
          : 'no_plan_available',
      candidates,
    };
  }

  return { snapshot: next, decision, candidates };
}

export async function selectFreeAccessPlan(params: {
  userId: string;
  planId: string;
  dbClient?: DbClient;
  now?: () => Date;
}): Promise<SelectFreeAccessPlanResult> {
  const dbClient = params.dbClient ?? getDb();
  const snapshot = await loadPlanEntitlementSnapshot(params.userId, dbClient);
  const decision = resolveFreeAccessSelection({
    tier: snapshot.subscriptionTier,
    initialPlanGeneratedAt: snapshot.initialPlanGeneratedAt,
    freeAccessPlanSelectedAt: snapshot.freeAccessPlanSelectedAt,
    candidateCount: 1,
  });

  if (snapshot.freeAccessPlanSelectedAt != null) {
    return { status: 'already_selected', snapshot };
  }
  if (decision === 'not_applicable') {
    return { status: 'not_applicable', snapshot };
  }

  const owned = await candidateOwnedByUser({
    userId: params.userId,
    planId: params.planId,
    dbClient,
  });
  if (!owned) {
    return { status: 'invalid_candidate' };
  }

  const wrote = await casSelectFreeAccessPlan({
    userId: params.userId,
    planId: params.planId,
    selectedAt: (params.now ?? (() => new Date()))(),
  });
  const next = await loadPlanEntitlementSnapshot(params.userId, dbClient);
  if (!wrote) {
    if (next.freeAccessPlanSelectedAt != null) {
      return { status: 'already_selected', snapshot: next };
    }
    return { status: 'no_plan_available', snapshot: next };
  }

  return { status: 'selected', snapshot: next };
}
