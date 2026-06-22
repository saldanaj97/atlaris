import type {
  PlanListItem,
  PlanListPage,
  PlanListQuery,
  PlanListStatusCounts,
  PlanReadStatus,
} from '@/features/plans/read-projection/types';
import type { DbClient } from '@/lib/db/types';

import { getGenerationAttemptCap } from '@/features/ai/generation-policy';
import { PLAN_LIST_PAGE_SIZE } from '@/features/plans/read-projection/types';
import { getDb } from '@supabase/runtime';
import { sql, type SQL } from 'drizzle-orm';

type StatusCountRow = { status: PlanReadStatus; total: number };
type PlanListItemRow = {
  id: string;
  topic: string;
  created_at: Date;
  updated_at: Date | null;
  status: PlanReadStatus;
  completed_tasks: number;
  total_tasks: number;
};

const EMPTY_STATUS_COUNTS: PlanListStatusCounts = {
  active: 0,
  paused: 0,
  completed: 0,
  generating: 0,
  failed: 0,
};

function normalizePage(page: number): number {
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
}

function normalizedStatus(
  status: PlanListQuery['status'],
): PlanReadStatus | null {
  if (status === 'all') return null;
  return status === 'inactive' ? 'paused' : status;
}

function planListRowsSql(params: {
  userId: string;
  search: string;
  referenceTimestamp: string;
}): SQL {
  const attemptCap = getGenerationAttemptCap();
  const searchFilter = params.search
    ? sql`and position(lower(${params.search}) in lower(p.topic)) > 0`
    : sql``;

  return sql`
    with module_counts as (
      select m.plan_id, count(*)::int as module_count
      from modules m
      group by m.plan_id
    ),
    attempt_counts as (
      select a.plan_id, count(*)::int as attempt_count
      from generation_attempts a
      group by a.plan_id
    ),
    task_metrics as (
      select
        m.plan_id,
        count(t.id)::int as total_tasks,
        count(t.id) filter (where tp.status = 'completed')::int as completed_tasks
      from modules m
      left join tasks t on t.module_id = m.id
      left join task_progress tp
        on tp.task_id = t.id and tp.user_id = ${params.userId}::uuid
      group by m.plan_id
    ),
    status_rows as (
      select
        p.id,
        p.topic,
        p.created_at,
        p.updated_at,
        coalesce(tm.total_tasks, 0)::int as total_tasks,
        coalesce(tm.completed_tasks, 0)::int as completed_tasks,
        case
          when coalesce(mc.module_count, 0) > 0
            and coalesce(tm.total_tasks, 0) > 0
            and tm.completed_tasks >= tm.total_tasks then 'completed'
          when coalesce(mc.module_count, 0) > 0
            and p.updated_at is not null
            and ${params.referenceTimestamp}::timestamptz - p.updated_at >= interval '30 days' then 'paused'
          when coalesce(mc.module_count, 0) > 0 then 'active'
          when p.generation_status = 'failed' then 'failed'
          when coalesce(ac.attempt_count, 0) >= ${attemptCap} then 'failed'
          else 'generating'
        end as status
      from learning_plans p
      left join module_counts mc on mc.plan_id = p.id
      left join attempt_counts ac on ac.plan_id = p.id
      left join task_metrics tm on tm.plan_id = p.id
      where p.user_id = ${params.userId}::uuid
        ${searchFilter}
    )
  `;
}

export async function getPlanListPageForUser(params: {
  userId: string;
  query: PlanListQuery;
  referenceTimestamp: string;
  dbClient?: DbClient;
}): Promise<PlanListPage> {
  const client = params.dbClient ?? getDb();
  const rowsSql = planListRowsSql({
    userId: params.userId,
    search: params.query.search,
    referenceTimestamp: params.referenceTimestamp,
  });
  const countRows = (await client.execute(sql`
    ${rowsSql}
    select status, count(*)::int as total
    from status_rows
    group by status
  `)) as StatusCountRow[];
  const statusCounts = { ...EMPTY_STATUS_COUNTS };
  for (const row of countRows) {
    statusCounts[row.status] = row.total;
  }

  const status = normalizedStatus(params.query.status);
  const totalSearchResults = Object.values(statusCounts).reduce(
    (total, count) => total + count,
    0,
  );
  const totalItems = status ? statusCounts[status] : totalSearchResults;
  const totalPages = Math.ceil(totalItems / PLAN_LIST_PAGE_SIZE);
  const page = Math.min(normalizePage(params.query.page), totalPages || 1);
  const statusFilter = status ? sql`where status = ${status}` : sql``;
  const itemRows = (await client.execute(sql`
    ${rowsSql}
    select
      id,
      topic,
      created_at,
      updated_at,
      status,
      completed_tasks,
      total_tasks
    from status_rows
    ${statusFilter}
    order by created_at desc, id desc
    limit ${PLAN_LIST_PAGE_SIZE}
    offset ${(page - 1) * PLAN_LIST_PAGE_SIZE}
  `)) as PlanListItemRow[];

  return {
    items: itemRows.map(
      (row): PlanListItem => ({
        id: row.id,
        topic: row.topic,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: row.updated_at
          ? new Date(row.updated_at).toISOString()
          : null,
        status: row.status,
        completedTasks: row.completed_tasks,
        totalTasks: row.total_tasks,
        completion: row.total_tasks ? row.completed_tasks / row.total_tasks : 0,
      }),
    ),
    page,
    pageSize: PLAN_LIST_PAGE_SIZE,
    totalItems,
    totalPages,
    totalSearchResults,
    statusCounts,
    referenceTimestamp: params.referenceTimestamp,
  };
}
