/**
 * PostHog is enabled only for an explicit production deployment.
 *
 * Vercel Preview and custom environments run with NODE_ENV=production, so
 * NODE_ENV alone cannot identify a production deployment. VERCEL_TARGET_ENV
 * takes precedence over VERCEL_ENV when a custom environment is configured.
 */
export interface PostHogEnvironment {
  readonly NODE_ENV?: string;
  readonly VERCEL_ENV?: string;
  readonly VERCEL_TARGET_ENV?: string;
}

function normalize(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

export function isPostHogEnabled(env: PostHogEnvironment): boolean {
  if (normalize(env.NODE_ENV) !== 'production') {
    return false;
  }

  const targetEnvironment = normalize(env.VERCEL_TARGET_ENV);
  if (targetEnvironment !== undefined) {
    return targetEnvironment === 'production';
  }

  return normalize(env.VERCEL_ENV) === 'production';
}

/**
 * Reads server-side Vercel values or their explicitly exposed browser values.
 * The browser values are mapped in next.config.ts at build time.
 */
export function getPostHogEnvironment(): PostHogEnvironment {
  if (typeof window !== 'undefined') {
    return {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
      VERCEL_TARGET_ENV: process.env.NEXT_PUBLIC_VERCEL_TARGET_ENV,
    };
  }

  return {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_TARGET_ENV: process.env.VERCEL_TARGET_ENV,
  };
}

export function isPostHogEnabledInCurrentEnvironment(): boolean {
  return isPostHogEnabled(getPostHogEnvironment());
}
