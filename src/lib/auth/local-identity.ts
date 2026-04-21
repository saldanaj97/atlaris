import { appEnv, devAuthEnv, localProductTestingEnv } from '@/lib/config/env';

/**
 * Resolves the auth user id for shell/header UI when local product testing uses
 * `DEV_AUTH_USER_ID` without a real Neon session. Otherwise uses the session user id.
 */
export function getShellAuthUserId(
  sessionUserId: string | undefined
): string | undefined {
  if (
    appEnv.isDevelopment &&
    localProductTestingEnv.enabled &&
    devAuthEnv.userId
  ) {
    return devAuthEnv.userId;
  }
  return sessionUserId;
}
