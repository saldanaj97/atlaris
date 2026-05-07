import { buildLearningPlanDetail } from '@/features/plans/read-projection/detail-aggregate';
import {
  toClientGenerationAttempts,
  toClientPlanDetail,
} from '@/features/plans/read-projection/detail-dto';
import {
  buildPlanDetailStatusSnapshot,
  type PlanDetailStatusSnapshot,
} from '@/features/plans/read-projection/detail-status';
import { buildModuleDetailReadModel } from '@/features/plans/read-projection/module-detail';
import {
  buildLightweightPlanSummaries,
  buildPlanSummaries,
} from '@/features/plans/read-projection/summary-projection';
import type {
  ModuleDetailReadModel,
  PlanDbClient,
} from '@/features/plans/read-projection/types';
import { getModuleDetailRows } from '@/lib/db/queries/modules';
import {
  getLearningPlanDetailRows,
  getLightweightPlanSummaryRowsForUser,
  getPlanAttemptsForUser,
  getPlanStatusRowsForUser,
  getPlanSummaryCount,
  getPlanSummaryRowsForUser,
} from '@/lib/db/queries/plans';
import { logger } from '@/lib/logging/logger';
import type { PaginationOptions } from '@/shared/constants/pagination';
import type {
  ClientGenerationAttempt,
  ClientPlanDetail,
} from '@/shared/types/client.types';
import type {
  LightweightPlanSummary,
  PlanSummary,
} from '@/shared/types/db.types';

async function listPlanSummaries(params: {
  userId: string;
  dbClient?: PlanDbClient;
  options?: PaginationOptions;
}): Promise<PlanSummary[]> {
  const rows = await getPlanSummaryRowsForUser(
    params.userId,
    params.dbClient,
    params.options,
  );

  return buildPlanSummaries(rows);
}

// Keep page-specific entrypoints explicit even while both consumers share the
// same summary projection today.
export async function listDashboardPlanSummaries(params: {
  userId: string;
  dbClient?: PlanDbClient;
  options?: PaginationOptions;
}): Promise<PlanSummary[]> {
  return listPlanSummaries(params);
}

export async function listPlansPageSummaries(params: {
  userId: string;
  dbClient?: PlanDbClient;
  options?: PaginationOptions;
}): Promise<PlanSummary[]> {
  return listPlanSummaries(params);
}

export async function listLightweightPlansForApi(params: {
  userId: string;
  dbClient?: PlanDbClient;
  options?: PaginationOptions;
}): Promise<LightweightPlanSummary[]> {
  const rows = await getLightweightPlanSummaryRowsForUser(
    params.userId,
    params.dbClient,
    params.options,
  );

  return buildLightweightPlanSummaries(rows);
}

export async function getPlanListTotalCount(params: {
  userId: string;
  dbClient?: PlanDbClient;
}): Promise<number> {
  return getPlanSummaryCount(params.userId, params.dbClient);
}

export async function getPlanDetailForRead(params: {
  planId: string;
  userId: string;
  dbClient?: PlanDbClient;
}): Promise<ClientPlanDetail | null> {
  const rows = await getLearningPlanDetailRows(
    params.planId,
    params.userId,
    params.dbClient,
  );

  if (!rows) {
    return null;
  }

  const detail = buildLearningPlanDetail(rows);
  const clientDetail = toClientPlanDetail(detail);
  if (clientDetail === undefined) {
    logger.error(
      {
        planId: detail.plan.id,
        userId: params.userId,
        attemptsCount: detail.attemptsCount,
        latestAttemptId: detail.latestAttempt?.id,
      },
      'Failed to map learning plan detail to client detail',
    );
    return null;
  }

  return clientDetail;
}

export async function getPlanGenerationStatusSnapshot(params: {
  planId: string;
  userId: string;
  dbClient?: PlanDbClient;
}): Promise<PlanDetailStatusSnapshot | null> {
  const rows = await getPlanStatusRowsForUser(
    params.planId,
    params.userId,
    params.dbClient,
  );

  if (!rows) {
    return null;
  }

  return buildPlanDetailStatusSnapshot(rows);
}

export async function getPlanGenerationAttemptsForRead(params: {
  planId: string;
  userId: string;
  dbClient?: PlanDbClient;
}): Promise<ClientGenerationAttempt[] | null> {
  const attempts = await getPlanAttemptsForUser(
    params.planId,
    params.userId,
    params.dbClient,
  );

  if (!attempts) {
    return null;
  }

  return toClientGenerationAttempts(attempts.attempts);
}

export async function getModuleDetailForRead(params: {
  planId: string;
  moduleId: string;
  userId: string;
  dbClient?: PlanDbClient;
}): Promise<ModuleDetailReadModel | null> {
  const rows = await getModuleDetailRows(
    params.planId,
    params.moduleId,
    params.userId,
    params.dbClient,
  );

  if (!rows) {
    return null;
  }

  try {
    const readModel = buildModuleDetailReadModel(rows);
    if (!readModel) {
      logger.error(
        {
          planId: params.planId,
          moduleId: params.moduleId,
          userId: params.userId,
        },
        'Failed to build module detail read model',
      );
      return null;
    }

    return readModel;
  } catch (err) {
    logger.error(
      {
        err,
        planId: params.planId,
        moduleId: params.moduleId,
        userId: params.userId,
      },
      'Failed to build module detail read model',
    );
    return null;
  }
}
