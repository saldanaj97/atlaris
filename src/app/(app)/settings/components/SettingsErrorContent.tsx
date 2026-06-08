'use client';

import { PageHeader } from '@/components/ui/page-header';
import { RouteErrorState } from '@/components/ui/route-error-state';
import { clientLogger } from '@/lib/logging/client';
import { useEffect } from 'react';

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
      <PageHeader title={title} subtitle={subtitle} />
      <RouteErrorState
        title={errorTitle}
        message={errorMessage}
        onRetry={reset}
      />
    </>
  );
}
