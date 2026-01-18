'use client';

import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logging/logger';
import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Route-level error boundary for dashboard page.
 * Catches unexpected runtime errors and provides a recovery option.
 */
export default function DashboardError({ error, reset }: ErrorProps) {
  useEffect(() => {
    logger.error(
      {
        errorDigest: error.digest,
        message: error.message,
        stack: error.stack,
      },
      'Dashboard error'
    );
  }, [error]);

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1>Activity Feed</h1>
        <p className="subtitle">Your learning journey, moment by moment</p>
      </header>

      <div
        role="alert"
        className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-950"
      >
        <h2 className="mb-2 text-xl font-semibold text-red-600 dark:text-red-400">
          Error Loading Dashboard
        </h2>
        <p className="text-muted-foreground mb-4 max-w-md">
          We couldn&apos;t load your activity feed. This could be a temporary
          issue.
        </p>
        <Button onClick={reset} variant="default">
          Try Again
        </Button>
      </div>
    </div>
  );
}
