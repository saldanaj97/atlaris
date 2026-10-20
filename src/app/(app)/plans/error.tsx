'use client';

import { PlansHero } from '@/app/(app)/plans/components/PlansHero';
import { RouteErrorState } from '@/components/ui/route-error-state';
import { clientLogger } from '@/lib/logging/client';
import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
}

/**
 * Route-level error boundary for plans list page.
 * Catches unexpected runtime errors and provides a recovery option.
 */
export default function PlansError({ error, retry }: ErrorProps) {
  useEffect(() => {
    clientLogger.error('Plans list error:', {
      errorDigest: error.digest,
      message: error.message,
      stack: error.stack,
    });
  }, [error]);

  return (
    <>
      <PlansHero />

      <RouteErrorState
        title='Error loading plans'
        message="We couldn't load your learning plans. This could be a temporary issue."
        onRetry={retry}
      />
    </>
  );
}
