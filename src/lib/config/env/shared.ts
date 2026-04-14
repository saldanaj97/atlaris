import { z } from 'zod';

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

const normalize = (value: string | undefined | null): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const booleanEnvValues = ['true', 'false', '1', '0'] as const;

export const nodeEnvSchema = z.enum(['development', 'production', 'test']);
export type NodeEnv = z.infer<typeof nodeEnvSchema>;

const booleanEnvSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.enum(booleanEnvValues))
  .transform((value) => value === 'true' || value === '1');

/**
 * Zod schema: string that parses to a finite number via `Number()`; `NaN` and
 * infinities fail parse
 * (callers fall back to optional defaults).
 */
const parseableNumericEnvString = z.string().transform((s, ctx) => {
  const n = Number(s);
  if (!Number.isFinite(n)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Not a valid finite number',
    });
    return z.NEVER;
  }
  return n;
});

/**
 * Parses optional env string into a finite number. Invalid values map to the
 * fallback or `undefined`.
 */
export function parseEnvNumber(value: string | undefined): number | undefined;
export function parseEnvNumber(
  value: string | undefined,
  fallback: number
): number;
export function parseEnvNumber(
  value: string | undefined,
  fallback?: number
): number | undefined {
  if (value === undefined) {
    return fallback;
  }
  const parsed = parseableNumericEnvString.safeParse(value);
  if (!parsed.success) {
    return fallback;
  }
  return parsed.data;
}

/**
 * Parses a string to a boolean. Use for consistent env boolean parsing.
 * Truthy (case-insensitive, trimmed): 'true' | '1'. All other non-empty values are false.
 */
export function toBoolean(
  value: string | undefined,
  fallback: boolean
): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === '') {
    return fallback;
  }
  return normalized === 'true' || normalized === '1';
}

export function optionalEnv(key: string): string | undefined {
  return normalize(process.env[key]);
}

function parseBooleanEnvValue(
  value: string | undefined,
  key: string
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = booleanEnvSchema.safeParse(value);
  if (!parsed.success) {
    throw new EnvValidationError(
      `${key} must be one of: ${booleanEnvValues.join(', ')}`,
      key
    );
  }

  return parsed.data;
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

const ensureServerRuntime = (): void => {
  const isVitestRuntime =
    typeof process !== 'undefined' &&
    process.env?.VITEST_WORKER_ID !== undefined;

  if (typeof window !== 'undefined') {
    if (!isVitestRuntime) {
      throw new EnvValidationError(
        'Attempted to access a server-only environment variable in the browser bundle.'
      );
    }
  }

  const isNonProduction =
    typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
  if (isNonProduction) {
    return;
  }
};

const serverRequiredCache = new Map<string, string>();
export const serverOptionalCache = new Map<string, string | undefined>();

function getCachedServerRequired(
  cache: Map<string, string>,
  key: string,
  loader: () => string
): string {
  if (!cache.has(key)) {
    cache.set(key, loader());
  }
  const cached = cache.get(key);
  if (cached === undefined) {
    throw new Error(
      `Invariant: required env cache entry for "${key}" is missing after initialization.`
    );
  }
  return cached;
}

// In test runtime, environment values may change between tests; avoid caching.
// Treat non-production runtimes (development, test) as mutable envs; avoid caching to
// ensure tests and dev server reflect env changes without process restarts.
export const IS_TEST_RUNTIME =
  typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

export const IS_PROD_RUNTIME =
  typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';

export function getNodeEnv(): NodeEnv {
  const raw = optionalEnv('NODE_ENV');
  if (raw === undefined) {
    return 'development';
  }

  const parsed = nodeEnvSchema.safeParse(raw);
  if (!parsed.success) {
    throw new EnvValidationError(
      'NODE_ENV must be one of: development, production, test',
      'NODE_ENV'
    );
  }

  return parsed.data;
}

export function getServerRequired(key: string): string {
  ensureServerRuntime();
  if (IS_TEST_RUNTIME) {
    return requireEnv(key);
  }
  return getCachedServerRequired(serverRequiredCache, key, () =>
    requireEnv(key)
  );
}

export function getServerOptional(key: string): string | undefined {
  ensureServerRuntime();
  if (IS_TEST_RUNTIME) {
    return optionalEnv(key);
  }
  if (!serverOptionalCache.has(key)) {
    serverOptionalCache.set(key, optionalEnv(key));
  }
  return serverOptionalCache.get(key);
}

export function getServerBoolean(key: string, fallback: boolean): boolean {
  ensureServerRuntime();
  const raw = getServerOptional(key);
  const parsed = parseBooleanEnvValue(raw, key);
  return parsed ?? fallback;
}

const localProductTestingEnvEnabled =
  parseBooleanEnvValue(
    optionalEnv('LOCAL_PRODUCT_TESTING'),
    'LOCAL_PRODUCT_TESTING'
  ) ?? false;

if (IS_PROD_RUNTIME && localProductTestingEnvEnabled) {
  throw new EnvValidationError(
    'LOCAL_PRODUCT_TESTING cannot be enabled in production',
    'LOCAL_PRODUCT_TESTING'
  );
}

const stripeLocalModeEnabled = toBoolean(
  optionalEnv('STRIPE_LOCAL_MODE'),
  false
);

if (IS_PROD_RUNTIME && stripeLocalModeEnabled) {
  throw new EnvValidationError(
    'STRIPE_LOCAL_MODE cannot be enabled in production',
    'STRIPE_LOCAL_MODE'
  );
}

/**
 * Retrieves an environment variable that is required in production but optional in dev/test.
 */
export function getServerRequiredProdOnly(key: string): string | undefined {
  ensureServerRuntime();

  if (!IS_PROD_RUNTIME) {
    return getServerOptional(key);
  }

  return getCachedServerRequired(serverRequiredCache, key, () =>
    requireEnv(key)
  );
}

export function getSmokeStateFileEnv(): string | undefined {
  return getServerOptional('SMOKE_STATE_FILE');
}
