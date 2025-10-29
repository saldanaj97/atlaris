import { z } from 'zod';

/**
 * Helper to create a numeric Zod schema with coercion, validation, and defaults.
 * Handles string-to-number conversion and provides clear error messages.
 */
function numericEnvVar(
  varName: string,
  options: {
    default: number;
    min?: number;
    max?: number;
    integer?: boolean;
    errorSuffix?: string;
  }
) {
  const {
    default: defaultValue,
    min,
    max,
    integer = false,
    errorSuffix: _errorSuffix,
  } = options;

  // Build error message parts from constraints for warnings
  const errorParts: string[] = [];
  if (integer) errorParts.push('an integer');
  else errorParts.push('a number');

  if (min !== undefined && max !== undefined) {
    errorParts.push(`between ${min} and ${max}`);
  } else if (min !== undefined) {
    errorParts.push(`>= ${min}`);
  } else if (max !== undefined) {
    errorParts.push(`<= ${max}`);
  }

  return z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === '') return undefined;

      // Handle numeric values
      let numVal: number;
      if (typeof val === 'number') {
        if (!Number.isFinite(val)) return undefined; // NaN, Infinity -> default
        numVal = val;
      } else if (typeof val === 'string') {
        const parsed = Number(val);
        if (isNaN(parsed) || !Number.isFinite(parsed)) return undefined; // Invalid string -> default
        numVal = parsed;
      } else {
        // Non-numeric type -> default
        return undefined;
      }

      // Validate integer requirement
      if (integer && !Number.isInteger(numVal)) {
        // Log warning in non-test environments, but fall back to default
        if (process.env.NODE_ENV !== 'test') {
          console.warn(
            `${varName} must be ${errorParts.join(' ')}, got "${val}". Using default: ${defaultValue}`
          );
        }
        return undefined;
      }

      // Validate bounds
      if (
        (min !== undefined && numVal < min) ||
        (max !== undefined && numVal > max)
      ) {
        // Log warning in non-test environments, but fall back to default
        if (process.env.NODE_ENV !== 'test') {
          console.warn(
            `${varName} must be ${errorParts.join(' ')}, got "${val}". Using default: ${defaultValue}`
          );
        }
        return undefined;
      }

      return numVal;
    },
    (() => {
      let schema: z.ZodNumber = z.number();
      if (integer) schema = schema.int();
      if (min !== undefined) schema = schema.min(min);
      if (max !== undefined) schema = schema.max(max);
      return schema.default(defaultValue);
    })()
  );
}

// Environment variable schema for curation features
// Use Zod coercion for numeric values to avoid NaN and enforce bounds/defaults.
const curationEnvSchema = z.object({
  YOUTUBE_API_KEY: z.string().optional(),
  GOOGLE_CSE_ID: z.string().optional(),
  GOOGLE_CSE_KEY: z.string().optional(),
  ENABLE_CURATION: z.string().optional(),
  CURATION_CACHE_VERSION: z.string().optional(),

  // Numbers with coercion, validation and defaults
  MIN_RESOURCE_SCORE: numericEnvVar('MIN_RESOURCE_SCORE', {
    default: 0.6,
    min: 0,
    max: 1,
  }),
  CURATION_LRU_SIZE: numericEnvVar('CURATION_LRU_SIZE', {
    default: 500,
    min: 1,
    integer: true,
  }),
  CURATION_CACHE_TTL_SEARCH_DAYS: numericEnvVar(
    'CURATION_CACHE_TTL_SEARCH_DAYS',
    {
      default: 7,
      min: 0,
      integer: true,
    }
  ),
  CURATION_CACHE_TTL_YT_STATS_DAYS: numericEnvVar(
    'CURATION_CACHE_TTL_YT_STATS_DAYS',
    {
      default: 2,
      min: 0,
      integer: true,
    }
  ),
  CURATION_CACHE_TTL_DOCS_HEAD_DAYS: numericEnvVar(
    'CURATION_CACHE_TTL_DOCS_HEAD_DAYS',
    {
      default: 5,
      min: 0,
      integer: true,
    }
  ),
  CURATION_NEGATIVE_CACHE_TTL_HOURS: numericEnvVar(
    'CURATION_NEGATIVE_CACHE_TTL_HOURS',
    {
      default: 4,
      min: 0,
      integer: true,
    }
  ),
  CURATION_CONCURRENCY: numericEnvVar('CURATION_CONCURRENCY', {
    default: 3,
    min: 1,
    integer: true,
  }),
  CURATION_TIME_BUDGET_MS: numericEnvVar('CURATION_TIME_BUDGET_MS', {
    default: 30_000,
    min: 1000,
    integer: true,
  }),
  CURATION_MAX_RESULTS: numericEnvVar('CURATION_MAX_RESULTS', {
    default: 3,
    min: 1,
    max: 10,
    integer: true,
  }),
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
