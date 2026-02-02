'use client';

import { Button } from '@/components/ui/button';
import { clientLogger } from '@/lib/logging/client';
import Link from 'next/link';
import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Route-level error boundary for module detail pages.
 * Catches unexpected runtime errors and provides a recovery option.
 */
export default function ModuleDetailError({ error, reset }: ErrorProps) {
  useEffect(() => {
    clientLogger.error('Module detail error:', {
      errorDigest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <div
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center p-4"
    >
      <h1 className="mb-4 text-3xl font-bold text-red-600">
        Error Loading Module
      </h1>
      <p className="text-muted-foreground mb-6 max-w-md text-center">
        Something went wrong while loading this module. This could be a
        temporary issue.
      </p>
      <div className="flex gap-4">
        <Button onClick={reset} variant="default">
          Try Again
        </Button>
        <Button asChild variant="outline">
          <Link href="/plans">Back to Plans</Link>
        </Button>
      </div>
    </div>
  );
}
