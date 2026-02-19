import { and, eq } from 'drizzle-orm';

import { getDb } from '@/lib/db/runtime';
import { learningPlans } from '@/lib/db/schema';

type PlanQueryClient = Pick<ReturnType<typeof getDb>, 'select'>;

export type OwnedPlanRecord = typeof learningPlans.$inferSelect;

export interface LockedOwnedPlanRecord {
  id: string;
  userId: string;
  generationStatus: OwnedPlanRecord['generationStatus'];
}

export interface OwnedPlanQueryParams {
  planId: string;
  ownerUserId: string;
  dbClient: PlanQueryClient;
}

export function ownedPlanWhere(
  planId: string,
  ownerUserId: string
): ReturnType<typeof and> {
  return and(
    eq(learningPlans.id, planId),
    eq(learningPlans.userId, ownerUserId)
  );
}

/**
 * Returns the owned plan row or null when not found/inaccessible.
 */
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

/**
 * Locks and returns the minimal owned-plan row needed in transactional flows.
 */
export async function lockOwnedPlanById({
  planId,
  ownerUserId,
  dbClient,
}: OwnedPlanQueryParams): Promise<LockedOwnedPlanRecord | null> {
  const [plan] = await dbClient
    .select({
      id: learningPlans.id,
      userId: learningPlans.userId,
      generationStatus: learningPlans.generationStatus,
    })
    .from(learningPlans)
    .where(ownedPlanWhere(planId, ownerUserId))
    .limit(1)
    .for('update');

  return plan ?? null;
}
