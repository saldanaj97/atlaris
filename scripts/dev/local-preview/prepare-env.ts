import {
  getPostgresHostname,
  isLocalPostgresHostname,
} from '../../db/local-postgres-host';
import { ATLARIS_DEV_SUPABASE_PROJECT_REF } from './atlaris-dev-hosts';

export const LOCAL_PREVIEW_LOG_PREFIX = '[local-preview]';

/** Required names injected by the Atlaris Local Preview 1Password Environment. */
export const LOCAL_PREVIEW_REQUIRED_ENV_NAMES = [
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'POSTGRES_URL',
  'POSTGRES_URL_NON_POOLING',
  'AI_PROVIDER',
  'MOCK_AI_SCENARIO',
  'MODULE_LESSON_WORKFLOW_ENABLED',
  'PLAN_REGENERATION_WORKFLOW_ENABLED',
  'PLAN_GENERATION_WORKFLOW_ENABLED',
  'ENABLE_SENTRY',
  'NEXT_PUBLIC_ENABLE_SENTRY',
  'REGENERATION_QUEUE_ENABLED',
  'REGENERATION_INLINE_PROCESSING',
] as const;

const DEV_AUTH_PREFIX = 'DEV_AUTH_';
const VERCEL_PREFIX = 'VERCEL';

export type LocalPreviewEnvSource = Readonly<
  Record<string, string | undefined>
>;

export class LocalPreviewLaunchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalPreviewLaunchError';
  }
}

function isPresent(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Returns true when the connection URL points at the confirmed atlaris-dev
 * Supabase project (direct or pooler). Never logs URL contents.
 */
export function isConfirmedAtlarisDevPostgresUrl(
  connectionUrl: string,
  projectRef: string = ATLARIS_DEV_SUPABASE_PROJECT_REF,
): boolean {
  if (!isPresent(projectRef)) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(connectionUrl);
  } catch {
    return false;
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (!hostname || isLocalPostgresHostname(hostname)) {
    return false;
  }

  if (hostname === `db.${projectRef}.supabase.co`) {
    return true;
  }

  if (!hostname.endsWith('.pooler.supabase.com')) {
    return false;
  }

  const user = decodeURIComponent(parsed.username);
  return (
    user === projectRef ||
    user === `postgres.${projectRef}` ||
    user.endsWith(`.${projectRef}`)
  );
}

export function assertLocalPreviewRequiredEnv(
  env: LocalPreviewEnvSource,
): void {
  const missing = LOCAL_PREVIEW_REQUIRED_ENV_NAMES.filter(
    (name) => !isPresent(env[name]),
  );

  if (missing.length > 0) {
    throw new LocalPreviewLaunchError(
      `missing required environment variables: ${missing.join(', ')}`,
    );
  }
}

export function assertLocalPreviewDatabaseHosts(
  env: LocalPreviewEnvSource,
  projectRef: string = ATLARIS_DEV_SUPABASE_PROJECT_REF,
): void {
  if (!isPresent(projectRef)) {
    throw new LocalPreviewLaunchError(
      'ATLARIS_DEV_SUPABASE_PROJECT_REF is unset; add the confirmed atlaris-dev Supabase project ref to scripts/dev/local-preview/atlaris-dev-hosts.ts',
    );
  }

  for (const name of ['POSTGRES_URL', 'POSTGRES_URL_NON_POOLING'] as const) {
    const value = env[name];
    if (!isPresent(value)) {
      throw new LocalPreviewLaunchError(`missing ${name}`);
    }

    const hostname = getPostgresHostname(value);
    if (!hostname) {
      throw new LocalPreviewLaunchError(`${name} is not a valid Postgres URL`);
    }

    if (!isConfirmedAtlarisDevPostgresUrl(value, projectRef)) {
      throw new LocalPreviewLaunchError(
        `${name} host is not the confirmed atlaris-dev database`,
      );
    }
  }
}

/**
 * Build the process env for Local Preview: force Local World overrides and
 * strip hosted/fixture auth leakage. Does not log values.
 */
export function buildLocalPreviewProcessEnv(
  env: LocalPreviewEnvSource,
): NodeJS.ProcessEnv {
  const next: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      continue;
    }
    if (key === 'WORKFLOW_CALLBACK_TOKEN') {
      continue;
    }
    if (key.startsWith(DEV_AUTH_PREFIX)) {
      continue;
    }
    if (key === 'VERCEL' || key.startsWith(`${VERCEL_PREFIX}_`)) {
      continue;
    }
    next[key] = value;
  }

  next.NODE_ENV = 'development';
  next.WORKFLOW_TARGET_WORLD = 'local';
  next.LOCAL_PRODUCT_TESTING = 'false';

  // Explicit clears in case a parent shell exported empty placeholders.
  delete next.WORKFLOW_CALLBACK_TOKEN;
  for (const key of Object.keys(next)) {
    if (key.startsWith(DEV_AUTH_PREFIX)) {
      delete next[key];
    }
    if (key === 'VERCEL' || key.startsWith(`${VERCEL_PREFIX}_`)) {
      delete next[key];
    }
  }

  return next as NodeJS.ProcessEnv;
}

export function prepareLocalPreviewEnv(
  env: LocalPreviewEnvSource,
  projectRef: string = ATLARIS_DEV_SUPABASE_PROJECT_REF,
): NodeJS.ProcessEnv {
  assertLocalPreviewRequiredEnv(env);
  assertLocalPreviewDatabaseHosts(env, projectRef);
  return buildLocalPreviewProcessEnv(env);
}
