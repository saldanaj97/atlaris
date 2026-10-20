'use client';

import { RouteErrorState } from '@/components/ui/route-error-state';
import { clientLogger } from '@/lib/logging/client';
import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
}

/**
 * Catch-all error boundary for app routes without their own `error.tsx`
 * (settings, analytics, achievements, ...). Keeps the app shell in place.
 */
export default function AppError({ error, retry }: ErrorProps) {
  useEffect(() => {
    clientLogger.error('App route error:', {
      errorDigest: error.digest,
      message: error.message,
      stack: error.stack,
    });
  }, [error]);

  return (
    <RouteErrorState
      title='Something went wrong'
      message="We couldn't load this page. This could be a temporary issue."
      onRetry={retry}
    />
  );
}
