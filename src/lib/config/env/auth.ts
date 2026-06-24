import {
  type EnvSource,
  EnvValidationError,
  getServerOptional,
  requireEnvFrom,
} from '@/lib/config/env/shared';
import { z } from 'zod';

const CLERK_PUBLISHABLE_KEY_PATTERN = /^pk_(test|live)_[A-Za-z0-9_-]+/;
const CLERK_SECRET_KEY_PATTERN = /^sk_(test|live)_[A-Za-z0-9_-]+/;

const CLERK_AUTH_ENV_KEY_BY_PATH = {
  publishableKey: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  secretKey: 'CLERK_SECRET_KEY',
} as const;

const clerkAuthFields = z.object({
  publishableKey: z.string().regex(CLERK_PUBLISHABLE_KEY_PATTERN, {
    message:
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must start with pk_test_ or pk_live_',
  }),
  secretKey: z.string().regex(CLERK_SECRET_KEY_PATTERN, {
    message: 'CLERK_SECRET_KEY must start with sk_test_ or sk_live_',
  }),
});

type ClerkAuthEnv = z.infer<typeof clerkAuthFields>;

/**
 * Parse Clerk Auth config from an explicit env source (unit tests; no process mutation).
 */
export function createClerkAuthEnv(env: EnvSource): ClerkAuthEnv {
  const parsed = clerkAuthFields.safeParse({
    publishableKey: requireEnvFrom(env, 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'),
    secretKey: requireEnvFrom(env, 'CLERK_SECRET_KEY'),
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const envKey =
        issue.path.length === 1
          ? CLERK_AUTH_ENV_KEY_BY_PATH[
              issue.path[0] as keyof typeof CLERK_AUTH_ENV_KEY_BY_PATH
            ]
          : undefined;
      return {
        envKey,
        message: envKey ? `${envKey}: ${issue.message}` : issue.message,
      };
    });
    const envKeys = [
      ...new Set(
        issues.flatMap((issue) => (issue.envKey ? [issue.envKey] : [])),
      ),
    ];
    throw new EnvValidationError(
      issues.length > 0
        ? issues.map((issue) => issue.message).join('; ')
        : 'Invalid Clerk auth config',
      envKeys.length === 1 ? envKeys[0] : undefined,
    );
  }
  return parsed.data;
}

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
