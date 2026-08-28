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

import { assertPlanContentAccess } from '@/features/plans/entitlement/access';
import { ensureFreeAccessSelection } from '@/features/plans/entitlement/store';
import {
  canCreatePlanOnCurrentTier,
  projectPlanListItemForAccess,
  resolvePlanContentAccess,
  type PlanEntitlementSnapshot,
} from '@/features/plans/policy/entitlement';
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
import { selectOwnedPlanById } from '@/lib/db/queries/helpers/plans-helpers';
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

async function requireOwnedPlanReadable(params: {
  planId: string;
  userId: string;
  dbClient?: DbClient;
}): Promise<boolean> {
  const owned = await selectOwnedPlanById({
    planId: params.planId,
    ownerUserId: params.userId,
    dbClient: params.dbClient,
  });
  if (!owned) {
    return false;
  }
  await assertPlanContentAccess({
    userId: params.userId,
    planId: params.planId,
    dbClient: params.dbClient,
  });
  return true;
}

function redactLockedPlanSummary(summary: PlanSummary): PlanSummary {
  return {
    ...summary,
    modules: [],
    completedTasks: 0,
    totalTasks: 0,
    completion: 0,
    totalMinutes: 0,
    completedMinutes: 0,
    completedModules: 0,
  };
}

function redactLockedLightweightSummary(
  summary: LightweightPlanSummary,
): LightweightPlanSummary {
  return {
    ...summary,
    completion: 0,
    completedTasks: 0,
    totalTasks: 0,
    totalMinutes: 0,
    completedMinutes: 0,
    moduleCount: 0,
    completedModules: 0,
  };
}

function projectSummariesForAccess<T extends { plan: { id: string } }>(
  summaries: T[],
  snapshot: PlanEntitlementSnapshot,
  redact: (summary: T) => T,
): T[] {
  return summaries.map((summary) => {
    const access = resolvePlanContentAccess({
      tier: snapshot.subscriptionTier,
      planId: summary.plan.id,
      initialPlanGeneratedAt: snapshot.initialPlanGeneratedAt,
      freeAccessPlanId: snapshot.freeAccessPlanId,
      freeAccessPlanSelectedAt: snapshot.freeAccessPlanSelectedAt,
    });
    return access === 'full' ? summary : redact(summary);
  });
}

async function listPlanSummaries(params: {
  userId: string;
  dbClient?: DbClient;
  options?: PaginationOptions & {
    orderBy?: 'createdAt' | 'updatedAt';
    planIds?: string[];
  };
}): Promise<PlanSummary[]> {
  const [{ snapshot }, rows] = await Promise.all([
    ensureFreeAccessSelection({
      userId: params.userId,
      dbClient: params.dbClient,
    }),
    getPlanSummaryRowsForUser(params.userId, params.dbClient, params.options),
  ]);

  return projectSummariesForAccess(
    buildPlanSummaries(rows),
    snapshot,
    redactLockedPlanSummary,
  );
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
  const { snapshot } = await ensureFreeAccessSelection({
    userId: params.userId,
    dbClient: params.dbClient,
  });
  const selectedFreePlanId =
    snapshot.subscriptionTier === 'free' &&
    snapshot.freeAccessPlanSelectedAt != null
      ? snapshot.freeAccessPlanId
      : null;

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
      planIds: selectedFreePlanId ? [selectedFreePlanId] : undefined,
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
  const resumePlan = listedCandidate
    ? listedCandidate
    : (
        await listPlanSummaries({
          userId: params.userId,
          dbClient: params.dbClient,
          options: { planIds: [candidate.id] },
        })
      )[0];

  const access = resolvePlanContentAccess({
    tier: snapshot.subscriptionTier,
    planId: candidate.id,
    initialPlanGeneratedAt: snapshot.initialPlanGeneratedAt,
    freeAccessPlanId: snapshot.freeAccessPlanId,
    freeAccessPlanSelectedAt: snapshot.freeAccessPlanSelectedAt,
  });
  if (access !== 'full') {
    return { summaries, resumePlan: undefined };
  }

  return { summaries, resumePlan };
}

export async function getPlansPageForRead(params: {
  userId: string;
  dbClient?: DbClient;
  query: PlanListQuery;
  referenceTimestamp?: string;
}): Promise<PlanListPage> {
  const [{ snapshot, decision, candidates }, rows] = await Promise.all([
    ensureFreeAccessSelection({
      userId: params.userId,
      dbClient: params.dbClient,
    }),
    getPlanListPageRowsForUser({
      ...params,
      referenceTimestamp: params.referenceTimestamp ?? new Date().toISOString(),
      pageSize: PLAN_LIST_PAGE_SIZE,
    }),
  ]);

  const selectionRequired = decision === 'selection_required';

  return {
    ...rows,
    pageSize: PLAN_LIST_PAGE_SIZE,
    canCreatePlan: canCreatePlanOnCurrentTier(snapshot),
    selectionRequired,
    selectionCandidates: selectionRequired ? [...candidates] : [],
    ...(selectionRequired
      ? {
          items: [],
          totalItems: 0,
          totalPages: 0,
          totalSearchResults: 0,
          statusCounts: Object.fromEntries(
            Object.keys(rows.statusCounts).map((status) => [status, 0]),
          ) as typeof rows.statusCounts,
        }
      : {
          items: rows.items.map((item) =>
            projectPlanListItemForAccess(
              {
                ...item,
                completion: item.totalTasks
                  ? item.completedTasks / item.totalTasks
                  : 0,
              },
              resolvePlanContentAccess({
                tier: snapshot.subscriptionTier,
                planId: item.id,
                initialPlanGeneratedAt: snapshot.initialPlanGeneratedAt,
                freeAccessPlanId: snapshot.freeAccessPlanId,
                freeAccessPlanSelectedAt: snapshot.freeAccessPlanSelectedAt,
              }),
            ),
          ),
        }),
  };
}

export async function listLightweightPlansForApi(params: {
  userId: string;
  dbClient?: DbClient;
  options?: PaginationOptions;
}): Promise<LightweightPlanSummary[]> {
  const [{ snapshot }, rows] = await Promise.all([
    ensureFreeAccessSelection({
      userId: params.userId,
      dbClient: params.dbClient,
    }),
    getLightweightPlanSummaryRowsForUser(
      params.userId,
      params.dbClient,
      params.options,
    ),
  ]);

  return buildLightweightPlanSummaries(rows).map((summary) => {
    const access = resolvePlanContentAccess({
      tier: snapshot.subscriptionTier,
      planId: summary.id,
      initialPlanGeneratedAt: snapshot.initialPlanGeneratedAt,
      freeAccessPlanId: snapshot.freeAccessPlanId,
      freeAccessPlanSelectedAt: snapshot.freeAccessPlanSelectedAt,
    });
    return access === 'full'
      ? summary
      : redactLockedLightweightSummary(summary);
  });
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
  if (
    !(await requireOwnedPlanReadable({
      planId: params.planId,
      userId: params.userId,
      dbClient: params.dbClient,
    }))
  ) {
    return null;
  }

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
  if (
    !(await requireOwnedPlanReadable({
      planId: params.planId,
      userId: params.userId,
      dbClient: params.dbClient,
    }))
  ) {
    return null;
  }

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
  if (
    !(await requireOwnedPlanReadable({
      planId: params.planId,
      userId: params.userId,
      dbClient: params.dbClient,
    }))
  ) {
    return null;
  }

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
  if (
    !(await requireOwnedPlanReadable({
      planId: params.planId,
      userId: params.userId,
      dbClient: params.dbClient,
    }))
  ) {
    return null;
  }

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
  if (
    !(await requireOwnedPlanReadable({
      planId: params.planId,
      userId: params.userId,
      dbClient: params.dbClient,
    }))
  ) {
    return null;
  }

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
