import { z } from 'zod';
import {
  type EnvSource,
  EnvValidationError,
  getProcessEnvSource,
  getServerOptional,
  isProdRuntimeEnv,
  requireEnvFrom,
} from '@/lib/config/env/shared';

const NEON_AUTH_COOKIE_SECRET_MIN_LENGTH = 32;
const NEON_AUTH_ENV_KEY_BY_PATH = {
  baseUrl: 'NEON_AUTH_BASE_URL',
  cookieSecret: 'NEON_AUTH_COOKIE_SECRET',
} as const;

const neonAuthFields = z.object({
  baseUrl: z.string().url(),
  cookieSecret: z.string(),
});

type NeonAuthEnv = z.infer<typeof neonAuthFields>;

/**
 * Parse Neon Auth config from an explicit env source (unit tests; no process mutation).
 */
export function createNeonAuthEnv(env: EnvSource): NeonAuthEnv {
  const schema = neonAuthFields.superRefine((value, ctx) => {
    if (isProdRuntimeEnv(env) && !value.baseUrl.startsWith('https://')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['baseUrl'],
        message: 'NEON_AUTH_BASE_URL must use https in production',
      });
    }

    if (
      isProdRuntimeEnv(env) &&
      value.cookieSecret.length < NEON_AUTH_COOKIE_SECRET_MIN_LENGTH
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cookieSecret'],
        message: `NEON_AUTH_COOKIE_SECRET must be at least ${NEON_AUTH_COOKIE_SECRET_MIN_LENGTH} characters in production`,
      });
    }
  });

  const parsed = schema.safeParse({
    baseUrl: requireEnvFrom(env, 'NEON_AUTH_BASE_URL'),
    cookieSecret: requireEnvFrom(env, 'NEON_AUTH_COOKIE_SECRET'),
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const envKey =
        issue.path.length === 1
          ? NEON_AUTH_ENV_KEY_BY_PATH[
              issue.path[0] as keyof typeof NEON_AUTH_ENV_KEY_BY_PATH
            ]
          : undefined;
      return {
        envKey,
        message: envKey ? `${envKey}: ${issue.message}` : issue.message,
      };
    });
    const envKeys = [
      ...new Set(issues.map((issue) => issue.envKey).filter(Boolean)),
    ];
    throw new EnvValidationError(
      issues.length > 0
        ? issues.map((issue) => issue.message).join('; ')
        : 'Invalid Neon auth config',
      envKeys.length === 1 ? envKeys[0] : undefined
    );
  }
  return parsed.data;
}

let neonAuthLazy: NeonAuthEnv | undefined;

function loadNeonAuthFromProcess(): NeonAuthEnv {
  if (neonAuthLazy) {
    return neonAuthLazy;
  }
  neonAuthLazy = createNeonAuthEnv(getProcessEnvSource());
  return neonAuthLazy;
}

/** Lazy Neon auth config; validates on first property read. */
export const neonAuthEnv = {
  get baseUrl() {
    return loadNeonAuthFromProcess().baseUrl;
  },
  get cookieSecret() {
    return loadNeonAuthFromProcess().cookieSecret;
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
