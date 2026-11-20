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

export function getShellAuthUserId(
  sessionUserId: string | undefined,
): string | undefined {
  if (isLocalProductTestingAuthEnabled()) {
    return devAuthEnv.userId;
  }
  return sessionUserId;
}
