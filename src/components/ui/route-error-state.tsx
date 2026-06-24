import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';

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
  retryLabel = 'Try Again',
  actions,
  className,
}: RouteErrorStateProps) {
  return (
    <div
      role='alert'
      className={cn(
        'mx-auto flex w-full max-w-xl flex-col items-center justify-center rounded-2xl border border-panel-border bg-panel p-6 text-center shadow-sm sm:p-8',
        className,
      )}
    >
      <div
        className='mb-4 flex size-11 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10 text-destructive'
        aria-hidden='true'
      >
        <AlertTriangle className='size-5' />
      </div>
      <h2 className='mb-2 text-xl font-semibold text-foreground'>{title}</h2>
      <p className='mb-5 max-w-md text-sm leading-relaxed text-muted-foreground'>
        {message}
      </p>
      {actions ??
        (onRetry ? <Button onClick={onRetry}>{retryLabel}</Button> : null)}
    </div>
  );
}
