import { resourceType } from '@/lib/db/enums';

/**
 * Curation source types
 */
export type CurationSource = 'youtube' | 'doc';

/**
 * Database resource type enum values (alias of canonical ResourceType from enums)
 */
export type DbResourceType = (typeof resourceType.enumValues)[number];

/**
 * Score components for multi-factor ranking
 * All values normalized to [0, 1] range
 */
export type ScoreComponents = {
  popularity?: number; // Based on views, likes, etc.
  recency?: number; // How recent the content is
  relevance?: number; // How well it matches the query
  durationFit?: number; // How well the duration fits learning needs
  authority?: number; // Domain/channel authority
};

/**
 * Combined score with components and metadata
 */
export type Score = {
  blended: number; // Final blended score [0, 1]
  components: ScoreComponents; // Individual score components
  scoredAt: string; // ISO timestamp when score was computed
};

/**
 * Resource candidate from curation sources
 */
export type ResourceCandidate = {
  url: string; // Resource URL (unique identifier)
  title: string; // Resource title
  source: CurationSource; // Where the resource came from
  score: Score; // Quality and relevance scores
  metadata: Record<string, unknown>; // Source-specific metadata
};

/**
 * Parameters for curation queries
 */
export type CurationParams = {
  query: string; // Search query
  minScore: number; // Minimum quality threshold
  maxResults?: number; // Maximum number of results (typically 1-3)
  cacheVersion: string; // Cache version for invalidation
};

/**
 * Curation result with filtered and sorted candidates
 */
export type CurationResult = {
  candidates: ResourceCandidate[]; // Already filtered by minScore and sorted by score desc
};

/**
 * Map curation source to database resource type
 */
export function mapSourceToDbResourceType(
  source: CurationSource
): DbResourceType {
  return source === 'youtube' ? 'youtube' : 'doc';
}
