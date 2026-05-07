import { appEnv, devAuthEnv, localProductTestingEnv } from '@/lib/config/env';

export function isLocalProductTestingAuthEnabled(): boolean {
  return (
    appEnv.isDevelopment &&
    localProductTestingEnv.enabled &&
    Boolean(devAuthEnv.userId?.trim())
  );
}

export function shouldUseClerkUi(): boolean {
  return !isLocalProductTestingAuthEnabled();
}

/**
 * Resolves the auth user id for shell/header UI when local product testing uses
 * `DEV_AUTH_USER_ID` without a real Clerk session. Otherwise uses the session user id.
 */
export function getShellAuthUserId(
  sessionUserId: string | undefined,
): string | undefined {
  if (isLocalProductTestingAuthEnabled()) {
    return devAuthEnv.userId;
  }
  return sessionUserId;
}
