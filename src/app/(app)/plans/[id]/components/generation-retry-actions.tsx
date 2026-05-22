import { Loader2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { MAX_RETRY_ATTEMPTS } from './plan-pending-view-state';

export function RetryAction({
  attempts,
  isRetrying,
  isRetryDisabled,
  onRetry,
}: {
  attempts: number;
  isRetrying: boolean;
  isRetryDisabled: boolean;
  onRetry: () => void;
}) {
  return (
    <Button onClick={onRetry} disabled={isRetryDisabled} className="w-full">
      {isRetrying ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Retrying…
        </>
      ) : (
        <>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry Generation ({MAX_RETRY_ATTEMPTS - attempts} attempts remaining)
        </>
      )}
    </Button>
  );
}

export function ExhaustedRetriesMessage() {
  return (
    <div className="rounded-lg bg-muted p-4 text-center">
      <p className="text-sm text-muted-foreground">
        Maximum retry attempts reached. Please{' '}
        <Link
          href="/plans/new"
          className="rounded-sm text-primary underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          create a new plan
        </Link>{' '}
        to try again.
      </p>
    </div>
  );
}
