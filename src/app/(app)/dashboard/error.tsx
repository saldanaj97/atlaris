'use client';

import { PageHeader } from '@/components/ui/page-header';
import { RouteErrorState } from '@/components/ui/route-error-state';
import { clientLogger } from '@/lib/logging/client';
import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
}

/**
 * Route-level error boundary for dashboard page.
 * Catches unexpected runtime errors and provides a recovery option.
 */
export default function DashboardError({ error, retry }: ErrorProps) {
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
        title='Dashboard'
        subtitle='Your learning journey, moment by moment'
      />

      <RouteErrorState
        title='Error loading dashboard'
        message="We couldn't load your dashboard. This could be a temporary issue."
        onRetry={retry}
      />
    </>
  );
}
