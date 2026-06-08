'use client';

import { Button } from '@/components/ui/button';
import { RouteErrorState } from '@/components/ui/route-error-state';
import { clientLogger } from '@/lib/logging/client';
import Link from 'next/link';
import { useEffect } from 'react';

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
    <div className='flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center p-4'>
      <RouteErrorState
        title={title}
        message={message}
        actions={
          <div className='flex gap-4'>
            <Button onClick={reset} variant='default'>
              Try Again
            </Button>
            <Button asChild variant='outline'>
              <Link href='/plans'>Back to Plans</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
