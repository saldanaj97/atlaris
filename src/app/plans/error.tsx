'use client';

import { Button } from '@/components/ui/button';
import { clientLogger } from '@/lib/logging/client';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import type { JSX } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Route-level error boundary for plans list page.
 * Catches unexpected runtime errors and provides a recovery option.
 */
export default function PlansError({ error, reset }: ErrorProps): JSX.Element {
  useEffect(() => {
    clientLogger.error('Plans list error:', {
      errorDigest: error.digest,
      message: error.message,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1>Learning Plans</h1>
        <Button asChild>
          <Link href="/plans/new">
            <Plus className="h-4 w-4" />
            New Plan
          </Link>
        </Button>
      </div>

      <div
        role="alert"
        className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-950"
      >
        <h2 className="mb-2 text-xl font-semibold text-red-600 dark:text-red-400">
          Error Loading Plans
        </h2>
        <p className="text-muted-foreground mb-4 max-w-md">
          We couldn&apos;t load your learning plans. This could be a temporary
          issue.
        </p>
        <Button onClick={reset} variant="default">
          Try Again
        </Button>
      </div>
    </div>
  );
}
