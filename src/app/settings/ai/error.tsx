'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { clientLogger } from '@/lib/logging/client';
import { useEffect } from 'react';
import type { JSX } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Route-level error boundary for AI settings page.
 * Catches unexpected runtime errors and provides a recovery option.
 */
export default function AISettingsError({
  error,
  reset,
}: ErrorProps): JSX.Element {
  useEffect(() => {
    clientLogger.error('AI settings error:', {
      errorDigest: error.digest,
      message: error.message,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="mb-2 text-3xl font-bold">AI Preferences</h1>
        <p className="text-muted-foreground mb-6">
          Choose your preferred AI model for generating learning plans.
        </p>
        <Card className="p-6" role="alert">
          <h2 className="mb-2 text-xl font-semibold text-red-600">
            Error Loading AI Settings
          </h2>
          <p className="text-muted-foreground mb-4">
            We couldn&apos;t load your AI preferences. This could be a temporary
            issue.
          </p>
          <Button onClick={reset} variant="default">
            Try Again
          </Button>
        </Card>
      </div>
    </div>
  );
}
