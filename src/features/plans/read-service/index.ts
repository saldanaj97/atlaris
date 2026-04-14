/** Plan read accessors used by routes and server components. */

import type { PlanDetailStatusSnapshot } from '@/features/plans/read-models/detail';
import {
  getLearningPlanDetail,
  getLightweightPlanSummaries,
  getPlanStatusForUser,
  getPlanSummariesForUser,
  getPlanSummaryCount,
} from '@/lib/db/queries/plans';
import type { getDb } from '@/lib/db/runtime';
import type { PaginationOptions } from '@/shared/constants/pagination';
import type {
  LearningPlanDetail,
  LightweightPlanSummary,
  PlanSummary,
} from '@/shared/types/db.types';

export type PlanDbClient = ReturnType<typeof getDb>;

export async function listDashboardPlanSummaries(params: {
  userId: string;
  dbClient: PlanDbClient;
  options?: PaginationOptions;
}): Promise<PlanSummary[]> {
  return getPlanSummariesForUser(
    params.userId,
    params.dbClient,
    params.options
  );
}

export async function listPlansPageSummaries(params: {
  userId: string;
  dbClient: PlanDbClient;
  options?: PaginationOptions;
}): Promise<PlanSummary[]> {
  return getPlanSummariesForUser(
    params.userId,
    params.dbClient,
    params.options
  );
}

export async function listLightweightPlansForApi(params: {
  userId: string;
  dbClient: PlanDbClient;
  options?: PaginationOptions;
}): Promise<LightweightPlanSummary[]> {
  return getLightweightPlanSummaries(
    params.userId,
    params.dbClient,
    params.options
  );
}

export async function getPlanListTotalCount(params: {
  userId: string;
  dbClient: PlanDbClient;
}): Promise<number> {
  return getPlanSummaryCount(params.userId, params.dbClient);
}

export async function getPlanDetailForRead(params: {
  planId: string;
  userId: string;
  dbClient: PlanDbClient;
}): Promise<LearningPlanDetail | null> {
  return getLearningPlanDetail(params.planId, params.userId, params.dbClient);
}

export async function getPlanGenerationStatusSnapshot(params: {
  planId: string;
  userId: string;
  dbClient: PlanDbClient;
}): Promise<PlanDetailStatusSnapshot | null> {
  return getPlanStatusForUser(params.planId, params.userId, params.dbClient);
}
