import { z } from 'zod';

import { AI_DEFAULT_MODEL } from '@/lib/ai/ai-models';
import { DEFAULT_ATTEMPT_CAP } from '@/lib/ai/constants';

/**
 * Custom error type for environment variable validation failures.
 * Allows callers to identify and handle configuration errors consistently,
 * including redaction of sensitive information in logs.
 */
export class EnvValidationError extends Error {
  constructor(
    message: string,
    public readonly envKey?: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'EnvValidationError';
  }
}

type NodeEnv = 'development' | 'production' | 'test';

const normalize = (value: string | undefined | null): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const APP_URL_SCHEMA = z.string().url();
const APP_URL_CACHE_KEY = 'APP_URL_NORMALIZED';

// TODO: Consider using zod for parsing and validation of numeric env vars
function toNumber(value: string | undefined): number | undefined;
function toNumber(value: string | undefined, fallback: number): number;
function toNumber(
  value: string | undefined,
  fallback?: number
): number | undefined {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function optionalEnv(key: string): string | undefined {
  return normalize(process.env[key]);
}

export function requireEnv(key: string): string {
  const value = optionalEnv(key);
  if (!value) {
    throw new EnvValidationError(
      `Missing required environment variable: ${key}`,
      key
    );
  }
  return value;
}

const ensureServerRuntime = () => {
  // In non-production environments (dev/test/CI), allow server-only access
  // even with window defined (jsdom), since Node.js testing frameworks
  // (Vitest, Jest) polyfill window but still need server env vars
  const isNonProduction =
    typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
  if (isNonProduction) {
    return;
  }

  // In production: verify we're not in a browser before accessing server-only vars
  if (typeof window !== 'undefined') {
    throw new EnvValidationError(
      'Attempted to access a server-only environment variable in the browser bundle.'
    );
  }
};

/**
 * Cache for server-only environment variables.
 *
 * These caches assume that environment variables are immutable after process start.
 * This is the standard behavior in Node.js where env vars are set at process
 * initialization and don't change during runtime.
 *
 * Performance note: The cache avoids repeated process.env lookups and validation
 * for frequently accessed environment variables, which is especially beneficial
 * in long-running processes like workers.
 *
 * If dynamic environment variable updates are needed in the future (e.g., for
 * hot-reload scenarios or runtime configuration changes), a cache invalidation
 * mechanism would need to be implemented.
 */
const serverRequiredCache = new Map<string, string>();
const serverOptionalCache = new Map<string, string | undefined>();

// In test runtime, environment values may change between tests; avoid caching.
// Treat non-production runtimes (development, test) as mutable envs; avoid caching to
// ensure tests and dev server reflect env changes without process restarts.
const isTestRuntime =
  typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

/**
 * Retrieves a required server-only environment variable.
 *
 * - Ensures the variable is only accessed in a server runtime (throws if called in browser, unless Node-like test environment).
 * - In production, value is cached for performance (assuming envs are immutable post-process start).
 * - In test or development, value is not cached so env changes between tests or reloads are picked up.
 *
 * @param {string} key - The name of the environment variable to retrieve.
 * @returns {string} The value of the required environment variable.
 * @throws If the environment variable is missing or accessed improperly in a browser bundle.
 */
const getServerRequired = (key: string): string => {
  ensureServerRuntime();
  if (isTestRuntime) {
    return requireEnv(key);
  }
  if (!serverRequiredCache.has(key)) {
    serverRequiredCache.set(key, requireEnv(key));
  }
  return serverRequiredCache.get(key)!;
};

/**
 * Retrieves an optional server-only environment variable.
 *
 * - Ensures the variable is only accessed in a server runtime (throws if called in browser, unless Node-like test environment).
 * - In production, value is cached for performance (assuming envs are immutable post-process start).
 * - In test or development, value is not cached so env changes between tests or reloads are picked up.
 *
 * @param {string} key - The name of the environment variable to retrieve.
 * @returns {string | undefined} The value of the optional environment variable, or undefined if not set.
 * @throws If accessed improperly in a browser bundle.
 */
const getServerOptional = (key: string): string | undefined => {
  ensureServerRuntime();
  if (isTestRuntime) {
    return optionalEnv(key);
  }
  if (!serverOptionalCache.has(key)) {
    serverOptionalCache.set(key, optionalEnv(key));
  }
  return serverOptionalCache.get(key);
};

// Check if running in production (not test or development)
const isProdRuntime =
  typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';

/**
 * Retrieves an environment variable that is required in production but optional in dev/test.
 *
 * - In production: throws if missing (uses requireEnv).
 * - In dev/test: returns undefined if missing (uses optionalEnv).
 * - Ensures the variable is only accessed in a server runtime.
 * - Caching behavior follows the same pattern as getServerRequired/getServerOptional.
 *
 * Use this for third-party integration credentials (e.g., Google OAuth)
 * that are required in production but can be mocked or omitted in tests.
 *
 * @param {string} key - The name of the environment variable to retrieve.
 * @returns {string | undefined} The value of the environment variable, or undefined in non-prod if not set.
 * @throws In production if the environment variable is missing.
 */
const getServerRequiredProdOnly = (key: string): string | undefined => {
  ensureServerRuntime();

  if (!isProdRuntime) {
    // In dev/test/CI, treat as optional – tests/mocks or routes must handle missing
    return getServerOptional(key);
  }

  // In prod: genuinely required and cached
  if (!serverRequiredCache.has(key)) {
    serverRequiredCache.set(key, requireEnv(key));
  }
  return serverRequiredCache.get(key)!;
};

export const appEnv = {
  get nodeEnv(): NodeEnv {
    return (optionalEnv('NODE_ENV') as NodeEnv | undefined) ?? 'development';
  },
  get vitestWorkerId(): string | undefined {
    return optionalEnv('VITEST_WORKER_ID');
  },
  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  },
  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  },
  get isTest(): boolean {
    return this.nodeEnv === 'test' || Boolean(this.vitestWorkerId);
  },
  /**
   * Application base URL for constructing absolute URLs (e.g., Stripe redirects).
   * Required in production, falls back to localhost in development/test environments.
   */
  get url(): string {
    if (!isTestRuntime && serverOptionalCache.has(APP_URL_CACHE_KEY)) {
      const cached = serverOptionalCache.get(APP_URL_CACHE_KEY);
      if (cached) {
        return cached;
      }
    }

    const raw = isProdRuntime
      ? getServerRequired('APP_URL')
      : (getServerOptional('APP_URL') ?? 'http://localhost:3000');
    const parsed = APP_URL_SCHEMA.safeParse(raw);
    if (!parsed.success) {
      throw new EnvValidationError(
        'APP_URL must be a valid absolute URL',
        'APP_URL'
      );
    }
    if (isProdRuntime && !parsed.data.startsWith('https://')) {
      throw new EnvValidationError(
        'APP_URL must use https in production',
        'APP_URL'
      );
    }
    const normalized = parsed.data.replace(/\/$/, '');
    if (!isTestRuntime) {
      serverOptionalCache.set(APP_URL_CACHE_KEY, normalized);
    }
    return normalized;
  },
  get maintenanceMode(): boolean {
    return getServerOptional('MAINTENANCE_MODE') === 'true';
  },
} as const;

export const databaseEnv = {
  get url(): string {
    return getServerRequired('DATABASE_URL');
  },
  get nonPoolingUrl(): string {
    return getServerOptional('DATABASE_URL_NON_POOLING') ?? this.url;
  },
  get anonymousRoleUrl(): string {
    return getServerOptional('DATABASE_URL_ANONYMOUS_ROLE') ?? this.url;
  },
  get authenticatedRoleUrl(): string {
    return getServerOptional('DATABASE_URL_AUTHENTICATED_ROLE') ?? this.url;
  },
} as const;

export const googleOAuthEnv = {
  get clientId() {
    return getServerRequiredProdOnly('GOOGLE_CLIENT_ID');
  },
  get clientSecret() {
    return getServerRequiredProdOnly('GOOGLE_CLIENT_SECRET');
  },
  get redirectUri() {
    return getServerRequiredProdOnly('GOOGLE_REDIRECT_URI');
  },
} as const;

export const oauthEncryptionEnv = {
  get encryptionKey() {
    return getServerRequired('OAUTH_ENCRYPTION_KEY');
  },
} as const;

export const neonAuthEnv = {
  get baseUrl() {
    return getServerRequired('NEON_AUTH_BASE_URL');
  },
  get cookieSecret() {
    return getServerRequired('NEON_AUTH_COOKIE_SECRET');
  },
} as const;

export const stripeEnv = {
  get secretKey() {
    return getServerRequired('STRIPE_SECRET_KEY');
  },
  get webhookSecret() {
    return getServerOptional('STRIPE_WEBHOOK_SECRET');
  },
  get webhookDevMode() {
    return getServerOptional('STRIPE_WEBHOOK_DEV_MODE') === '1';
  },
  pricing: {
    get starterMonthly() {
      return getServerOptional('STRIPE_STARTER_MONTHLY_PRICE_ID');
    },
    get proMonthly() {
      return getServerOptional('STRIPE_PRO_MONTHLY_PRICE_ID');
    },
    get starterYearly() {
      return getServerOptional('STRIPE_STARTER_YEARLY_PRICE_ID');
    },
    get proYearly() {
      return getServerOptional('STRIPE_PRO_YEARLY_PRICE_ID');
    },
  },
} as const;

export const aiEnv = {
  get provider() {
    const raw = getServerOptional('AI_PROVIDER');
    const normalized = normalize(raw);
    return normalized?.toLowerCase();
  },
  get useMock() {
    return getServerOptional('AI_USE_MOCK');
  },
  get mockSeed() {
    return toNumber(getServerOptional('MOCK_GENERATION_SEED'));
  },
  mock: {
    get delayMs() {
      return toNumber(getServerOptional('MOCK_GENERATION_DELAY_MS'));
    },
    get failureRate() {
      return toNumber(getServerOptional('MOCK_GENERATION_FAILURE_RATE'));
    },
  },
  /**
   * Default AI model for plan generation.
   * AI_DEFAULT_MODEL env var overrides the hardcoded default from ai-models.ts.
   */
  get defaultModel() {
    return getServerOptional('AI_DEFAULT_MODEL') ?? AI_DEFAULT_MODEL;
  },
} as const;

export const aiTimeoutEnv = {
  get baseMs() {
    return toNumber(getServerOptional('AI_TIMEOUT_BASE_MS'), 30_000);
  },
  get extensionMs() {
    return toNumber(getServerOptional('AI_TIMEOUT_EXTENSION_MS'), 15_000);
  },
  get extensionThresholdMs() {
    const override = toNumber(
      getServerOptional('AI_TIMEOUT_EXTENSION_THRESHOLD_MS')
    );
    if (override !== undefined) {
      return override;
    }
    const base = this.baseMs;
    return Math.max(0, base - 5_000);
  },
} as const;

const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * OpenRouter API configuration.
 * Provides API key, base URL, and HTTP headers for the OpenRouter service.
 */
export const openRouterEnv = {
  get apiKey() {
    return getServerOptional('OPENROUTER_API_KEY');
  },
  get siteUrl() {
    return getServerOptional('OPENROUTER_SITE_URL');
  },
  get appName() {
    return getServerOptional('OPENROUTER_APP_NAME');
  },
  /** Base URL for OpenRouter API, defaults to official endpoint */
  get baseUrl() {
    return (
      getServerOptional('OPENROUTER_BASE_URL') ?? OPENROUTER_DEFAULT_BASE_URL
    );
  },
} as const;

export const aiMicroExplanationEnv = {
  get googleApiKey() {
    return getServerOptional('GOOGLE_GENERATIVE_AI_API_KEY');
  },
  /**
   * OpenRouter configuration for micro-explanations.
   * Reuses the shared openRouterEnv configuration.
   */
  get openRouter() {
    return openRouterEnv;
  },
  get microExplanationMaxTokens() {
    return toNumber(getServerOptional('AI_MICRO_EXPLANATION_MAX_TOKENS'), 200);
  },
  get microExplanationTemperature() {
    return toNumber(getServerOptional('AI_MICRO_EXPLANATION_TEMPERATURE'), 0.4);
  },
} as const;

export const googleAiEnv = {
  get apiKey() {
    return getServerOptional('GOOGLE_GENERATIVE_AI_API_KEY');
  },
} as const;

export const devAuthEnv = {
  get userId() {
    return getServerOptional('DEV_AUTH_USER_ID');
  },
  get email() {
    return getServerOptional('DEV_AUTH_USER_EMAIL') ?? 'dev@example.com';
  },
  get name() {
    return getServerOptional('DEV_AUTH_USER_NAME') ?? 'Dev User';
  },
} as const;

export const attemptsEnv = {
  get cap() {
    return toNumber(getServerOptional('ATTEMPT_CAP'), DEFAULT_ATTEMPT_CAP);
  },
} as const;

export const loggingEnv = {
  get level() {
    return getServerOptional('LOG_LEVEL');
  },
} as const;

export const observabilityEnv = {
  get sentryDsn() {
    return getServerOptional('SENTRY_DSN');
  },
  get sentryTracesSampleRate() {
    return toNumber(getServerOptional('SENTRY_TRACES_SAMPLE_RATE'), 0.1);
  },
  get sentryProfilesSampleRate() {
    return toNumber(getServerOptional('SENTRY_PROFILES_SAMPLE_RATE'), 0.1);
  },
} as const;

export const curationWeightsEnv = {
  get ytPopularity() {
    return toNumber(getServerOptional('CURATION_YT_WEIGHT_POPULARITY'), 0.45);
  },
  get ytRecency() {
    return toNumber(getServerOptional('CURATION_YT_WEIGHT_RECENCY'), 0.25);
  },
  get ytRelevance() {
    return toNumber(getServerOptional('CURATION_YT_WEIGHT_RELEVANCE'), 0.25);
  },
  get ytSuitability() {
    return toNumber(getServerOptional('CURATION_YT_WEIGHT_SUITABILITY'), 0.05);
  },
  get docAuthority() {
    return toNumber(getServerOptional('CURATION_DOC_WEIGHT_AUTHORITY'), 0.6);
  },
  get docRelevance() {
    return toNumber(getServerOptional('CURATION_DOC_WEIGHT_RELEVANCE'), 0.3);
  },
  get docRecency() {
    return toNumber(getServerOptional('CURATION_DOC_WEIGHT_RECENCY'), 0.1);
  },
  get recencyDecayDays() {
    return toNumber(getServerOptional('CURATION_RECENCY_DECAY_DAYS'), 365);
  },
} as const;

export const curationEnvSource = {
  get YOUTUBE_API_KEY() {
    return getServerOptional('YOUTUBE_API_KEY');
  },
  get GOOGLE_CSE_ID() {
    return getServerOptional('GOOGLE_CSE_ID');
  },
  get GOOGLE_CSE_KEY() {
    return getServerOptional('GOOGLE_CSE_KEY');
  },
  get ENABLE_CURATION() {
    return getServerOptional('ENABLE_CURATION');
  },
  get MIN_RESOURCE_SCORE() {
    return getServerOptional('MIN_RESOURCE_SCORE');
  },
  get CURATION_CONCURRENCY() {
    return getServerOptional('CURATION_CONCURRENCY');
  },
  get CURATION_TIME_BUDGET_MS() {
    return getServerOptional('CURATION_TIME_BUDGET_MS');
  },
  get CURATION_MAX_RESULTS() {
    return getServerOptional('CURATION_MAX_RESULTS');
  },
} as const;
