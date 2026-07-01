import type { DbClient } from '@/lib/db/types';

import { getAttemptCap } from '@/lib/config/env';
import { getDb } from '@supabase/runtime';
import { sql, type SQL } from 'drizzle-orm';

export type PlanListRowStatus =
  | 'not_started'
  | 'active'
  | 'paused'
  | 'completed'
  | 'generating'
  | 'failed';
export type PlanListFilterStatus =
  | 'all'
  | Exclude<PlanListRowStatus, 'paused'>
  | 'inactive';
export type PlanListSort = 'recommended' | 'recently_updated' | 'newest';

export type PlanListPageQuery = {
  page: number;
  search: string;
  status: PlanListFilterStatus;
  sort: PlanListSort;
};
export type PlanListQueryItemRow = {
  id: string;
  topic: string;
  createdAt: string;
  updatedAt: string | null;
  status: PlanListRowStatus;
  completedTasks: number;
  totalTasks: number;
};
export type PlanListQueryStatusCounts = Record<PlanListRowStatus, number>;
export type PlanListQueryPageRows = {
  items: PlanListQueryItemRow[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  totalSearchResults: number;
  statusCounts: PlanListQueryStatusCounts;
  referenceTimestamp: string;
};

type StatusCountRow = { status: PlanListRowStatus; total: number };
type PlanListItemRow = {
  id: string;
  topic: string;
  created_at: Date;
  updated_at: Date | null;
  status: PlanListRowStatus;
  completed_tasks: number;
  total_tasks: number;
};

const EMPTY_STATUS_COUNTS: PlanListQueryStatusCounts = {
  not_started: 0,
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
  status: PlanListPageQuery['status'],
): PlanListRowStatus | null {
  if (status === 'all') return null;
  return status === 'inactive' ? 'paused' : status;
}

function planListOrderBy(sort: PlanListSort): SQL {
  if (sort === 'recently_updated') {
    return sql`order by coalesce(updated_at, created_at) desc, id desc`;
  }

  if (sort === 'newest') {
    return sql`order by created_at desc, id desc`;
  }

  return sql`
    -- Bucket by status first; each following CASE only sorts within its bucket (NULLS LAST elsewhere).
    order by
      case status
        when 'active' then 0
        when 'not_started' then 1
        when 'generating' then 2
        when 'failed' then 3
        when 'paused' then 4
        when 'completed' then 5
        else 6
      end,
      case when status = 'active' then coalesce(updated_at, created_at) end desc nulls last,
      case when status = 'not_started' then created_at end desc nulls last,
      case when status in ('generating', 'failed', 'paused', 'completed') then coalesce(updated_at, created_at) end desc nulls last,
      id desc
  `;
}

function planListRowsSql(params: {
  userId: string;
  search: string;
  referenceTimestamp: string;
}): SQL {
  const attemptCap = getAttemptCap();
  const searchFilter = params.search
    ? sql`and position(lower(${params.search}) in lower(up.topic)) > 0`
    : sql``;

  return sql`
    with user_plans as (
      select
        p.id,
        p.topic,
        p.created_at,
        p.updated_at,
        p.generation_status
      from learning_plans p
      where p.user_id = ${params.userId}::uuid
    ),
    filtered_user_plans as (
      select up.*
      from user_plans up
      where true
        ${searchFilter}
    ),
    module_counts as (
      select m.plan_id, count(*)::int as module_count
      from modules m
      inner join filtered_user_plans up on up.id = m.plan_id
      group by m.plan_id
    ),
    attempt_counts as (
      select a.plan_id, count(*)::int as attempt_count
      from generation_attempts a
      inner join filtered_user_plans up on up.id = a.plan_id
      group by a.plan_id
    ),
    task_metrics as (
      select
        m.plan_id,
        count(t.id)::int as total_tasks,
        count(t.id) filter (where tp.status = 'completed')::int as completed_tasks
      from modules m
      inner join filtered_user_plans up on up.id = m.plan_id
      left join tasks t on t.module_id = m.id
      left join task_progress tp
        on tp.task_id = t.id and tp.user_id = ${params.userId}::uuid
      group by m.plan_id
    ),
    status_rows as (
      select
        up.id,
        up.topic,
        up.created_at,
        up.updated_at,
        coalesce(tm.total_tasks, 0)::int as total_tasks,
        coalesce(tm.completed_tasks, 0)::int as completed_tasks,
        case
          when coalesce(mc.module_count, 0) > 0
            and coalesce(tm.total_tasks, 0) > 0
            and tm.completed_tasks >= tm.total_tasks then 'completed'
          when coalesce(mc.module_count, 0) > 0
            and coalesce(tm.completed_tasks, 0) = 0 then 'not_started'
          when coalesce(mc.module_count, 0) > 0
            and up.updated_at is not null
            and ${params.referenceTimestamp}::timestamptz - up.updated_at >= interval '30 days' then 'paused'
          when coalesce(mc.module_count, 0) > 0 then 'active'
          when up.generation_status = 'failed' then 'failed'
          when coalesce(ac.attempt_count, 0) >= ${attemptCap} then 'failed'
          else 'generating'
        end as status
      from filtered_user_plans up
      left join module_counts mc on mc.plan_id = up.id
      left join attempt_counts ac on ac.plan_id = up.id
      left join task_metrics tm on tm.plan_id = up.id
    )
  `;
}

export async function getPlanListPageRowsForUser(params: {
  userId: string;
  query: PlanListPageQuery;
  referenceTimestamp: string;
  pageSize: number;
  dbClient?: DbClient;
}): Promise<PlanListQueryPageRows> {
  const client = params.dbClient ?? getDb();
  const { pageSize } = params;
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
  const totalPages = Math.ceil(totalItems / pageSize);
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
    ${planListOrderBy(params.query.sort)}
    limit ${pageSize}
    offset ${(page - 1) * pageSize}
  `)) as PlanListItemRow[];

  return {
    items: itemRows.map(
      (row): PlanListQueryItemRow => ({
        id: row.id,
        topic: row.topic,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: row.updated_at
          ? new Date(row.updated_at).toISOString()
          : null,
        status: row.status,
        completedTasks: row.completed_tasks,
        totalTasks: row.total_tasks,
      }),
    ),
    page,
    pageSize,
    totalItems,
    totalPages,
    totalSearchResults,
    statusCounts,
    referenceTimestamp: params.referenceTimestamp,
  };
}
