'use client';

import { isPostHogEnabledInCurrentEnvironment } from '@/lib/config/env/posthog';
import { useUser } from '@clerk/nextjs';
import posthog from 'posthog-js';
import { useEffect } from 'react';

export function PostHogUserIdentifier() {
  const { isLoaded, isSignedIn, user } = useUser();

  useEffect(() => {
    if (!isLoaded || !isPostHogEnabledInCurrentEnvironment()) return;

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
