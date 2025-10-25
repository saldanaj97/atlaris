/**
 * Ranking module for curation resources
 * Handles scoring, normalization, blending, and selection
 */

import type { ResourceCandidate, Score } from '@/lib/curation/types';

/**
 * Individual score components (all normalized to [0, 1])
 */
export type ScoreComponents = {
  popularity: number; // Based on views, likes, engagement
  recency: number; // How recent the content is
  relevance: number; // How well it matches the query
  suitability?: number; // Duration/format suitability
  authority?: number; // Domain/channel authority
};

/**
 * Resource candidate with computed score
 */
export type Scored<T extends ResourceCandidate = ResourceCandidate> = T & {
  numericScore: number; // Blended score [0, 1]
  score: Score; // Original score object, updated with blended if needed
  components: ScoreComponents; // Individual score components
};

/**
 * Environment-based weight configuration
 */
type WeightConfig = {
  popularity: number;
  recency: number;
  relevance: number;
  suitability: number;
  authority: number;
};

/**
 * Get scoring weights for YouTube from environment or use defaults
 */
function getYouTubeWeights(): WeightConfig {
  return {
    popularity: parseFloat(process.env.CURATION_YT_WEIGHT_POPULARITY || '0.45'),
    recency: parseFloat(process.env.CURATION_YT_WEIGHT_RECENCY || '0.25'),
    relevance: parseFloat(process.env.CURATION_YT_WEIGHT_RELEVANCE || '0.25'),
    suitability: parseFloat(
      process.env.CURATION_YT_WEIGHT_SUITABILITY || '0.05'
    ),
    authority: 0,
  };
}

/**
 * Get scoring weights for docs from environment or use defaults
 */
function getDocsWeights(): WeightConfig {
  return {
    authority: parseFloat(process.env.CURATION_DOC_WEIGHT_AUTHORITY || '0.6'),
    relevance: parseFloat(process.env.CURATION_DOC_WEIGHT_RELEVANCE || '0.3'),
    recency: parseFloat(process.env.CURATION_DOC_WEIGHT_RECENCY || '0.1'),
    popularity: 0,
    suitability: 0,
  };
}

/**
 * Compute logarithmic popularity score
 */
function computePopularityScore(viewCount: number): number {
  if (viewCount <= 0) return 0;
  // log10(views + 1) normalized to [0, 1] with realistic cap.
  // Use 10^10 (~10B views) as the upper bound so extremely popular videos stay within range.
  //  log10(10^10) = 10 → divide by 10 to map to [0,1].
  const logViews = Math.log10(viewCount + 1);
  const normalized = logViews / 10;
  return Math.max(0, Math.min(normalized, 1));
}

/**
 * Compute recency score with exponential decay
 */
function computeRecencyScore(
  publishedDate: Date,
  now: Date = new Date()
): number {
  const ageDays =
    (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);
  const decayHalfLife = parseFloat(
    process.env.CURATION_RECENCY_DECAY_DAYS || '365'
  );
  // Exponential decay: e^(-ageDays / halfLife)
  return Math.exp(-ageDays / decayHalfLife);
}

/**
 * Compute relevance score based on title/keyword match
 * Simple approach: count matching words
 */
function computeRelevanceScore(
  query: string,
  title: string,
  keywords?: string[]
): number {
  const queryWords = query.toLowerCase().split(/\s+/);
  const titleLower = title.toLowerCase();
  const keywordSet = new Set(keywords?.map((k) => k.toLowerCase()) || []);

  let matches = 0;
  const total = queryWords.length;

  for (const word of queryWords) {
    // Use word boundary regex for more precise matching
    const wordRegex = new RegExp(`\\b${word}\\b`);
    if (wordRegex.test(titleLower) || keywordSet.has(word)) {
      matches++;
    }
  }

  return total > 0 ? matches / total : 0;
}

/**
 * Compute suitability score based on video duration
 * Ideal range: 5-30 minutes for learning content
 */
function computeSuitabilityScore(durationMinutes: number): number {
  if (durationMinutes < 2) return 0.3; // Too short
  if (durationMinutes >= 5 && durationMinutes <= 30) return 1.0; // Ideal
  if (durationMinutes <= 60) return 0.8; // Good
  if (durationMinutes <= 120) return 0.6; // Acceptable
  return 0.4; // Long but usable
}

/**
 * Domain authority mapping (extendable)
 */
const DOMAIN_AUTHORITY: Record<string, number> = {
  // Official docs (highest)
  'developer.mozilla.org': 1.0,
  'docs.python.org': 1.0,
  'nodejs.org': 1.0,
  'reactjs.org': 1.0,
  'react.dev': 1.0,
  'vuejs.org': 1.0,
  'angular.io': 1.0,
  'typescriptlang.org': 1.0,
  'go.dev': 1.0,
  'rust-lang.org': 1.0,
  'docs.microsoft.com': 0.95,
  'cloud.google.com': 0.95,
  'docs.aws.amazon.com': 0.95,

  // High-quality resources
  'stackoverflow.com': 0.85,
  'github.com': 0.85,
  'medium.com': 0.7,
  'dev.to': 0.75,
  'freecodecamp.org': 0.8,

  // Default for unknown domains
};

/**
 * Compute authority score based on domain
 */
function computeAuthorityScore(url: string): number {
  try {
    const domain = new URL(url).hostname.replace(/^www\./, '');
    return DOMAIN_AUTHORITY[domain] || 0.5; // Default moderate authority
  } catch {
    return 0.5;
  }
}

/**
 * Score a YouTube video candidate
 */
export function scoreYouTube(
  c: ResourceCandidate,
  now: Date = new Date()
): Scored {
  const metadata = c.metadata;
  const viewCount = (metadata.viewCount as number) || 0;
  const publishedAt = metadata.publishedAt
    ? new Date(metadata.publishedAt as string)
    : new Date();
  const durationMinutes = (metadata.durationMinutes as number) || 0;
  const title = c.title;
  const query = (metadata.query as string) || '';

  // Compute components
  const components: ScoreComponents = {
    popularity: computePopularityScore(viewCount),
    recency: computeRecencyScore(publishedAt, now),
    relevance: computeRelevanceScore(query, title),
    suitability: computeSuitabilityScore(durationMinutes),
  };

  // Blend with weights
  const weights = getYouTubeWeights();
  const score =
    components.popularity * weights.popularity +
    components.recency * weights.recency +
    components.relevance * weights.relevance +
    (components.suitability || 0) * weights.suitability;

  return {
    ...c,
    numericScore: score,
    score: { ...c.score, blended: score },
    components,
  };
}

/**
 * Score a documentation candidate
 */
export function scoreDoc(c: ResourceCandidate): Scored {
  const metadata = c.metadata;
  const title = c.title;
  const query = (metadata.query as string) || '';
  const publishedAt = metadata.publishedAt
    ? new Date(metadata.publishedAt as string)
    : undefined;

  // Compute components
  const components: ScoreComponents = {
    authority: computeAuthorityScore(c.url),
    relevance: computeRelevanceScore(query, title),
    recency: publishedAt ? computeRecencyScore(publishedAt) : 0.5,
    popularity: 0,
  };

  // Blend with weights
  const weights = getDocsWeights();
  const score =
    (components.authority || 0) * weights.authority +
    components.relevance * weights.relevance +
    components.recency * weights.recency;

  return {
    ...c,
    numericScore: score,
    score: { ...c.score, blended: score },
    components,
  };
}

/**
 * Selection options for top candidates
 */
export type SelectTopOptions = {
  minScore: number; // Minimum score threshold
  maxItems?: number; // Maximum items to return (default 3)
  preferDiversity?: boolean; // Prefer source diversity when available
  earlyStopEnabled?: boolean; // Enable early-stop if one source fills quota
};

/**
 * Select top candidates with score cutoff and diversity preference
 * @param candidates Scored candidates (from multiple sources)
 * @param opts Selection options
 * @returns Top candidates sorted by score
 */
export function selectTop(
  candidates: Scored[],
  opts: SelectTopOptions
): Scored[] {
  const {
    minScore,
    maxItems = 3,
    preferDiversity = true,
    earlyStopEnabled = false,
  } = opts;

  // Filter by minimum score
  const qualified = candidates.filter((c) => c.numericScore >= minScore);

  if (qualified.length === 0) {
    return [];
  }

  // Sort by score descending
  const sorted = qualified.sort((a, b) => b.numericScore - a.numericScore);

  // Build bySource map once for use in both early-stop and diversity logic
  const bySource = new Map<string, Scored[]>();
  for (const candidate of sorted) {
    const source = candidate.source;
    if (!bySource.has(source)) {
      bySource.set(source, []);
    }
    bySource.get(source)!.push(candidate);
  }

  // If enabled and one source alone fills maxItems at threshold, short-circuit
  if (earlyStopEnabled) {
    // If only one source exists, return early with top N
    if (bySource.size === 1) {
      return sorted.slice(0, maxItems);
    }

    const dominant =
      [...bySource.values()].sort((a, b) => b.length - a.length)[0] ?? [];
    const topN = dominant.slice(0, maxItems);
    if (
      topN.length === maxItems &&
      topN.every((c) => c.numericScore >= minScore)
    ) {
      return topN;
    }
  }

  // If no diversity preference or only one source, return top N
  if (!preferDiversity || bySource.size === 1) {
    return sorted.slice(0, maxItems);
  }

  // Diversity strategy: ensure at least one from each source if possible
  const selected: Scored[] = [];
  const sourcesUsed = new Set<string>();

  // First pass: select top candidate from each source
  for (const [source, items] of bySource) {
    if (selected.length >= maxItems) break;
    const top = items[0];
    selected.push(top);
    sourcesUsed.add(source);
  }

  // Second pass: fill remaining slots with highest-scoring candidates
  const remaining = sorted.filter((c) => !selected.includes(c));
  while (selected.length < maxItems && remaining.length > 0) {
    selected.push(remaining.shift()!);
  }

  // Re-sort by score to maintain order
  return selected.sort((a, b) => b.numericScore - a.numericScore);
}
