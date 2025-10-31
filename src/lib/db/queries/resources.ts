/**
 * Database queries for resource management
 * Handles upserting resources and attaching them to tasks
 */

import { sql } from 'drizzle-orm';

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

function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
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
  // Basic URL validation: must be http(s) with hostname
  if (!isValidHttpUrl(candidate.url)) {
    throw new Error('Invalid URL: only http(s) URLs are allowed.');
  }
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
    // Lock the row with highest order to prevent concurrent modifications
    // We use raw SQL because Drizzle's query builder doesn't properly support
    // FOR UPDATE with ORDER BY and LIMIT in all cases
    const rows = (await tx.execute(
      sql`
        SELECT "order"
        FROM task_resources
        WHERE task_id = ${taskId}
        ORDER BY "order" DESC
        LIMIT 1
        FOR UPDATE
      `
    )) as Array<{ order: number }>;

    const currentMax = rows[0]?.order ?? 0;

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

  // Upsert resources concurrently while preserving input order
  const resourceIds = await Promise.all(
    candidates.map((candidate) => upsertResource(candidate))
  );

  // Attach to task with ordering
  await attachTaskResources(taskId, resourceIds);

  return resourceIds;
}
