/**
 * Test factories for resource candidate records.
 * Use these for creating consistent test data for resource candidates.
 */

import type { ResourceCandidate } from '@/lib/curation/types';

/**
 * Creates a ResourceCandidate with sensible defaults for testing.
 * Accepts overrides for customization in specific tests.
 *
 * @param overrides - Optional overrides for any ResourceCandidate properties
 * @returns A complete ResourceCandidate object
 */
export function createResourceCandidate(
  overrides: Partial<ResourceCandidate> = {}
): ResourceCandidate {
  return {
    url: overrides.url ?? 'https://www.example.com/guide',
    title: overrides.title ?? 'Example Guide',
    source: overrides.source ?? 'doc',
    score:
      overrides.score ??
      ({
        blended: 0.9,
        components: {},
        scoredAt: new Date().toISOString(),
      } as ResourceCandidate['score']),
    metadata: overrides.metadata ?? {},
  };
}
