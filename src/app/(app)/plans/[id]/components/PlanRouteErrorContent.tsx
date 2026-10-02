'use client';

import { Button } from '@/components/ui/button';
import { RouteErrorState } from '@/components/ui/route-error-state';
import { clientLogger } from '@/lib/logging/client';
import Link from 'next/link';
import { useEffect } from 'react';

type PlanRouteErrorContentProps = {
  error: Error & { digest?: string };
  retry: () => void;
  logMessage: string;
  title: string;
  message: string;
};

export function PlanRouteErrorContent({
  error,
  retry,
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
    <div className='py-10'>
      <RouteErrorState
        title={title}
        message={message}
        actions={
          <div className='flex flex-col gap-3 sm:flex-row sm:justify-center'>
            <Button onClick={retry} variant='default'>
              Try again
            </Button>
            <Button asChild variant='outline'>
              <Link href='/plans'>Back to plans</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
