'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { clientLogger } from '@/lib/logging/client';

type SettingsErrorContentProps = {
  error: Error & { digest?: string };
  reset: () => void;
  logMessage: string;
  title: string;
  subtitle?: string;
  errorTitle: string;
  errorMessage: string;
};

export function SettingsErrorContent({
  error,
  reset,
  logMessage,
  title,
  subtitle,
  errorTitle,
  errorMessage,
}: SettingsErrorContentProps): React.ReactElement {
  useEffect(() => {
    clientLogger.error(logMessage, {
      errorDigest: error.digest,
      message: error.message,
      stack: error.stack,
    });
  }, [error, logMessage]);

  return (
    <>
      <PageHeader title={title} titleAs="h2" subtitle={subtitle} />
      <Card className="p-6" role="alert">
        <h3 className="mb-2 text-xl font-semibold text-red-600">
          {errorTitle}
        </h3>
        <p className="mb-4 text-muted-foreground">{errorMessage}</p>
        <Button onClick={reset} variant="default">
          Try Again
        </Button>
      </Card>
    </>
  );
}
