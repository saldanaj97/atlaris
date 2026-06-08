import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
        'flex flex-col items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 p-8 text-center',
        className,
      )}
    >
      <h2 className='mb-2 text-xl font-semibold text-destructive'>{title}</h2>
      <p className='mb-4 max-w-md text-muted-foreground'>{message}</p>
      {actions ??
        (onRetry ? <Button onClick={onRetry}>{retryLabel}</Button> : null)}
    </div>
  );
}
