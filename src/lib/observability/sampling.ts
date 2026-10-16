/**
 * Observability sampling configuration for Sentry.
 *
 * Tuned for launch readiness: conservative in production to reduce
 * third-party read costs (trace ingest, log shipping),
 * generous in development for full debugging visibility.
 *
 * Sampling budget (production):
 *   Errors/exceptions  → 100 % (always captured, non-negotiable)
 *   API route traces   →  20 % (primary performance signal)
 *   Default traces     →   5 % (background pages, navigations)
 *   Health / static    →   0 % (zero diagnostic value)
 *   SDK log shipping   → off  (pino still logs locally; errors go via captureException)
 */

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

type Environment = 'production' | 'development' | 'test';

/**
 * Resolve the current runtime environment.
 * Works on both client (inlined at build time) and server (runtime).
 *
 * NOTE: We intentionally read `process.env.NODE_ENV` directly instead of
 * importing from `@/lib/config/env`. That module eagerly validates
 * server-only secrets (e.g. CLERK_SECRET_KEY) at import time, which would
 * throw in client bundles and Sentry edge/instrumentation configs that
 * load before the full server environment is available.
 */
export function getEnvironment(): Environment {
  const env =
    typeof process !== 'undefined' ? process.env.NODE_ENV : 'development';
  if (env === 'production') return 'production';
  if (env === 'test') return 'test';
  return 'development';
}

// ---------------------------------------------------------------------------
// Trace sampling
// ---------------------------------------------------------------------------

/** Patterns with zero diagnostic value — always drop in production. */
const LOW_VALUE_PATTERNS: RegExp[] = [
  /\/_next\//,
  /\/favicon\.ico/,
  /\/api\/health/,
  /\/robots\.txt/,
  /\/sitemap/,
  /\.(css|js|png|jpg|jpeg|gif|svg|woff2?|ttf|eot|ico)(\?|$)/,
];

/** High-value server work — sample more aggressively. */
const HIGH_VALUE_PATTERNS: RegExp[] = [
  /\/api\//, // API routes (after low-value filter excludes health)
];

/**
 * Sentry `tracesSampler` — replaces the flat `tracesSampleRate` with
 * context-aware decisions.
 *
 * The function receives the sampling context from Sentry and returns a
 * number between 0 and 1 (or boolean) indicating the probability that
 * the trace should be recorded.
 *
 * Exported as a standalone pure function so it can be unit-tested without
 * booting Sentry.
 */
export function tracesSampler(context: {
  name?: string;
  parentSampled?: boolean;
  _attributes?: Record<string, unknown>;
}): number {
  const env = getEnvironment();
  const name = context.name ?? '';

  // Inherit parent sampling decision for distributed traces so child
  // spans are never orphaned from their parent.
  if (context.parentSampled !== undefined) {
    return context.parentSampled ? 1.0 : 0;
  }

  // Low-value: health checks, static assets, favicons.
  if (LOW_VALUE_PATTERNS.some((p) => p.test(name))) {
    return env === 'production' ? 0 : 0.01;
  }

  // High-value: API routes (the main performance signal).
  if (HIGH_VALUE_PATTERNS.some((p) => p.test(name))) {
    return env === 'production' ? 0.2 : 1.0;
  }

  // Default: page loads, navigations, background work.
  switch (env) {
    case 'production':
      return 0.05;
    case 'development':
      return 0.5;
    case 'test':
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Log shipping
// ---------------------------------------------------------------------------

/**
 * Whether to enable Sentry SDK log shipping (`enableLogs`).
 *
 * Override: set `SENTRY_ENABLE_LOGS=true` to force-enable log shipping in
 * any environment (useful for ops debugging in production).
 *
 * Default behaviour:
 * Production: disabled — reduces ingest volume. Errors are still captured
 * via `captureException`; pino logs locally for operational tailing.
 * Development/test: enabled for full observability during debugging.
 */
export function shouldEnableLogs(): boolean {
  const override =
    typeof process !== 'undefined'
      ? process.env.SENTRY_ENABLE_LOGS?.trim().toLowerCase()
      : undefined;
  if (override === 'true' || override === '1') return true;
  if (override === 'false' || override === '0') return false;
  return getEnvironment() !== 'production';
}
