'use client';

import type { JSX } from 'react';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
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
    <PageShell>
      <PageHeader
        title='Activity Feed'
        subtitle='Your learning journey, moment by moment'
      />

      <div
        role='alert'
        className='flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-950'
      >
        <h2 className='mb-2 text-xl font-semibold text-red-600 dark:text-red-400'>
          Error Loading Dashboard
        </h2>
        <p className='mb-4 max-w-md text-muted-foreground'>
          We couldn&apos;t load your activity feed. This could be a temporary
          issue.
        </p>
        <Button onClick={reset}>Try Again</Button>
      </div>
    </PageShell>
  );
}
