import {
  dedupePreparedCandidatesByUrl,
  prepareResourceCandidate,
} from '@/lib/db/queries/helpers/resources-helpers';
import type {
  PreparedResourceCandidate,
  ResourcesDbClient,
  UpsertResourceParams,
} from '@/lib/db/queries/types/resources.types';
import { resources } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

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
