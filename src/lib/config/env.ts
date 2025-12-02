type NodeEnv = 'development' | 'production' | 'test';

const normalize = (value: string | undefined | null): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

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

const toBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

export function optionalEnv(key: string): string | undefined {
  return normalize(process.env[key]);
}

export function requireEnv(key: string): string {
  const value = optionalEnv(key);
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

const ensureServerRuntime = () => {
  // Allow Node-based test environments (e.g., Vitest + JSDOM) where `window` exists
  // but execution is still in Node.js (presents `process.versions.node`).
  if (typeof window !== 'undefined') {
    const hasProcess = typeof process !== 'undefined';
    const isNodeLike = hasProcess && Boolean(process.versions?.node);
    const isVitest = optionalEnv('VITEST_WORKER_ID');
    if (!isNodeLike && !isVitest) {
      throw new Error(
        'Attempted to access a server-only environment variable in the browser bundle.'
      );
    }
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
 * Use this for third-party integration credentials (e.g., Google OAuth, Notion)
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

export const supabaseEnv = {
  get url() {
    return requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  },
  get anonKey() {
    return requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  },
} as const;

export const notionEnv = {
  get clientId() {
    return getServerRequired('NOTION_CLIENT_ID');
  },
  get clientSecret() {
    return getServerRequired('NOTION_CLIENT_SECRET');
  },
  get redirectUri() {
    return getServerRequired('NOTION_REDIRECT_URI');
  },
  get parentPageId() {
    return getServerOptional('NOTION_PARENT_PAGE_ID') ?? '';
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

export const workerEnv = {
  get pollIntervalMs() {
    return toNumber(getServerOptional('WORKER_POLL_INTERVAL_MS'), 2000);
  },
  get concurrency() {
    return toNumber(getServerOptional('WORKER_CONCURRENCY'), 1);
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
  get deterministicOverflowModel() {
    return getServerOptional('AI_OVERFLOW');
  },
  get enableOpenRouter() {
    return toBoolean(getServerOptional('AI_ENABLE_OPENROUTER'), false);
  },
  get primaryModel() {
    return getServerOptional('AI_PRIMARY');
  },
  get fallbackModel() {
    return getServerOptional('AI_FALLBACK');
  },
  get maxOutputTokens() {
    return toNumber(getServerOptional('AI_MAX_OUTPUT_TOKENS'));
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

export const aiMicroExplanationEnv = {
  get googleApiKey() {
    return getServerOptional('GOOGLE_GENERATIVE_AI_API_KEY');
  },
  cloudflare: {
    get apiToken() {
      return getServerOptional('CF_API_TOKEN');
    },
    get apiKey() {
      return getServerOptional('CF_API_KEY');
    },
    get accountId() {
      return getServerOptional('CF_ACCOUNT_ID');
    },
    get gatewayUrl() {
      return getServerOptional('CF_AI_GATEWAY');
    },
  },
  openRouter: {
    get apiKey() {
      return getServerOptional('OPENROUTER_API_KEY');
    },
    get baseUrl() {
      return (
        getServerOptional('OPENROUTER_BASE_URL') ??
        'https://openrouter.ai/api/v1'
      );
    },
    get siteUrl() {
      return getServerOptional('OPENROUTER_SITE_URL');
    },
    get appName() {
      return getServerOptional('OPENROUTER_APP_NAME');
    },
  },
  get microExplanationMaxTokens() {
    return toNumber(getServerOptional('AI_MICRO_EXPLANATION_MAX_TOKENS'), 200);
  },
  get microExplanationTemperature() {
    return toNumber(getServerOptional('AI_MICRO_EXPLANATION_TEMPERATURE'), 0.4);
  },
  get primaryModel() {
    return getServerOptional('AI_PRIMARY') ?? 'gemini-1.5-flash';
  },
  get fallbackModel() {
    return getServerOptional('AI_FALLBACK') ?? '@cf/meta/llama-3.1-8b-instruct';
  },
  get overflowModel() {
    return getServerOptional('AI_OVERFLOW') ?? 'google/gemini-2.0-pro-exp';
  },
  get enableOpenRouter() {
    return toBoolean(getServerOptional('AI_ENABLE_OPENROUTER'), false);
  },
} as const;

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
  get baseUrl() {
    return getServerOptional('OPENROUTER_BASE_URL');
  },
  get maxOutputTokens() {
    return toNumber(getServerOptional('AI_MAX_OUTPUT_TOKENS'), 1200);
  },
} as const;

export const cloudflareAiEnv = {
  get apiToken() {
    return getServerOptional('CF_API_TOKEN');
  },
  get apiKey() {
    return getServerOptional('CF_API_KEY');
  },
  get accountId() {
    return getServerOptional('CF_ACCOUNT_ID');
  },
  get gatewayUrl() {
    return getServerOptional('CF_AI_GATEWAY');
  },
} as const;

export const googleAiEnv = {
  get apiKey() {
    return getServerOptional('GOOGLE_GENERATIVE_AI_API_KEY');
  },
  get maxOutputTokens() {
    return toNumber(getServerOptional('AI_MAX_OUTPUT_TOKENS'), 1200);
  },
} as const;

export const devClerkEnv = {
  get userId() {
    return getServerOptional('DEV_CLERK_USER_ID');
  },
  get email() {
    return getServerOptional('DEV_CLERK_USER_EMAIL') ?? 'dev@example.com';
  },
  get name() {
    return getServerOptional('DEV_CLERK_USER_NAME') ?? 'Dev User';
  },
} as const;

export const attemptsEnv = {
  get cap() {
    return toNumber(getServerOptional('ATTEMPT_CAP'), 3);
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
