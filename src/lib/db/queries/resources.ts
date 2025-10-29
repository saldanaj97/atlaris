/**
 * Database queries for resource management
 * Handles upserting resources and attaching them to tasks
 */

import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { resources, taskResources } from '@/lib/db/schema';
import type { ResourceCandidate } from '@/lib/curation/types';
import { mapSourceToDbResourceType } from '@/lib/curation/types';

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Upsert a resource by URL
 * Creates new resource or updates existing one if URL matches
 * @param candidate Resource candidate to upsert
 * @returns Resource ID
 */
export async function upsertResource(
  candidate: ResourceCandidate
): Promise<string> {
  const dbType = mapSourceToDbResourceType(candidate.source);
  const domain = extractDomain(candidate.url);
  const rawDuration = candidate.metadata?.['durationMinutes'];
  const durationMinutes =
    typeof rawDuration === 'number' && Number.isFinite(rawDuration)
      ? Math.max(0, Math.round(rawDuration))
      : undefined;

  const [result] = await db
    .insert(resources)
    .values({
      type: dbType,
      title: candidate.title,
      url: candidate.url,
      domain,
      durationMinutes,
    })
    .onConflictDoUpdate({
      target: resources.url,
      set: {
        type: dbType,
        title: candidate.title,
        domain,
        durationMinutes,
      },
    })
    .returning();

  return result.id;
}

/**
 * Attach resources to a task with stable ordering
 * Appends resources with order values starting after the current maximum
 * Idempotent: avoids duplicates using unique constraint on (taskId, resourceId)
 * Performs query and insert within a transaction to prevent race conditions
 * @param taskId Task ID
 * @param resourceIds Array of resource IDs in desired order
 */
export async function attachTaskResources(
  taskId: string,
  resourceIds: string[]
): Promise<void> {
  if (resourceIds.length === 0) {
    return;
  }

  // Perform query and insert within a transaction to avoid race conditions
  await db.transaction(async (tx) => {
    // Query current maximum order for the given taskId (or 0 if none)
    const result = await tx
      .select({
        maxOrder: sql<number>`COALESCE(MAX(${taskResources.order}), 0)`.as(
          'maxOrder'
        ),
      })
      .from(taskResources)
      .where(eq(taskResources.taskId, taskId));

    const currentMax = result[0]?.maxOrder ?? 0;

    // Map resourceIds to values using order: currentMax + index + 1
    const values = resourceIds.map((resourceId, index) => ({
      taskId,
      resourceId,
      order: currentMax + index + 1,
    }));

    // Insert within the same transaction
    await tx.insert(taskResources).values(values).onConflictDoNothing();
  });
}

/**
 * Upsert and attach resources to a task
 * Helper function that combines upsert and attachment in order
 * @param taskId Task ID
 * @param candidates Array of resource candidates (in desired order)
 * @returns Array of resource IDs attached
 */
export async function upsertAndAttach(
  taskId: string,
  candidates: ResourceCandidate[]
): Promise<string[]> {
  if (candidates.length === 0) {
    return [];
  }

  // Upsert all resources sequentially
  // Note: Currently sequential. For MVP with small batches (1-3 items), this is acceptable.
  // Batch optimization would require raw SQL with EXCLUDED values or handling conflicts differently.
  const resourceIds: string[] = [];

  for (const candidate of candidates) {
    const resourceId = await upsertResource(candidate);
    resourceIds.push(resourceId);
  }

  // Attach to task with ordering
  await attachTaskResources(taskId, resourceIds);

  return resourceIds;
}
