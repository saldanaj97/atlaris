'use client';

import { RouteErrorState } from '@/components/ui/route-error-state';
import { clientLogger } from '@/lib/logging/client';
import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
}

/**
 * Route-level error boundary for the create-plan page.
 * Catches unexpected runtime errors and provides a recovery option.
 */
export default function CreatePlanError({ error, retry }: ErrorProps) {
  useEffect(() => {
    clientLogger.error('Create plan error:', {
      errorDigest: error.digest,
      message: error.message,
      stack: error.stack,
    });
  }, [error]);

  return (
    <RouteErrorState
      title='Error loading plan form'
      message="We couldn't load the plan form. This could be a temporary issue."
      onRetry={retry}
    />
  );
}
