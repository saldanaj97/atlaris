import { z } from 'zod';
import {
  EnvValidationError,
  getServerOptional,
  getServerRequired,
  getServerRequiredProdOnly,
  IS_PROD_RUNTIME,
} from '@/lib/config/env/shared';

const NEON_AUTH_COOKIE_SECRET_MIN_LENGTH = 32;

const NeonAuthEnvSchema = z
  .object({
    baseUrl: z.string().url(),
    cookieSecret: z.string(),
  })
  .superRefine((value, ctx) => {
    if (IS_PROD_RUNTIME && !value.baseUrl.startsWith('https://')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['baseUrl'],
        message: 'NEON_AUTH_BASE_URL must use https in production',
      });
    }

    if (
      IS_PROD_RUNTIME &&
      value.cookieSecret.length < NEON_AUTH_COOKIE_SECRET_MIN_LENGTH
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cookieSecret'],
        message: `NEON_AUTH_COOKIE_SECRET must be at least ${NEON_AUTH_COOKIE_SECRET_MIN_LENGTH} characters in production`,
      });
    }
  });

const neonAuthIssuePathToEnvKey = {
  baseUrl: 'NEON_AUTH_BASE_URL',
  cookieSecret: 'NEON_AUTH_COOKIE_SECRET',
} as const;

function resolveNeonAuthEnvKey(
  issue: z.ZodIssue | undefined
):
  | (typeof neonAuthIssuePathToEnvKey)[keyof typeof neonAuthIssuePathToEnvKey]
  | undefined {
  const rawPath = issue?.path[0];
  if (typeof rawPath === 'string' && rawPath in neonAuthIssuePathToEnvKey) {
    return neonAuthIssuePathToEnvKey[
      rawPath as keyof typeof neonAuthIssuePathToEnvKey
    ];
  }

  return Object.values(neonAuthIssuePathToEnvKey).find((envKey) =>
    issue?.message.includes(envKey)
  );
}

const parsedNeonAuthEnv = NeonAuthEnvSchema.safeParse({
  baseUrl: getServerRequired('NEON_AUTH_BASE_URL'),
  cookieSecret: getServerRequired('NEON_AUTH_COOKIE_SECRET'),
});

if (!parsedNeonAuthEnv.success) {
  const issue = parsedNeonAuthEnv.error.issues[0];

  throw new EnvValidationError(
    issue?.message ?? 'Invalid Neon auth config',
    resolveNeonAuthEnvKey(issue)
  );
}

export const neonAuthEnv = parsedNeonAuthEnv.data;

export const googleOAuthEnv = {
  get clientId(): string | undefined {
    return getServerRequiredProdOnly('GOOGLE_CLIENT_ID');
  },
  get clientSecret(): string | undefined {
    return getServerRequiredProdOnly('GOOGLE_CLIENT_SECRET');
  },
  get redirectUri(): string | undefined {
    return getServerRequiredProdOnly('GOOGLE_REDIRECT_URI');
  },
} as const;

export const oauthEncryptionEnv = {
  get encryptionKey() {
    return getServerRequired('OAUTH_ENCRYPTION_KEY');
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
