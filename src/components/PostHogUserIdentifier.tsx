'use client';

import { useUser } from '@clerk/nextjs';
import posthog from 'posthog-js';
import { useEffect } from 'react';

/**
 * Identifies the authenticated Clerk user in PostHog on mount and whenever
 * the auth state changes. Must be rendered inside ClerkProvider.
 *
 * PII (email, name) goes into PostHog person properties via identify(), not
 * into capture() event properties. Reset clears a persisted identified user on
 * signed-out loads while preserving a genuinely anonymous distinct ID.
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
    } else if (!isSignedIn && posthog.get_property('$user_id')) {
      posthog.reset();
    }
  }, [isLoaded, isSignedIn, user]);

  return null;
}
