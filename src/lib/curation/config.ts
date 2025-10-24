import { z } from 'zod';

// Environment variable schema for curation features
const curationEnvSchema = z.object({
  YOUTUBE_API_KEY: z.string().min(1),
  GOOGLE_CSE_ID: z.string().optional(),
  GOOGLE_CSE_KEY: z.string().optional(),
  ENABLE_CURATION: z.string().optional(),
  MIN_RESOURCE_SCORE: z.string().optional(),
  CURATION_CACHE_VERSION: z.string().optional(),
  CURATION_LRU_SIZE: z.string().optional(),
  CURATION_CACHE_TTL_SEARCH_DAYS: z.string().optional(),
  CURATION_CACHE_TTL_YT_STATS_DAYS: z.string().optional(),
  CURATION_CACHE_TTL_DOCS_HEAD_DAYS: z.string().optional(),
  CURATION_NEGATIVE_CACHE_TTL_HOURS: z.string().optional(),
});

/**
 * Helper to determine if running in development or test environment
 */
function isDevOrTest(): boolean {
  return process.env.NODE_ENV !== 'production';
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
    minResourceScore: env.MIN_RESOURCE_SCORE
      ? Number(env.MIN_RESOURCE_SCORE)
      : 0.6,

    // Cache version for invalidation when scoring/filters change
    cacheVersion: env.CURATION_CACHE_VERSION ?? '1',

    // In-memory LRU cache size (number of keys)
    lruSize: env.CURATION_LRU_SIZE ? Number(env.CURATION_LRU_SIZE) : 500,

    // Time-to-live settings for different cache stages
    ttl: {
      // YouTube search results cache duration (days)
      searchDays: Number(env.CURATION_CACHE_TTL_SEARCH_DAYS ?? 7),

      // YouTube video statistics cache duration (days)
      ytStatsDays: Number(env.CURATION_CACHE_TTL_YT_STATS_DAYS ?? 2),

      // Documentation HEAD validation cache duration (days)
      docsHeadDays: Number(env.CURATION_CACHE_TTL_DOCS_HEAD_DAYS ?? 5),

      // Negative cache (empty/failed searches) duration (hours)
      negativeHours: Number(env.CURATION_NEGATIVE_CACHE_TTL_HOURS ?? 4),
    },
  } as const;
})();
