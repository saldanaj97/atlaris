import type { DbClient } from '@/lib/db/types';

import { learningPlans } from '@supabase/schema';
import { and, eq } from 'drizzle-orm';

export type OwnedPlanRecord = typeof learningPlans.$inferSelect;

type PlanQueryClient = Pick<DbClient, 'select'>;

interface LockedOwnedPlanRecord {
  id: string;
  userId: string;
  generationStatus: OwnedPlanRecord['generationStatus'];
  isQuotaEligible: boolean;
}

interface OwnedPlanQueryParams {
  planId: string;
  ownerUserId: string;
  dbClient: PlanQueryClient;
}

interface LockedOwnedPlanQueryParams {
  planId: string;
  ownerUserId: string;
  dbClient: PlanQueryClient;
}

function ownedPlanWhere(
  planId: string,
  ownerUserId: string,
): ReturnType<typeof and> {
  return and(
    eq(learningPlans.id, planId),
    eq(learningPlans.userId, ownerUserId),
  );
}

export async function selectOwnedPlanById({
  planId,
  ownerUserId,
  dbClient,
}: OwnedPlanQueryParams): Promise<OwnedPlanRecord | null> {
  const [plan] = await dbClient
    .select()
    .from(learningPlans)
    .where(ownedPlanWhere(planId, ownerUserId))
    .limit(1);

  return plan ?? null;
}

export async function lockOwnedPlanById({
  planId,
  ownerUserId,
  dbClient,
}: LockedOwnedPlanQueryParams): Promise<LockedOwnedPlanRecord | null> {
  const [plan] = await dbClient
    .select({
      id: learningPlans.id,
      userId: learningPlans.userId,
      generationStatus: learningPlans.generationStatus,
      isQuotaEligible: learningPlans.isQuotaEligible,
    })
    .from(learningPlans)
    .where(ownedPlanWhere(planId, ownerUserId))
    .limit(1)
    .for('update');

  return plan ?? null;
}
