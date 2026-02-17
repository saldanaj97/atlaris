import {
  buildTaskResourceInsertValues,
  dedupePreparedCandidatesByUrl,
  mapResourceIdsToInputOrder,
  prepareResourceCandidate,
  prepareResourceCandidates,
} from '@/lib/db/queries/helpers/resources-helpers';
import type {
  AttachTaskResourcesParams,
  PreparedResourceCandidate,
  ResourcesDbClient,
  UpsertAndAttachParams,
  UpsertResourceParams,
} from '@/lib/db/queries/types/resources.types';
import { resources, taskResources, tasks } from '@/lib/db/schema';
import { desc, eq, sql } from 'drizzle-orm';

/**
 * Database queries for resource management.
 *
 * RLS-sensitive module: caller must pass an explicit db client.
 * For worker/system flows that upsert `resources`, this should be the service-role client.
 */

type ResourcesWriteClient = Pick<ResourcesDbClient, 'insert' | 'select'>;

async function upsertPreparedResources(
  preparedCandidates: PreparedResourceCandidate[],
  dbClient: ResourcesWriteClient
): Promise<Map<string, string>> {
  if (preparedCandidates.length === 0) {
    return new Map<string, string>();
  }

  const uniqueCandidates = dedupePreparedCandidatesByUrl(preparedCandidates);

  const rows = await dbClient
    .insert(resources)
    .values(uniqueCandidates)
    .onConflictDoUpdate({
      target: resources.url,
      set: {
        type: sql`excluded.type`,
        title: sql`excluded.title`,
        domain: sql`excluded.domain`,
        durationMinutes: sql`excluded.duration_minutes`,
      },
    })
    .returning({ id: resources.id, url: resources.url });

  return new Map(rows.map((row) => [row.url, row.id]));
}

async function attachTaskResourcesInClient(
  taskId: string,
  resourceIds: string[],
  dbClient: ResourcesWriteClient
): Promise<void> {
  if (resourceIds.length === 0) {
    return;
  }

  const [taskRow] = await dbClient
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1)
    .for('update');

  if (!taskRow?.id) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const [maxOrderRow] = await dbClient
    .select({ order: taskResources.order })
    .from(taskResources)
    .where(eq(taskResources.taskId, taskId))
    .orderBy(desc(taskResources.order))
    .limit(1)
    .for('update');

  const currentMaxOrder = maxOrderRow?.order ?? 0;
  const values = buildTaskResourceInsertValues({
    taskId,
    resourceIds,
  }).map((value) => ({
    ...value,
    order: currentMaxOrder + value.order,
  }));

  await dbClient.insert(taskResources).values(values).onConflictDoNothing();
}

/**
 * Insert a new resource or update an existing one identified by URL.
 *
 * `dbClient` is required to make execution context explicit.
 */
export async function upsertResource({
  candidate,
  dbClient,
}: UpsertResourceParams): Promise<string> {
  const preparedCandidate = prepareResourceCandidate(candidate);
  const idByUrl = await upsertPreparedResources([preparedCandidate], dbClient);
  const resourceId = idByUrl.get(preparedCandidate.url);

  if (!resourceId) {
    throw new Error(
      `Resource upsert did not return an id for URL: ${preparedCandidate.url}`
    );
  }

  return resourceId;
}

/**
 * Attach resources to a task with stable ordering.
 * Appends resources after the current max order and avoids duplicates.
 */
export async function attachTaskResources({
  taskId,
  resourceIds,
  dbClient,
}: AttachTaskResourcesParams): Promise<void> {
  if (resourceIds.length === 0) {
    return;
  }

  await dbClient.transaction(async (tx) => {
    await attachTaskResourcesInClient(taskId, resourceIds, tx);
  });
}

/**
 * Upsert and attach resources to a task in a single transaction.
 *
 * Batches resource upserts into one statement, then attaches in order.
 */
export async function upsertAndAttach({
  taskId,
  candidates,
  dbClient,
}: UpsertAndAttachParams): Promise<string[]> {
  if (candidates.length === 0) {
    return [];
  }

  const preparedCandidates = prepareResourceCandidates(candidates);

  return dbClient.transaction(async (tx) => {
    const idByUrl = await upsertPreparedResources(preparedCandidates, tx);
    const resourceIds = mapResourceIdsToInputOrder(preparedCandidates, idByUrl);

    await attachTaskResourcesInClient(taskId, resourceIds, tx);

    return resourceIds;
  });
}
