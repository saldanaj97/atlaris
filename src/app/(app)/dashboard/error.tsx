'use client';

import type { JSX } from 'react';

import { PageHeader } from '@/components/ui/page-header';
import { RouteErrorState } from '@/components/ui/route-error-state';
import { clientLogger } from '@/lib/logging/client';
import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Route-level error boundary for dashboard page.
 * Catches unexpected runtime errors and provides a recovery option.
 */
export default function DashboardError({
  error,
  reset,
}: ErrorProps): JSX.Element {
  useEffect(() => {
    clientLogger.error('Dashboard error:', {
      errorDigest: error.digest,
      message: error.message,
      stack: error.stack,
    });
  }, [error]);

  return (
    <>
      <PageHeader
        title='Activity Feed'
        subtitle='Your learning journey, moment by moment'
      />

      <RouteErrorState
        title='Error Loading Dashboard'
        message="We couldn't load your activity feed. This could be a temporary issue."
        onRetry={reset}
      />
    </>
  );
}
