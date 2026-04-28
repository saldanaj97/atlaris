'use client';

import type { JSX } from 'react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { clientLogger } from '@/lib/logging/client';

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
    <>
      <PageHeader
        title="AI Preferences"
        titleAs="h2"
        subtitle="Choose your preferred AI model for generating learning plans."
      />
      <Card className="p-6" role="alert">
        <h3 className="mb-2 text-xl font-semibold text-red-600">
          Error Loading AI Settings
        </h3>
        <p className="mb-4 text-muted-foreground">
          We couldn&apos;t load your AI preferences. This could be a temporary
          issue.
        </p>
        <Button onClick={reset} variant="default">
          Try Again
        </Button>
      </Card>
    </>
  );
}
