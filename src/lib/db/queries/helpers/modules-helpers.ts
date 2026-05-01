import type {
  ModuleResourceRow,
  TaskResourceWithResource,
} from '@/lib/db/queries/types/modules.types';

/**
 * Groups resource rows by task ID into a map of taskId -> TaskResourceWithResource[].
 *
 * @param resourceRows - Rows from taskResources + resources join
 * @returns Map of taskId to resource array
 */
export function buildResourcesByTask(
  resourceRows: ModuleResourceRow[],
): Map<string, TaskResourceWithResource[]> {
  const resourcesByTask = new Map<string, TaskResourceWithResource[]>();
  for (const row of resourceRows) {
    const existing = resourcesByTask.get(row.taskId) ?? [];
    existing.push({
      id: row.id,
      taskId: row.taskId,
      resourceId: row.resourceId,
      order: row.order,
      notes: row.notes,
      createdAt: row.createdAt,
      resource: row.resource,
    });
    resourcesByTask.set(row.taskId, existing);
  }
  return resourcesByTask;
}
