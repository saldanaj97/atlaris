'use client';

import { useUser } from '@clerk/nextjs';
import posthog from 'posthog-js';
import { useEffect } from 'react';

/**
 * Identifies the authenticated Clerk user in PostHog on mount and whenever
 * the auth state changes. Must be rendered inside ClerkProvider.
 *
 * PII (email, name) goes into PostHog person properties via identify(), not
 * into capture() event properties. Signed-out (loaded) calls reset() so the
 * persisted distinct ID is not reused across accounts.
 */
export function PostHogUserIdentifier() {
  const { isLoaded, isSignedIn, user } = useUser();

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn && user) {
      posthog.identify(user.id, {
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName ?? undefined,
      });
      return;
    }

    posthog.reset();
  }, [isLoaded, isSignedIn, user]);

  return null;
}
