'use client';

import { PageHeader } from '@/components/ui/page-header';
import { RouteErrorState } from '@/components/ui/route-error-state';
import { clientLogger } from '@/lib/logging/client';
import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** Route-level recovery for analytics reads that fail before the page can render. */
export default function UsageAnalyticsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    clientLogger.error('Usage analytics error:', {
      errorDigest: error.digest,
      message: error.message,
      stack: error.stack,
    });
  }, [error]);

  return (
    <>
      <PageHeader
        title='Learning analytics'
        subtitle='Current completion progress, weekly progress changes, and estimated completed learning time from your plans.'
      />
      <RouteErrorState
        title='Error loading usage analytics'
        message="We couldn't load your usage analytics. This could be a temporary issue."
        onRetry={reset}
      />
    </>
  );
}
