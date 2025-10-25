import { z } from 'zod';

// Environment variable schema for curation features
// Use Zod coercion for numeric values to avoid NaN and enforce bounds/defaults.
const curationEnvSchema = z.object({
  YOUTUBE_API_KEY: z.string().min(1),
  GOOGLE_CSE_ID: z.string().optional(),
  GOOGLE_CSE_KEY: z.string().optional(),
  ENABLE_CURATION: z.string().optional(),
  CURATION_CACHE_VERSION: z.string().optional(),

  // Numbers with coercion, validation and defaults
  MIN_RESOURCE_SCORE: z.coerce.number().min(0).max(1).default(0.6),
  CURATION_LRU_SIZE: z.coerce.number().int().min(1).default(500),
  CURATION_CACHE_TTL_SEARCH_DAYS: z.coerce.number().int().min(0).default(7),
  CURATION_CACHE_TTL_YT_STATS_DAYS: z.coerce.number().int().min(0).default(2),
  CURATION_CACHE_TTL_DOCS_HEAD_DAYS: z.coerce.number().int().min(0).default(5),
  CURATION_NEGATIVE_CACHE_TTL_HOURS: z.coerce.number().int().min(0).default(4),
});

/**
 * Helper to determine if running in development or test environment
 */
function isDevOrTest(): boolean {
  // Enables curation only in development and test environments
  return (
    process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
  );
}

/**
 * Centralized curation configuration with type-safe env reads and sane defaults
 */
export const curationConfig = (() => {
  const env = curationEnvSchema.parse(process.env);
  const devOrTest = isDevOrTest();

  return {
    // Required YouTube API key
    youtubeApiKey: env.YOUTUBE_API_KEY,

    // Optional Google Custom Search Engine credentials
    cseId: env.GOOGLE_CSE_ID,
    cseKey: env.GOOGLE_CSE_KEY,

    // Feature flag: enabled by default in dev/test, explicit in production
    enableCuration: env.ENABLE_CURATION
      ? env.ENABLE_CURATION === 'true'
      : devOrTest,

    // Minimum quality score threshold for resources (0-1 scale)
    // Coerced and validated by Zod with default fallback
    minResourceScore: env.MIN_RESOURCE_SCORE ?? 0.6,

    // Cache version for invalidation when scoring/filters change
    cacheVersion: env.CURATION_CACHE_VERSION ?? '1',

    // In-memory LRU cache size (number of keys)
    // Coerced and validated by Zod with default fallback
    lruSize: env.CURATION_LRU_SIZE ?? 500,

    // Time-to-live settings for different cache stages
    ttl: {
      // YouTube search results cache duration (days) - validated defaults
      searchDays: env.CURATION_CACHE_TTL_SEARCH_DAYS ?? 7,

      // YouTube video statistics cache duration (days) - validated defaults
      ytStatsDays: env.CURATION_CACHE_TTL_YT_STATS_DAYS ?? 2,

      // Documentation HEAD validation cache duration (days) - validated defaults
      docsHeadDays: env.CURATION_CACHE_TTL_DOCS_HEAD_DAYS ?? 5,

      // Negative cache (empty/failed searches) duration (hours) - validated defaults
      negativeHours: env.CURATION_NEGATIVE_CACHE_TTL_HOURS ?? 4,
    },
  } as const;
})();
