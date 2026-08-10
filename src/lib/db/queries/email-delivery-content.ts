import type { DbClient } from '@/lib/db/types';

import {
  learningActivityEvents,
  learningPlans,
  modules,
  taskProgress,
  tasks,
} from '@supabase/schema';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

type ContentDb = Pick<DbClient, 'execute' | 'select'>;

export type EmailDailyReminderPlan = {
  id: string;
  topic: string;
  completedTasks: number;
  totalTasks: number;
};

/**
 * Distinct local YYYY-MM-DD activity day keys for a bounded window.
 * Uses parameterized timestamp bounds so (user_id, occurred_at) can be used.
 */
export async function listEmailActivityDayKeysForUser(args: {
  userId: string;
  timeZone: string;
  /** Inclusive local date key YYYY-MM-DD */
  startDateKeyInclusive: string;
  /** Exclusive local date key YYYY-MM-DD */
  endDateKeyExclusive: string;
  dbClient: ContentDb;
}): Promise<string[]> {
  const rows = (await args.dbClient.execute(sql`
    SELECT DISTINCT to_char(
      (${learningActivityEvents.occurredAt} AT TIME ZONE ${args.timeZone}),
      'YYYY-MM-DD'
    ) AS day_key
    FROM ${learningActivityEvents}
    WHERE ${learningActivityEvents.userId} = ${args.userId}
      AND ${learningActivityEvents.occurredAt} >= (
        (${args.startDateKeyInclusive}::timestamp AT TIME ZONE ${args.timeZone})
      )
      AND ${learningActivityEvents.occurredAt} < (
        (${args.endDateKeyExclusive}::timestamp AT TIME ZONE ${args.timeZone})
      )
    ORDER BY 1 ASC
  `)) as Array<{ day_key: string }>;

  return rows.map((row) => row.day_key);
}

/**
 * One deterministic incomplete ready plan for daily reminder content, or null.
 */
export async function findEmailDailyReminderPlanForUser(
  userId: string,
  dbClient: ContentDb,
): Promise<EmailDailyReminderPlan | null> {
  const rows = await dbClient
    .select({
      id: learningPlans.id,
      topic: learningPlans.topic,
      totalTasks: sql<number>`count(${tasks.id})::int`,
      completedTasks: sql<number>`coalesce(sum(case when ${taskProgress.status} = 'completed' then 1 else 0 end), 0)::int`,
    })
    .from(learningPlans)
    .leftJoin(modules, eq(modules.planId, learningPlans.id))
    .leftJoin(tasks, eq(tasks.moduleId, modules.id))
    .leftJoin(
      taskProgress,
      and(
        eq(taskProgress.taskId, tasks.id),
        eq(taskProgress.userId, learningPlans.userId),
      ),
    )
    .where(
      and(
        eq(learningPlans.userId, userId),
        eq(learningPlans.generationStatus, 'ready'),
      ),
    )
    .groupBy(learningPlans.id, learningPlans.topic, learningPlans.createdAt)
    .having(
      sql`count(${tasks.id}) > 0 AND coalesce(sum(case when ${taskProgress.status} = 'completed' then 1 else 0 end), 0) < count(${tasks.id})`,
    )
    .orderBy(desc(learningPlans.createdAt), asc(learningPlans.id))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    topic: row.topic,
    totalTasks: Number(row.totalTasks),
    completedTasks: Number(row.completedTasks),
  };
}
