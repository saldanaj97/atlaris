/**
 * Single source of truth for anon vs auth smoke launcher env.
 * Ports match Phase 2 Playwright `baseURL` expectations — change only here.
 */
import { LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID } from '@/lib/config/local-product-testing';

import type { SmokeStatePayload } from './state-file';

/** Anon Playwright project / app server port */
export const SMOKE_ANON_PORT = 3100 as const;

/** Auth Playwright project / app server port */
export const SMOKE_AUTH_PORT = 3101 as const;

const SMOKE_CONTROLLED_ENV_KEYS = [
  'ENABLE_SENTRY',
  'APP_URL',
  'AV_MOCK_SCENARIO',
  'AV_PROVIDER',
  'DATABASE_URL',
  'DATABASE_URL_NON_POOLING',
  'DATABASE_URL_UNPOOLED',
  'DEV_AUTH_USER_ID',
  'LOCAL_PRODUCT_TESTING',
  'MOCK_AI_SCENARIO',
  'MOCK_GENERATION_SEED',
  'NODE_ENV',
  'NEXT_PUBLIC_ENABLE_SENTRY',
  'PORT',
  'SMOKE_NEXT_DIST_DIR',
  'STRIPE_LOCAL_MODE',
  'AI_PROVIDER',
  'AI_USE_MOCK',
] as const;

export function smokeAnonAppUrl(): string {
  return `http://127.0.0.1:${SMOKE_ANON_PORT}`;
}

export function smokeAuthAppUrl(): string {
  return `http://127.0.0.1:${SMOKE_AUTH_PORT}`;
}

function baseSmokeLayer(state: SmokeStatePayload): Record<string, string> {
  return {
    DATABASE_URL: state.DATABASE_URL,
    DATABASE_URL_NON_POOLING: state.DATABASE_URL_NON_POOLING,
    DATABASE_URL_UNPOOLED: state.DATABASE_URL_UNPOOLED,
    ENABLE_SENTRY: 'false',
    NEXT_PUBLIC_ENABLE_SENTRY: 'false',
    MOCK_AI_SCENARIO: 'success',
    AV_MOCK_SCENARIO: 'clean',
    NODE_ENV: 'development',
  };
}

/**
 * Env layer for anon smoke: unauthenticated browser, protected routes redirect to sign-in.
 * All values are strings suitable for `process.env`.
 */
export function buildAnonModeLayer(
  state: SmokeStatePayload
): Record<string, string> {
  return {
    ...baseSmokeLayer(state),
    DEV_AUTH_USER_ID: '',
    LOCAL_PRODUCT_TESTING: 'false',
    STRIPE_LOCAL_MODE: 'false',
    AI_PROVIDER: '',
    AI_USE_MOCK: 'false',
    AV_PROVIDER: 'none',
    PORT: String(SMOKE_ANON_PORT),
    APP_URL: smokeAnonAppUrl(),
    SMOKE_NEXT_DIST_DIR: '.test-dist/next-smoke-anon',
  };
}

/**
 * Env layer for auth smoke: seeded local product-testing user + local billing/AI/AV mocks.
 */
export function buildAuthModeLayer(
  state: SmokeStatePayload
): Record<string, string> {
  return {
    ...baseSmokeLayer(state),
    DEV_AUTH_USER_ID: LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID,
    LOCAL_PRODUCT_TESTING: 'true',
    STRIPE_LOCAL_MODE: 'true',
    AI_PROVIDER: '',
    AI_USE_MOCK: 'true',
    AV_PROVIDER: 'mock',
    PORT: String(SMOKE_AUTH_PORT),
    APP_URL: smokeAuthAppUrl(),
    SMOKE_NEXT_DIST_DIR: '.test-dist/next-smoke-auth',
  };
}

/**
 * Node prints a warning when both `NO_COLOR` and `FORCE_COLOR` are set (FORCE_COLOR wins).
 * Playwright and other parents often set FORCE_COLOR; shells or CI may set NO_COLOR.
 * Drop `NO_COLOR` in that case so the Next dev child process does not spam stderr.
 */
/** Mutates `env` in place. Caller should pass a copy if original must be preserved. */
function stripConflictingNoColor(
  env: Record<string, string | undefined>
): void {
  if (env.FORCE_COLOR !== undefined && env.NO_COLOR !== undefined) {
    delete env.NO_COLOR;
  }
}

/**
 * Merge parent env with a smoke mode layer. Later keys win. Forces `NODE_ENV=development`
 * so Next `appEnv.isDevelopment` and local bypasses in `src/proxy.ts` stay enabled.
 */
export function mergeSmokeProcessEnv(
  base: NodeJS.ProcessEnv,
  layer: Record<string, string>
): NodeJS.ProcessEnv {
  const merged = { ...base } as Record<string, string | undefined>;
  for (const key of SMOKE_CONTROLLED_ENV_KEYS) {
    delete merged[key];
  }
  Object.assign(merged, layer);
  merged.NODE_ENV = 'development';
  stripConflictingNoColor(merged);
  return merged as NodeJS.ProcessEnv;
}

type SmokeAppMode = 'anon' | 'auth';

export function parseSmokeAppMode(argv: string[]): SmokeAppMode {
  const raw = argv
    .find((a) => a.startsWith('--mode='))
    ?.slice('--mode='.length);
  if (raw === 'anon' || raw === 'auth') {
    return raw;
  }
  throw new Error('Missing or invalid --mode. Use --mode=anon or --mode=auth.');
}
