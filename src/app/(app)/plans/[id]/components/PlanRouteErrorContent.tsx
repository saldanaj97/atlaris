'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { clientLogger } from '@/lib/logging/client';

type PlanRouteErrorContentProps = {
  error: Error & { digest?: string };
  reset: () => void;
  logMessage: string;
  title: string;
  message: string;
};

export function PlanRouteErrorContent({
  error,
  reset,
  logMessage,
  title,
  message,
}: PlanRouteErrorContentProps): React.ReactElement {
  useEffect(() => {
    clientLogger.error(logMessage, {
      errorDigest: error.digest,
      message: error.message,
      stack: error.stack,
    });
  }, [error, logMessage]);

  return (
    <div
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center p-4"
    >
      <h1 className="mb-4 text-3xl font-bold text-red-600">{title}</h1>
      <p className="mb-6 max-w-md text-center text-muted-foreground">
        {message}
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
