/**
 * Database queries for resource management
 * Handles upserting resources and attaching them to tasks
 */

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
  const durationMinutes = candidate.metadata.durationMinutes as
    | number
    | undefined;

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
 * Creates task_resource entries with order starting at 1
 * Idempotent: avoids duplicates using unique constraint
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

  // Insert task resources with order
  const values = resourceIds.map((resourceId, index) => ({
    taskId,
    resourceId,
    order: index + 1,
  }));

  await db.insert(taskResources).values(values).onConflictDoNothing();
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
