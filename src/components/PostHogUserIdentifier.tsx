'use client';

import { useUser } from '@clerk/nextjs';
import posthog from 'posthog-js';
import { useEffect, useRef } from 'react';

/**
 * Identifies the authenticated Clerk user in PostHog on mount and whenever
 * the auth state changes. Must be rendered inside ClerkProvider.
 *
 * PII (email, name) goes into PostHog person properties via identify(), not
 * into capture() event properties. Reset runs only on a signed-in → signed-out
 * transition so the first anonymous pageview keeps its distinct ID for signup
 * attribution.
 */
export function PostHogUserIdentifier() {
  const { isLoaded, isSignedIn, user } = useUser();
  const wasSignedInRef = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn && user) {
      posthog.identify(user.id, {
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName ?? undefined,
      });
    } else if (wasSignedInRef.current && !isSignedIn) {
      posthog.reset();
    }

    wasSignedInRef.current = Boolean(isSignedIn);
  }, [isLoaded, isSignedIn, user]);

  return null;
}
