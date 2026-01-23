'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { logger } from '@/lib/logging/logger';
import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Route-level error boundary for billing settings page.
 * Catches unexpected runtime errors and provides a recovery option.
 */
export default function BillingError({ error, reset }: ErrorProps) {
  useEffect(() => {
    logger.error(
      {
        errorDigest: error.digest,
        message: error.message,
        stack: error.stack,
      },
      'Billing page error'
    );
  }, [error]);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="mb-6 text-3xl font-bold">Billing</h1>
        <Card className="p-6" role="alert">
          <h2 className="mb-2 text-xl font-semibold text-red-600">
            Error Loading Billing Information
          </h2>
          <p className="text-muted-foreground mb-4">
            We couldn&apos;t load your billing information. This could be a
            temporary issue.
          </p>
          <Button onClick={reset} variant="default">
            Try Again
          </Button>
        </Card>
      </div>
    </div>
  );
}
