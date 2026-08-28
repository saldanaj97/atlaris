import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';

export function RetryAction({
  attempts,
  attemptCap,
  isRetrying,
  isRetryDisabled,
  onRetry,
}: {
  attempts: number;
  attemptCap: number;
  isRetrying: boolean;
  isRetryDisabled: boolean;
  onRetry: () => void;
}) {
  return (
    <Button onClick={onRetry} disabled={isRetryDisabled} className='w-full'>
      {isRetrying ? (
        <>
          <Loader2 className='mr-2 size-4 animate-spin motion-reduce:animate-none' />
          Retrying…
        </>
      ) : (
        <>
          <RefreshCw className='mr-2 size-4' />
          Retry Generation ({attemptCap - attempts} attempts remaining)
        </>
      )}
    </Button>
  );
}

export function ExhaustedRetriesMessage() {
  return (
    <div className='rounded-lg bg-muted p-4 text-center'>
      <p className='text-sm text-muted-foreground'>
        Maximum retry attempts reached. Return to your plans to try again.
      </p>
    </div>
  );
}
