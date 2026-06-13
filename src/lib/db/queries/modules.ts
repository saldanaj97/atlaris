import type {
  ModuleDetailRows,
  ModuleTaskMetricRow,
  TaskProgress,
  TaskResourceWithResource,
} from '@/lib/db/queries/types/modules.types';

import {
  fetchModuleTaskMetricsRows,
  fetchTaskRelationRows,
} from '@/lib/db/queries/helpers/task-relations-helpers';
import { getDb } from '@supabase/runtime';
import { learningPlans, modules, tasks } from '@supabase/schema';
import { and, asc, eq } from 'drizzle-orm';

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

/**
 * Returns the owned module's lesson generation status, or null when missing or
 * unauthorized. Uses the injected request DB client for RLS-scoped reads.
 */
export async function getModuleLessonGenerationStatus(
  planId: string,
  moduleId: string,
  userId: string,
  dbClient?: ModulesDbClient,
): Promise<'not_generated' | 'generating' | 'ready' | 'failed' | null> {
  const client = dbClient ?? getDb();

  const [row] = await client
    .select({
      status: modules.lessonGenerationStatus,
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

  if (!row) {
    return null;
  }

  return row.status;
}
