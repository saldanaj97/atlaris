import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';
import { useId } from 'react';

interface RouteErrorStateProps {
  title: string;
  message: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  actions?: ReactNode;
  className?: string;
}

/**
 * Shared route-level error panel using destructive semantic tokens.
 */
export function RouteErrorState({
  title,
  message,
  onRetry,
  retryLabel = 'Try again',
  actions,
  className,
}: RouteErrorStateProps) {
  const titleId = useId();
  const messageId = useId();

  return (
    <div
      role='alert'
      aria-describedby={messageId}
      aria-labelledby={titleId}
      className={cn(
        'mx-auto flex w-full max-w-[32rem] flex-col items-center justify-center rounded-xl border border-panel-border bg-panel p-4 text-center shadow-none sm:p-6',
        className,
      )}
    >
      <div
        className='mb-4 flex size-11 items-center justify-center rounded-xl border border-danger bg-danger-subtle text-danger'
        aria-hidden='true'
      >
        <AlertTriangle className='size-5' />
      </div>
      <h2 id={titleId} className='mb-2 text-xl font-semibold text-foreground'>
        {title}
      </h2>
      <p
        id={messageId}
        className='mb-5 max-w-md text-sm leading-relaxed text-muted-foreground'
      >
        {message}
      </p>
      {actions ??
        (onRetry ? <Button onClick={onRetry}>{retryLabel}</Button> : null)}
    </div>
  );
}
