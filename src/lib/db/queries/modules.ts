import { and, asc, eq } from 'drizzle-orm';

import {
  fetchModuleTaskMetricsRows,
  fetchTaskRelationRows,
} from '@/lib/db/queries/helpers/task-relations-helpers';
import type {
  ModuleDetailRows,
  ModuleTaskMetricRow,
  TaskProgress,
  TaskResourceWithResource,
} from '@/lib/db/queries/types/modules.types';
import { getDb } from '@/lib/db/runtime';
import { learningPlans, modules, tasks } from '@/lib/db/schema';

type ModulesDbClient = ReturnType<typeof getDb>;

export type { ModuleDetailRows };

/**
 * Module rows for module-detail read projection (plan-scoped ownership).
 * Uses getDb() for request-scoped RLS when `dbClient` omitted.
 */
export async function getModuleDetailRows(
  planId: string,
  moduleId: string,
  userId: string,
  dbClient?: ModulesDbClient,
): Promise<ModuleDetailRows | null> {
  const client = dbClient ?? getDb();

  const [scoped] = await client
    .select({
      module: modules,
      planId: learningPlans.id,
      planTopic: learningPlans.topic,
    })
    .from(modules)
    .innerJoin(learningPlans, eq(modules.planId, learningPlans.id))
    .where(
      and(
        eq(modules.id, moduleId),
        eq(modules.planId, planId),
        eq(learningPlans.userId, userId),
      ),
    )
    .limit(1);

  if (!scoped) {
    return null;
  }

  const [allModulesRaw, taskRows] = await Promise.all([
    fetchModuleTaskMetricsRows({ planIds: [planId], userId, dbClient: client }),
    client
      .select()
      .from(tasks)
      .where(eq(tasks.moduleId, moduleId))
      .orderBy(asc(tasks.order)),
  ]);

  const moduleMetricsRows: ModuleTaskMetricRow[] = allModulesRaw.map((row) => ({
    id: row.moduleId,
    order: row.moduleOrder,
    title: row.moduleTitle,
    totalTaskCount: Number(row.totalTasks),
    completedTaskCount: Number(row.completedTasks),
  }));

  const taskIds = taskRows.map((task) => task.id);

  const {
    progressRows,
    resourceRows,
  }: {
    progressRows: TaskProgress[];
    resourceRows: TaskResourceWithResource[];
  } =
    taskIds.length === 0
      ? { progressRows: [], resourceRows: [] }
      : await fetchTaskRelationRows({
          taskIds,
          userId,
          dbClient: client,
        });

  return {
    plan: { id: scoped.planId, topic: scoped.planTopic },
    module: scoped.module,
    moduleMetricsRows,
    taskRows,
    progressRows,
    resourceRows,
  };
}
