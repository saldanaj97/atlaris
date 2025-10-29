import { z } from 'zod';

// Environment variable schema for curation features
// Use Zod coercion for numeric values to avoid NaN and enforce bounds/defaults.
const curationEnvSchema = z.object({
  YOUTUBE_API_KEY: z.string().optional(),
  GOOGLE_CSE_ID: z.string().optional(),
  GOOGLE_CSE_KEY: z.string().optional(),
  ENABLE_CURATION: z.string().optional(),
  CURATION_CACHE_VERSION: z.string().optional(),

  // Numbers with coercion, validation and defaults
  MIN_RESOURCE_SCORE: z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === "") return undefined;
      if (typeof val === "number") return val;
      if (typeof val === "string" && !isNaN(Number(val))) return Number(val);
      throw new Error("MIN_RESOURCE_SCORE must be a number between 0 and 1");
    },
    z.number().min(0).max(1).default(0.6)
  ),
  CURATION_LRU_SIZE: z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === "") return undefined;
      if (typeof val === "number") return val;
      if (typeof val === "string" && !isNaN(Number(val))) return Number(val);
      throw new Error("CURATION_LRU_SIZE must be an integer >= 1");
    },
    z.number().int().min(1).default(500)
  ),
  CURATION_CACHE_TTL_SEARCH_DAYS: z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === "") return undefined;
      if (typeof val === "number") return val;
      if (typeof val === "string" && !isNaN(Number(val))) return Number(val);
      throw new Error("CURATION_CACHE_TTL_SEARCH_DAYS must be an integer >= 0");
    },
    z.number().int().min(0).default(7)
  ),
  CURATION_CACHE_TTL_YT_STATS_DAYS: z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === "") return undefined;
      if (typeof val === "number") return val;
      if (typeof val === "string" && !isNaN(Number(val))) return Number(val);
      throw new Error("CURATION_CACHE_TTL_YT_STATS_DAYS must be an integer >= 0");
    },
    z.number().int().min(0).default(2)
  ),
  CURATION_CACHE_TTL_DOCS_HEAD_DAYS: z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === "") return undefined;
      if (typeof val === "number") return val;
      if (typeof val === "string" && !isNaN(Number(val))) return Number(val);
      throw new Error("CURATION_CACHE_TTL_DOCS_HEAD_DAYS must be an integer >= 0");
    },
    z.number().int().min(0).default(5)
  ),
  CURATION_NEGATIVE_CACHE_TTL_HOURS: z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === "") return undefined;
      if (typeof val === "number") return val;
      if (typeof val === "string" && !isNaN(Number(val))) return Number(val);
      throw new Error("CURATION_NEGATIVE_CACHE_TTL_HOURS must be an integer >= 0");
    },
    z.number().int().min(0).default(4)
  ),
  CURATION_CONCURRENCY: z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === "") return undefined;
      if (typeof val === "number") return val;
      if (typeof val === "string" && !isNaN(Number(val))) return Number(val);
      throw new Error("CURATION_CONCURRENCY must be an integer >= 1");
    },
    z.number().int().min(1).default(3)
  ),
  CURATION_TIME_BUDGET_MS: z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === "") return undefined;
      if (typeof val === "number") return val;
      if (typeof val === "string" && !isNaN(Number(val))) return Number(val);
      throw new Error("CURATION_TIME_BUDGET_MS must be an integer >= 1000");
    },
    z.number().int().min(1000).default(30_000)
  ),
  CURATION_MAX_RESULTS: z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === "") return undefined;
      if (typeof val === "number") return val;
      if (typeof val === "string" && !isNaN(Number(val))) return Number(val);
      throw new Error("CURATION_MAX_RESULTS must be an integer between 1 and 10");
    },
    z.number().int().min(1).max(10).default(3)
  ),
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
 * Curation configuration type
 */
export type CurationConfig = {
  readonly youtubeApiKey: string | undefined;
  readonly cseId: string | undefined;
  readonly cseKey: string | undefined;
  readonly enableCuration: boolean;
  readonly minResourceScore: number;
  readonly cacheVersion: string;
  readonly lruSize: number;
  readonly ttl: {
    readonly searchDays: number;
    readonly ytStatsDays: number;
    readonly docsHeadDays: number;
    readonly negativeHours: number;
  };
  readonly concurrency: number;
  readonly timeBudgetMs: number;
  readonly maxResults: number;
};

/**
 * Centralized curation configuration with type-safe env reads and sane defaults
 */
export const curationConfig: CurationConfig = (() => {
  const env = curationEnvSchema.parse(process.env);
  const devOrTest = isDevOrTest();

  // Feature flag: enabled by default in dev/test, explicit in production
  const enableCuration = env.ENABLE_CURATION
    ? env.ENABLE_CURATION === 'true'
    : devOrTest;

  // Validate YouTube API key only when curation is enabled
  if (enableCuration && !env.YOUTUBE_API_KEY) {
    console.warn(
      '[Curation] ENABLE_CURATION is on but YOUTUBE_API_KEY is missing; YouTube adapter will be skipped.'
    );
  }

  // Extract numeric values to ensure proper type inference
  const concurrency: number = env.CURATION_CONCURRENCY;
  const timeBudgetMs: number = env.CURATION_TIME_BUDGET_MS;
  const maxResults: number = env.CURATION_MAX_RESULTS;

  return {
    // YouTube API key (required only when curation is enabled)
    youtubeApiKey: env.YOUTUBE_API_KEY,

    // Optional Google Custom Search Engine credentials
    cseId: env.GOOGLE_CSE_ID,
    cseKey: env.GOOGLE_CSE_KEY,

    // Feature flag
    enableCuration,

    // Minimum quality score threshold for resources (0-1 scale)
    // Coerced and validated by Zod with default fallback
    minResourceScore: env.MIN_RESOURCE_SCORE,

    // Cache version for invalidation when scoring/filters change
    cacheVersion: env.CURATION_CACHE_VERSION ?? '1',

    // In-memory LRU cache size (number of keys)
    // Coerced and validated by Zod with default fallback
    lruSize: env.CURATION_LRU_SIZE,

    // Time-to-live settings for different cache stages
    ttl: {
      // YouTube search results cache duration (days) - validated defaults
      searchDays: env.CURATION_CACHE_TTL_SEARCH_DAYS,

      // YouTube video statistics cache duration (days) - validated defaults
      ytStatsDays: env.CURATION_CACHE_TTL_YT_STATS_DAYS,

      // Documentation HEAD validation cache duration (days) - validated defaults
      docsHeadDays: env.CURATION_CACHE_TTL_DOCS_HEAD_DAYS,

      // Negative cache (empty/failed searches) duration (hours) - validated defaults
      negativeHours: env.CURATION_NEGATIVE_CACHE_TTL_HOURS,
    },

    // Worker processing settings
    // Concurrency limit for batch processing tasks
    concurrency,

    // Time budget for curation in milliseconds (default 30 seconds)
    timeBudgetMs,

    // Maximum number of resources to return per task
    maxResults,
  } as const;
})();
