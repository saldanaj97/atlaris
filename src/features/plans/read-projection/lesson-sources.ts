import type { LessonSource } from './types';
import type { DbResearchSource } from '@/lib/db/queries/types/plan-research.types';

import { z } from 'zod';

const CitedSourceIdsSchema = z.object({ sourceIds: z.array(z.string()) });

export function readCitedSourceIds(lessonContent: unknown): string[] {
  const parsed = CitedSourceIdsSchema.safeParse(lessonContent);
  return parsed.success ? parsed.data.sourceIds : [];
}

/**
 * Joins cited keys to the plan's research sources. Keys with no matching
 * source are dropped; the result keeps the sources' citation order.
 */
export function resolveLessonSources(
  sourceIds: readonly string[],
  sources: readonly DbResearchSource[],
): LessonSource[] {
  if (sourceIds.length === 0) {
    return [];
  }

  const cited = new Set(sourceIds);
  return sources
    .filter((source) => cited.has(source.citationKey))
    .map((source) => ({
      citationKey: source.citationKey,
      title: source.title,
      publisher: source.publisher,
      url: source.url,
      retrievedAt: source.retrievedAt,
    }));
}
