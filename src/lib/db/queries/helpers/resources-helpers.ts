import type { ResourceCandidate } from '@/lib/curation/types';
import { mapSourceToDbResourceType } from '@/lib/curation/types';
import type {
  AttachTaskResourcesInternalParams,
  PreparedResourceCandidate,
  ResourceInsertValue,
} from '@/lib/db/queries/types/resources.types';
import { MAX_RESOURCE_TITLE_LENGTH } from '@/lib/db/schema/constants';
import { sanitizePlainText } from '@/lib/utils/sanitize';
import { extractDomain, isValidHttpUrl } from '@/lib/utils/url';

function sanitizeResourceTitle(title: string): string {
  const sanitized = sanitizePlainText(title, MAX_RESOURCE_TITLE_LENGTH).trim();
  if (sanitized.length === 0) {
    throw new Error('Invalid title: resource title cannot be empty.');
  }

  return sanitized;
}

function normalizeDurationMinutes(rawDuration: unknown): number | undefined {
  return typeof rawDuration === 'number' && Number.isFinite(rawDuration)
    ? Math.max(0, Math.round(rawDuration))
    : undefined;
}

export function prepareResourceCandidate(
  candidate: ResourceCandidate
): PreparedResourceCandidate {
  if (!isValidHttpUrl(candidate.url)) {
    throw new Error('Invalid URL: only http(s) URLs are allowed.');
  }

  const extractedDomain = extractDomain(candidate.url);
  if (typeof extractedDomain !== 'string' || extractedDomain.length === 0) {
    throw new Error(
      `Invalid URL: could not extract domain from ${candidate.url}`
    );
  }

  const resource: ResourceInsertValue = {
    type: mapSourceToDbResourceType(candidate.source),
    title: sanitizeResourceTitle(candidate.title),
    url: candidate.url,
    domain: extractedDomain,
    durationMinutes: normalizeDurationMinutes(
      candidate.metadata?.['durationMinutes']
    ),
  };

  return resource;
}

export function prepareResourceCandidates(
  candidates: ResourceCandidate[]
): PreparedResourceCandidate[] {
  return candidates.map((candidate) => prepareResourceCandidate(candidate));
}

/**
 * Deduplicates by URL for batched upsert safety.
 * Keeps the latest candidate for each URL to mirror last-write-wins behavior.
 */
export function dedupePreparedCandidatesByUrl(
  candidates: PreparedResourceCandidate[]
): PreparedResourceCandidate[] {
  const byUrl = new Map<string, PreparedResourceCandidate>();
  for (const candidate of candidates) {
    byUrl.set(candidate.url, candidate);
  }

  return Array.from(byUrl.values());
}

export function mapResourceIdsToInputOrder(
  preparedCandidates: PreparedResourceCandidate[],
  idByUrl: Map<string, string>
): string[] {
  return preparedCandidates.map(({ url }) => {
    const resourceId = idByUrl.get(url);
    if (!resourceId) {
      throw new Error(`Resource upsert did not return an id for URL: ${url}`);
    }
    return resourceId;
  });
}

export function buildTaskResourceInsertValues({
  taskId,
  resourceIds,
}: AttachTaskResourcesInternalParams): Array<{
  taskId: string;
  resourceId: string;
  order: number;
}> {
  return resourceIds.map((resourceId, index) => ({
    taskId,
    resourceId,
    order: index + 1,
  }));
}
