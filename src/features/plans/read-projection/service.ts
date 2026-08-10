import type { ModuleDetailReadModel } from '@/features/plans/read-projection/types';
import type {
  PlanListPage,
  PlanListQuery,
} from '@/features/plans/read-projection/types';
import type { DbClient } from '@/lib/db/types';
import type { PaginationOptions } from '@/shared/constants/pagination';
import type {
  ClientGenerationAttempt,
  ClientPlanDetail,
} from '@/shared/types/client.types';
import type {
  LightweightPlanSummary,
  PlanSummary,
} from '@/shared/types/db.types';

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
import { PLAN_LIST_PAGE_SIZE } from '@/features/plans/read-projection/types';
import {
  getModuleDetailRows,
  getModuleLessonGenerationStatus,
} from '@/lib/db/queries/modules';
import { getPlanListPageRowsForUser } from '@/lib/db/queries/plan-list';
import {
  getLearningPlanDetailRows,
  getLightweightPlanSummaryRowsForUser,
  getPlanAttemptsForUser,
  getPlanStatusRowsForUser,
  getPlanSummaryCount,
  getPlanSummaryRowsForUser,
} from '@/lib/db/queries/plans';
import { logger } from '@/lib/logging/logger';

async function listPlanSummaries(params: {
  userId: string;
  dbClient?: DbClient;
  options?: PaginationOptions & {
    orderBy?: 'createdAt' | 'updatedAt';
    planIds?: string[];
  };
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
const DASHBOARD_PLAN_SUMMARY_LIMIT = 20 as const;

export async function listDashboardPlanSummaries(params: {
  userId: string;
  dbClient?: DbClient;
}): Promise<PlanSummary[]> {
  return listPlanSummaries({
    userId: params.userId,
    dbClient: params.dbClient,
    options: {
      limit: DASHBOARD_PLAN_SUMMARY_LIMIT,
      orderBy: 'updatedAt',
    },
  });
}

export async function getDashboardPlanData(params: {
  userId: string;
  dbClient?: DbClient;
}): Promise<{ summaries: PlanSummary[]; resumePlan: PlanSummary | undefined }> {
  const [summaries, candidatePage] = await Promise.all([
    listDashboardPlanSummaries(params),
    getPlanListPageRowsForUser({
      userId: params.userId,
      dbClient: params.dbClient,
      query: {
        page: 1,
        search: '',
        status: 'all',
        sort: 'recommended',
      },
      referenceTimestamp: new Date().toISOString(),
      pageSize: 1,
    }),
  ]);
  const candidate = candidatePage.items[0];

  if (
    !candidate ||
    (candidate.status !== 'active' &&
      candidate.status !== 'not_started' &&
      candidate.status !== 'generating')
  ) {
    return { summaries, resumePlan: undefined };
  }

  const listedCandidate = summaries.find(
    (summary) => summary.plan.id === candidate.id,
  );
  if (listedCandidate) {
    return { summaries, resumePlan: listedCandidate };
  }

  const [resumePlan] = await listPlanSummaries({
    userId: params.userId,
    dbClient: params.dbClient,
    options: { planIds: [candidate.id] },
  });

  return { summaries, resumePlan };
}

export async function getPlansPageForRead(params: {
  userId: string;
  dbClient?: DbClient;
  query: PlanListQuery;
  referenceTimestamp?: string;
}): Promise<PlanListPage> {
  const rows = await getPlanListPageRowsForUser({
    ...params,
    referenceTimestamp: params.referenceTimestamp ?? new Date().toISOString(),
    pageSize: PLAN_LIST_PAGE_SIZE,
  });

  return {
    ...rows,
    pageSize: PLAN_LIST_PAGE_SIZE,
    items: rows.items.map((item) => ({
      ...item,
      completion: item.totalTasks ? item.completedTasks / item.totalTasks : 0,
    })),
  };
}

export async function listLightweightPlansForApi(params: {
  userId: string;
  dbClient?: DbClient;
  options?: PaginationOptions;
}): Promise<LightweightPlanSummary[]> {
  const rows = await getLightweightPlanSummaryRowsForUser(
    params.userId,
    params.dbClient,
    params.options,
  );

  return buildLightweightPlanSummaries(rows);
}

export async function listUsageAnalyticsPlanSummaries(params: {
  userId: string;
  dbClient?: DbClient;
}): Promise<LightweightPlanSummary[]> {
  return listLightweightPlansForApi(params);
}

export async function getPlanListTotalCount(params: {
  userId: string;
  dbClient?: DbClient;
}): Promise<number> {
  return getPlanSummaryCount(params.userId, params.dbClient);
}

export async function getPlanDetailForRead(params: {
  planId: string;
  userId: string;
  dbClient?: DbClient;
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
  dbClient?: DbClient;
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

export async function getModuleLessonGenerationStatusForRead(params: {
  planId: string;
  moduleId: string;
  userId: string;
  dbClient?: DbClient;
}): Promise<{
  planId: string;
  moduleId: string;
  status: 'not_generated' | 'generating' | 'ready' | 'failed';
  workflowRunId?: string;
} | null> {
  const snapshot = await getModuleLessonGenerationStatus(
    params.planId,
    params.moduleId,
    params.userId,
    params.dbClient,
  );

  if (!snapshot) {
    return null;
  }

  return {
    planId: params.planId,
    moduleId: params.moduleId,
    ...snapshot,
  };
}

export async function getPlanGenerationAttemptsForRead(params: {
  planId: string;
  userId: string;
  dbClient?: DbClient;
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
  dbClient?: DbClient;
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
