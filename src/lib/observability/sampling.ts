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

const LOW_VALUE_PATTERNS: RegExp[] = [
  /\/_next\//,
  /\/favicon\.ico/,
  /\/api\/health/,
  /\/robots\.txt/,
  /\/sitemap/,
  /\.(css|js|png|jpg|jpeg|gif|svg|woff2?|ttf|eot|ico)(\?|$)/,
];

const HIGH_VALUE_PATTERNS: RegExp[] = [/\/api\//];

export function tracesSampler(context: {
  name?: string;
  parentSampled?: boolean;
  _attributes?: Record<string, unknown>;
}): number {
  const env = getEnvironment();
  const name = context.name ?? '';

  if (context.parentSampled !== undefined) {
    return context.parentSampled ? 1.0 : 0;
  }

  if (LOW_VALUE_PATTERNS.some((p) => p.test(name))) {
    return env === 'production' ? 0 : 0.01;
  }

  if (HIGH_VALUE_PATTERNS.some((p) => p.test(name))) {
    return env === 'production' ? 0.2 : 1.0;
  }

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
